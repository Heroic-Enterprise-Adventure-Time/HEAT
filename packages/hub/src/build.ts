import { GraphQLError } from "graphql";
import { FACILITIES, buildRefusal, location, nextLevel, type FacilityKind } from "@heat/engine";
import {
  BuildRefused,
  InsufficientBalance,
  TransactionConflict,
  campLevels,
  type Camp,
  type Repository,
} from "./db/repository.js";

/**
 * Building and upgrading a facility (Issue-93, decision 0032): the client
 * names the camp, the facility and the level it is building, so a repeat
 * finds the level built and is answered with the camp, charging nothing. The
 * level's cost and the facilities it needs are the engine's (`nextLevel`),
 * and why it cannot be built is one rule the panel shows too
 * (`buildRefusal`). Building is instant: nothing in the game gates on real
 * time (decision 0031).
 *
 * As with recruiting, the rules are checked here against the camp as read,
 * to give the player a reason, and again in the transaction's conditions,
 * which are what hold under concurrent requests. A request that loses a race
 * reads the camp again: if the level is built, it answers with the camp;
 * otherwise it is refused with the rule that now fails.
 *
 * The refusals: BAD_USER_INPUT (no such camp or facility, or a level that is
 * not the next), MAX_LEVEL, REQUIRES (with `extensions.missing`, each
 * facility and the level it needs), INSUFFICIENT_RESOURCES (with
 * `extensions.short`, each material's amount and the camp's balance), and
 * CONFLICT, when the camp changed and no rule explains the failure.
 */

function refuse(message: string, code: string, extensions: Record<string, unknown> = {}): never {
  throw new GraphQLError(message, { extensions: { code, ...extensions } });
}

/** Refuses the build with the first rule the camp fails, in the order the panel shows them. */
function refuseIfBarred(camp: Camp, kind: FacilityKind): void {
  const refusal = buildRefusal({ levels: campLevels(camp), holdings: camp.holdings }, kind);
  if (refusal) {
    const { code, message, ...extensions } = refusal;
    refuse(message, code, extensions);
  }
}

export async function buildFacility(repo: Repository, playerId: string, locationId: string, kind: string, level: number): Promise<Camp> {
  const at = location(locationId);
  const camp = at && (await repo.camps(playerId)).find((c) => c.location === at.id);
  if (!at || !camp) refuse(`there is no camp of yours at ${locationId}`, "BAD_USER_INPUT");
  const own = [...at.ownFacilities, ...at.buildableFacilities];
  if (!own.includes(kind as FacilityKind)) refuse(`${at.name} has no ${kind} of yours to build`, "BAD_USER_INPUT");
  const facility = kind as FacilityKind;

  const from = campLevels(camp)[facility] ?? 0;
  // A repeat, or a stale page: the level is built already.
  if (from >= level) return camp;
  if (level !== from + 1) refuse(`the ${FACILITIES[facility].name.toLowerCase()} is at level ${from}; level ${level} is not the next`, "BAD_USER_INPUT");
  refuseIfBarred(camp, facility);
  const next = nextLevel(facility, from);
  // refuseIfBarred refuses MAX_LEVEL when there is no next level.
  if (!next) throw new Error(`no level ${from + 1} of ${facility} to build`);

  try {
    await repo.build(playerId, camp, { kind: facility, from, cost: next.cost, requires: next.requires });
  } catch (e) {
    if (!(e instanceof BuildRefused || e instanceof InsufficientBalance || e instanceof TransactionConflict)) throw e;
    const now = await repo.camp(playerId, at.id);
    if ((campLevels(now)[facility] ?? 0) >= level) return now;
    refuseIfBarred(now, facility);
    refuse("the camp changed while building; nothing was built", "CONFLICT");
  }
  return repo.camp(playerId, at.id);
}
