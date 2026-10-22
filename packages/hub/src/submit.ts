import { GraphQLError } from "graphql";
import {
  levelForXp,
  replay,
  warehouseCapacity,
  type AdventureLogEntry,
  type AdventureResult,
  type AdventureTimeline,
  type Material,
  type Reward,
} from "@heat/engine";
import {
  AdventureClosed,
  CampChanged,
  TransactionConflict,
  type AdventureRecord,
  type Hero,
  type HeroOutcome,
  type Repository,
  type Settlement,
} from "./db/repository.js";
import { logger } from "./observability.js";
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
 * 1. The adventure must be the caller's. A settled one answers as it is, so
 *    a repeat after a lost response pays nothing and still gets the result;
 *    a discarded one is refused.
 * 2. Only the version that issued it verifies it. Another is refused with
 *    ENGINE_UPDATED and this deploy's version; the client tries the
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
 *    conditional transaction; a balance that moved in between is read again,
 *    up to SETTLE_ATTEMPTS times.
 */

/** The most entries a log may have: far beyond what a person can click in a stage's time limits. */
export const MAX_OVERRIDES = 2000;
/** Reads and writes of a settlement before it answers CONFLICT. */
export const SETTLE_ATTEMPTS = 3;

/** One entry of the submitted log, as the graph takes it: flat, checked here into the engine's union. */
export interface OverrideInput {
  kind: "UNIT" | "PARTY";
  acceptedAtSimTime: number;
  unitId?: string | null | undefined;
  abilityId?: string | null | undefined;
  order?: "PRESS_ON" | "RETREAT" | null | undefined;
}

function refuse(message: string, code: string, extensions: Record<string, unknown> = {}): never {
  throw new GraphQLError(message, { extensions: { code, ...extensions } });
}

/** The caller's adventure, or NO_SUCH_ADVENTURE: another player's is not said to exist. */
export async function ownAdventure(repo: Repository, playerId: string, adventureId: string): Promise<AdventureRecord> {
  const record = await repo.getAdventure(adventureId);
  if (!record || record.playerId !== playerId) refuse(`no adventure ${adventureId}`, "NO_SUCH_ADVENTURE");
  return record;
}

/** The submitted log as the engine's entries, or BAD_USER_INPUT. */
export function toLog(record: AdventureRecord, inputs: readonly OverrideInput[]): AdventureLogEntry[] {
  if (inputs.length > MAX_OVERRIDES) refuse(`a log holds at most ${MAX_OVERRIDES} entries`, "BAD_USER_INPUT");
  const party = new Set(record.snapshot.heroes.map((h) => h.heroId));
  return inputs.map((input, i): AdventureLogEntry => {
    const at = input.acceptedAtSimTime;
    if (!Number.isSafeInteger(at) || at < 0) refuse(`entry ${i}: the time is a whole number of milliseconds`, "BAD_USER_INPUT");
    if (input.kind === "PARTY") {
      if (!input.order) refuse(`entry ${i}: a party entry names an order`, "BAD_USER_INPUT");
      return { kind: "party", acceptedAtSimTime: at, order: input.order === "RETREAT" ? "retreat" : "press-on" };
    }
    if (!input.unitId || !party.has(input.unitId)) refuse(`entry ${i}: a unit entry names a hero of the party`, "BAD_USER_INPUT");
    if (!input.abilityId || input.abilityId.length > 64) refuse(`entry ${i}: a unit entry names an ability`, "BAD_USER_INPUT");
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
 * never lowered; the dead.
 */
export function settlement(
  record: AdventureRecord,
  result: AdventureResult,
  warehouseLevel: number,
  balances: ReadonlyMap<string, number>,
  heroes: readonly Hero[],
): Settlement {
  const cap = warehouseCapacity(warehouseLevel);
  const holdings = [...byMaterial(result.rewards)].map(([material, amount]) => {
    const read = balances.get(material) ?? null;
    const credit = Math.min(amount, Math.max(0, cap - (read ?? 0)));
    return { material, read, credit, lost: amount - credit };
  });
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
    warehouseLevel,
    holdings,
    survivors,
    dead: heroes.filter((h) => dead.has(h.id)),
    result: {
      outcome: result.outcome,
      endedAtMs: result.endedAtMs,
      reachedStage: result.reachedStage,
      stages: [...result.stages],
      rewards: [...byMaterial(result.rewards)].map(([material, amount]) => ({ material, amount })),
      credited: holdings.filter((h) => h.credit > 0).map((h) => ({ material: h.material, amount: h.credit })),
      lost: holdings.filter((h) => h.lost > 0).map((h) => ({ material: h.material, amount: h.lost })),
      heroes: outcomes,
    },
  };
}

/** The adventure as it now stands, after another request closed it. */
async function closed(repo: Repository, adventureId: string): Promise<AdventureRecord> {
  const now = await repo.getAdventure(adventureId);
  if (now?.status === "SETTLED") return now;
  if (now?.status === "DISCARDED") refuse("the adventure was discarded", "ADVENTURE_DISCARDED");
  refuse("the adventure changed while settling; nothing was settled", "CONFLICT");
}

export async function submitAdventure(
  repo: Repository,
  timelines: Timelines,
  playerId: string,
  version: string,
  adventureId: string,
  overrides: readonly OverrideInput[],
  now = new Date(),
): Promise<AdventureRecord> {
  const record = await ownAdventure(repo, playerId, adventureId);
  if (record.status === "SETTLED") return record;
  if (record.status === "DISCARDED") refuse("the adventure was discarded", "ADVENTURE_DISCARDED");
  if (record.version !== version) {
    refuse("the adventure was issued by another version of the game", "ENGINE_UPDATED", { version });
  }

  const log = toLog(record, overrides);
  const verified = replay(record.snapshot, record.seed, log);
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
    if (body === undefined) refuse("the stored timeline could not be read; nothing was settled", "CONFLICT");
    const stored = JSON.parse(body) as AdventureTimeline;
    result = replay(record.snapshot, record.seed, stored.overrideLog).result;
  }

  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    const camp = await repo.camp(playerId, record.location);
    const balances = new Map(camp.holdings.map((h) => [h.material, h.balance]));
    const heroes = await Promise.all(record.snapshot.heroes.map((h) => repo.getHero(playerId, h.heroId)));
    if (heroes.some((h) => h?.adventureId !== adventureId)) return closed(repo, adventureId);
    const writes = settlement(record, result, camp.warehouseLevel, balances, heroes as Hero[]);
    try {
      await repo.settle(playerId, writes, now);
      return { ...record, status: "SETTLED", result: writes.result, settledAt: now.toISOString() };
    } catch (e) {
      if (e instanceof AdventureClosed) return closed(repo, adventureId);
      if (!(e instanceof CampChanged || e instanceof TransactionConflict)) throw e;
    }
  }
  refuse("the camp kept changing while settling; nothing was settled", "CONFLICT");
}
