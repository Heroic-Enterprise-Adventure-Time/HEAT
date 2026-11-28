import { clamp, uniq } from "es-toolkit";

import {
  ADVENTURE_CONTENT,
  type AdventureContent,
  type AdventureLogEntry,
  type AdventureResult,
  type AdventureTimeline,
  levelForXp,
  type Material,
  replay,
  type Reward,
  warehouseCapacity,
} from "@heat/engine";

import { countingConflicts, pause } from "./conflict.js";
import {
  AdventureClosed,
  type AdventureRecord,
  type Camp,
  CampChanged,
  type CappedCredit,
  type Caravan,
  type CaravanSettlement,
  type Hero,
  type HeroOutcome,
  type Repository,
  type Settlement,
  TransactionConflict,
} from "./db/repository.js";
import { logger } from "./observability.js";
import { AdventureDiscarded, badInput, Conflict, EngineUpdated } from "./refusals.js";
import type { Timelines } from "./timelines.js";

/**
 * Submitting an adventure (overview, "The adventure loop"; decision 0030).
 * The browser sends only its override log. The hub replays it from the
 * snapshot and seed it issued, with the engine of the version that issued
 * them, writes the timeline to the replay bucket, and settles in one
 * transaction. The replay is the result: nothing the client says about the
 * outcome is read, because it says nothing.
 *
 * In order:
 *
 * 1. The adventure must be the caller's; another player's is not said to
 *    exist (BAD_USER_INPUT). A settled one answers as it is, so a repeat
 *    after a lost response pays nothing and still gets the result; a
 *    discarded one is refused with AdventureDiscarded.
 * 2. Only the version that issued it verifies it. Another is refused with
 *    EngineUpdated and this deploy's version; the client tries the
 *    previous route, and the same refusal there means the adventure is too
 *    old and the client asks for the discard.
 * 3. The log is checked for shape and replayed. A log that differs from the
 *    one the replay keeps (an entry that changed nothing, a moved stamp) is
 *    logged, not refused: a client that resumed with a newer engine can
 *    submit such a log honestly, and the issuing version's replay is the
 *    result either way.
 * 4. The timeline is written once, before the transaction, so a settled
 *    record always has one. If one is already stored, by a submit that lost
 *    its transaction or raced this one, that timeline's log is replayed
 *    instead, so the record's result and the stored replay agree.
 * 5. Settlement reads the camp, its holdings and the party, computes the
 *    capped credits, the XP and the deaths, and writes them in one
 *    conditional transaction, with the unlocks the replay says the run
 *    earned, and for a caravan its destination camp's writes: the cargo
 *    delivered up to its cap and the heroes who land, its riders with them
 *    (decision 0059, Issue-391); a balance that moved in between is read
 *    again, up to SETTLE_ATTEMPTS times, then the refusal is Conflict.
 *
 * The content the replay reads is the engine's, as the engine of the issuing
 * version has it; a test passes its own, as it passes a store or a version,
 * to settle a job the game does not have: no caller outside a test passes
 * one, and nothing of a request reaches it.
 */

/** The most entries a log may have: far beyond what a person can click in a stage's time limits. */
export const MAX_OVERRIDES = 2000;
/** The longest ability id a log entry may name: far beyond any in the content, so that a log cannot carry text. */
export const MAX_ABILITY_ID = 64;
/** Reads and writes of a settlement before it answers Conflict. */
export const SETTLE_ATTEMPTS = 3;

/** One entry of the submitted log, as the graph takes it: flat, checked here into the engine's union. */
/** The log's two closed sets on the wire, which the API's enums read (typescript.md, rule 18). */
export const OVERRIDE_KINDS = ["UNIT", "PARTY"] as const;
export const PARTY_ORDERS = ["PRESS_ON", "RETREAT"] as const;

export interface OverrideInput {
  kind: (typeof OVERRIDE_KINDS)[number];
  acceptedAtSimTime: number;
  unitId?: string | null | undefined;
  abilityId?: string | null | undefined;
  order?: (typeof PARTY_ORDERS)[number] | null | undefined;
}

/** The caller's adventure, or BAD_USER_INPUT: another player's is not said to exist. */
export async function ownAdventure(repo: Repository, playerId: string, adventureId: string): Promise<AdventureRecord> {
  const record = await repo.getAdventure(adventureId);
  if (record?.playerId !== playerId) badInput(`no adventure ${adventureId}`);
  return record;
}

/**
 * The submitted log as the engine's entries, or BAD_USER_INPUT. The input type
 * has checked its length, each time and each ability id's length
 * (`SubmitAdventureInput`); what is left needs the entry's kind or the party.
 */
export function toLog(record: AdventureRecord, inputs: readonly OverrideInput[]): AdventureLogEntry[] {
  const party = new Set(record.snapshot.heroes.map((h) => h.heroId));
  return inputs.map((input, i): AdventureLogEntry => {
    const at = input.acceptedAtSimTime;
    if (input.kind === "PARTY") {
      if (!input.order) badInput(`entry ${i}: a party entry names an order`);
      return { kind: "party", acceptedAtSimTime: at, order: input.order === "RETREAT" ? "retreat" : "press-on" };
    }
    if (!input.unitId || !party.has(input.unitId)) badInput(`entry ${i}: a unit entry names a hero of the party`);
    if (!input.abilityId) badInput(`entry ${i}: a unit entry names an ability`);
    return {
      kind: "unit",
      acceptedAtSimTime: at,
      unitId: input.unitId,
      override: { kind: "force-action", abilityId: input.abilityId },
    };
  });
}

/** The rewards summed by material, in the order they first appear. */
function byMaterial(rewards: readonly Reward[]): Map<Material, number> {
  const sums = new Map<Material, number>();
  for (const r of rewards) sums.set(r.material, (sums.get(r.material) ?? 0) + r.amount);
  return sums;
}

/**
 * Settlement's writes from what was read: each reward credited up to the
 * warehouse's cap, the rest lost (overview, "Camps, heroes and resources");
 * each survivor's XP added and its level from the content's thresholds,
 * never lowered; the dead; and the unlocks the run earned, as the engine's
 * result lists them, with nothing read of what the player holds (decision
 * 0059). A caravan's riders are no part of the result, which is the party's:
 * they gain nothing and none dies, and they are carried as read, to land or
 * to be let go (Issue-391).
 */
export function settlement(
  record: AdventureRecord,
  result: AdventureResult,
  warehouseLevel: number,
  balances: ReadonlyMap<string, number>,
  heroes: readonly Hero[],
  destination?: Camp,
  riders: readonly Hero[] = [],
): Settlement {
  const holdings = cappedCredits(result.rewards, warehouseLevel, balances);
  if (record.caravan && !destination) throw new Error("a caravan is settled with its destination camp as read");
  const caravan = record.caravan && destination ? caravanSettlement(record.caravan, result, destination) : undefined;
  const dead = new Set(result.dead);
  const gained = new Map(result.xp.map((x) => [x.heroId, x.xp]));
  const health = new Map(result.health.map((h) => [h.heroId, h.health]));
  const survivors = heroes
    .filter((h) => !dead.has(h.id))
    .map((hero) => {
      const xp = hero.xp + (gained.get(hero.id) ?? 0);
      return { hero, xp, level: Math.max(hero.level, levelForXp(xp)) };
    });
  const outcomes: HeroOutcome[] = heroes.map((hero) => {
    const survivor = survivors.find((s) => s.hero.id === hero.id);
    return {
      heroId: hero.id,
      xpGained: survivor ? gained.get(hero.id) ?? 0 : 0,
      xp: survivor?.xp ?? hero.xp,
      level: survivor?.level ?? hero.level,
      health: health.get(hero.id) ?? 0,
      dead: !survivor,
    };
  });
  return {
    adventureId: record.adventureId,
    location: record.location,
    jobId: record.jobId,
    warehouseLevel,
    holdings,
    survivors,
    dead: heroes.filter((h) => dead.has(h.id)),
    riders: [...riders],
    result: {
      outcome: result.outcome,
      endedAtMs: result.endedAtMs,
      reachedStage: result.reachedStage,
      stages: [...result.stages],
      rewards: [...byMaterial(result.rewards)].map(([material, amount]) => ({ material, amount })),
      credited: holdings.filter((h) => h.credit > 0).map((h) => ({ material: h.material, amount: h.credit })),
      lost: holdings.filter((h) => h.lost > 0).map((h) => ({ material: h.material, amount: h.lost })),
      heroes: outcomes,
      // Each once: settlement writes an item for each, and a transaction touches an item once.
      unlocks: uniq(result.unlocks),
      delivered: (caravan?.deliveries ?? []).filter((d) => d.credit > 0).map((d) => ({ material: d.material, amount: d.credit })),
      deliveryLost: (caravan?.deliveries ?? []).filter((d) => d.lost > 0).map((d) => ({ material: d.material, amount: d.lost })),
    },
    caravan,
  };
}

/** Each resource credited up to the warehouse's cap at a level, from the balances read, the rest lost. */
export function cappedCredits(rewards: readonly Reward[], warehouseLevel: number, balances: ReadonlyMap<string, number>): CappedCredit[] {
  const cap = warehouseCapacity(warehouseLevel);
  return [...byMaterial(rewards)].map(([material, amount]) => {
    const read = balances.get(material) ?? null;
    const credit = clamp(cap - (read ?? 0), 0, amount);
    return { material, read, credit, lost: amount - credit };
  });
}

/**
 * A caravan's part of settlement (decision 0059), from the destination camp
 * as read. On arrival the heroes marked to stay land, alive or dead, the
 * riders among them (Issue-391), and the cargo is credited there up to its
 * warehouse's cap if the cart stands; a broken cart's cargo is lost whole and
 * credits nothing, and a retreat or a defeat lands nobody and lets go of the
 * slots held for them, so a rider is home, and alive, after a party all down.
 */
export function caravanSettlement(caravan: Caravan, result: AdventureResult, destination: Camp): CaravanSettlement {
  const arrived = result.outcome === "complete";
  const balances = new Map(destination.holdings.map((h) => [h.material, h.balance]));
  return {
    destination: caravan.destination,
    warehouseLevel: destination.warehouseLevel,
    stored: destination.stored,
    deliveries: arrived && result.delivered === true ? cappedCredits(caravan.cargo, destination.warehouseLevel, balances) : [],
    landed: arrived ? [...caravan.staying] : [],
    released: arrived ? 0 : caravan.staying.length,
  };
}

/** The adventure as it now stands, after another request closed it. */
async function closed(repo: Repository, adventureId: string): Promise<AdventureRecord> {
  const now = await repo.getAdventure(adventureId);
  if (now?.status === "SETTLED") return now;
  if (now?.status === "DISCARDED") throw new AdventureDiscarded("the adventure was discarded");
  throw new Conflict("the adventure changed while settling; nothing was settled");
}

export function submitAdventure(
  repo: Repository,
  timelines: Timelines,
  playerId: string,
  version: string,
  adventureId: string,
  overrides: readonly OverrideInput[],
  now = new Date(),
  content: AdventureContent = ADVENTURE_CONTENT,
): Promise<AdventureRecord> {
  return countingConflicts("settle", () => submitOnce(repo, timelines, playerId, version, adventureId, overrides, now, content));
}

async function submitOnce(
  repo: Repository,
  timelines: Timelines,
  playerId: string,
  version: string,
  adventureId: string,
  overrides: readonly OverrideInput[],
  now: Date,
  content: AdventureContent,
): Promise<AdventureRecord> {
  const record = await ownAdventure(repo, playerId, adventureId);
  if (record.status === "SETTLED") return record;
  if (record.status === "DISCARDED") throw new AdventureDiscarded("the adventure was discarded");
  if (record.version !== version) throw new EngineUpdated("the adventure was issued by another version of the game", version);

  const log = toLog(record, overrides);
  const verified = replay(record.snapshot, record.seed, log, content);
  if (JSON.stringify(verified.timeline.overrideLog) !== JSON.stringify(log)) {
    logger.warn("submitted log differs from the replay's", {
      adventureId,
      submitted: log.length,
      kept: verified.timeline.overrideLog.length,
    });
  }

  let result = verified.result;
  if (!(await timelines.putIfAbsent(adventureId, JSON.stringify(verified.timeline)))) {
    const body = await timelines.get(adventureId);
    if (body === undefined) throw new Conflict("the stored timeline could not be read; nothing was settled");
    const stored = JSON.parse(body) as AdventureTimeline;
    result = replay(record.snapshot, record.seed, stored.overrideLog, content).result;
  }

  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    const camp = await repo.camp(playerId, record.location);
    const destination = record.caravan ? await repo.camp(playerId, record.caravan.destination) : undefined;
    const balances = new Map(camp.holdings.map((h) => [h.material, h.balance]));
    const onIt = async (heroIds: readonly string[]): Promise<Hero[] | undefined> => {
      const read = await Promise.all(heroIds.map((id) => repo.getHero(playerId, id)));
      const marked = read.filter((h): h is Hero => h?.adventureId === adventureId);
      return marked.length === read.length ? marked : undefined;
    };
    const heroes = await onIt(record.snapshot.heroes.map((h) => h.heroId));
    // A caravan's riders are marked as the party is, and are read as it is: one no longer on this adventure means it has closed.
    const riders = await onIt((record.caravan?.riders ?? []).map((r) => r.heroId));
    if (!heroes || !riders) return closed(repo, adventureId);
    const writes = settlement(record, result, camp.warehouseLevel, balances, heroes, destination, riders);
    try {
      await repo.settle(playerId, writes, now);
      return { ...record, status: "SETTLED", result: writes.result, settledAt: now.toISOString() };
    } catch (e) {
      if (e instanceof AdventureClosed) return closed(repo, adventureId);
      if (!(e instanceof CampChanged || e instanceof TransactionConflict)) throw e;
      // Another transaction is still committing: wait for it before reading again (conflict.ts).
      if (e instanceof TransactionConflict && attempt + 1 < SETTLE_ATTEMPTS) await pause(attempt + 1, "settle");
    }
  }
  throw new Conflict("the camp kept changing while settling; nothing was settled");
}
