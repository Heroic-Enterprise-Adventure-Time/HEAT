import { constantCase, uniq } from "es-toolkit";
import { GraphQLError } from "graphql";
import * as z from "zod/mini";

import {
  ADVENTURE_OUTCOMES,
  type AdventureSnapshot,
  FACILITY_KINDS,
  hallCapacity,
  type Job,
  JOBS,
  location,
  MATERIALS,
  MAX_PARTY,
  type Requirement,
  type Reward,
  type SnapshotHero,
  STAGE_ENDINGS,
  STAGE_KINDS,
  type StageResult,
  UNIT_TYPES,
  type UnitStats,
  warehouseCapacity,
} from "@heat/engine";

import { buildFacility } from "../build.js";
import { callerId } from "../context.js";
import { type AdventureRecord, type Camp, campLevels, type Hero, type HeroOutcome, type Holding, type Player, type SettledResult } from "../db/repository.js";
import { discardAdventure } from "../discard.js";
import { recruitHero } from "../recruit.js";
import {
  AdventureDiscarded,
  AdventureOpen,
  AdventureSettled,
  AdventureVerifiable,
  Conflict,
  EngineUpdated,
  HallFull,
  HallLevel,
  HeroAdventuring,
  HeroDead,
  HeroNotHere,
  HeroRetired,
  InsufficientResources,
  MaxLevel,
  type Refusal,
  Requires,
  type Shortfall,
} from "../refusals.js";
import { retireHero } from "../retire.js";
import { heroesSeenAt, type Sighting } from "../seen.js";
import { startAdventure } from "../start.js";
import { MAX_ABILITY_ID, MAX_OVERRIDES, type OverrideInput, submitAdventure } from "../submit.js";
import { builder } from "./builder.js";

/**
 * The graph: a public player; their camps, heroes and the open adventure
 * behind the `self` scope; other players' heroes seen at a location, by
 * their public fields only; a settled adventure, with its result and its
 * timeline; the deploy's version; joining, recruiting, retiring, building, and an
 * adventure started from the job board or a facility, submitted for verification and
 * settlement, or discarded when no deploy can verify it.
 *
 * The shape is docs/standards/graphql.md, rules 4 to 6: an id the hub issues is an ID, a
 * timestamp a DateTime, a set the engine closes an enum; a mutation takes
 * one input object and answers a result union, its success wrapping what it
 * changed and each refusal an object type implementing Error (Issue-155,
 * decision 0038). Its inputs carry their shape: a scalar where the type can
 * say it, a zod schema where it cannot (rules 4 and 14; decision 0039).
 */

// --- Enums: the engine's closed sets, their values in the API's UPPER_CASE,
// mapped onto the engine's own strings so that nothing else changes. ---

function enumOf<T extends string>(name: string, description: string, values: readonly T[]) {
  const named: Record<string, { value: T }> = Object.fromEntries(values.map((value) => [constantCase(value), { value }]));
  return builder.enumType(name, { description, values: named });
}

const UnitTypeRef = enumOf("UnitType", "The unit types, the engine's `UnitType`: what a hero is and what the hall recruits.", UNIT_TYPES);
const MaterialRef = enumOf("Material", "The resources, the engine's `Material`: there is no currency.", MATERIALS);
const FacilityKindRef = enumOf("FacilityKind", "A camp's own facilities, the engine's `FacilityKind`, those every camp has and those it may build.", FACILITY_KINDS);
const AdventureOutcomeRef = enumOf(
  "AdventureOutcome",
  "How an adventure ended, the engine's `AdventureOutcome`: complete; retreat, ordered or forced by a time limit; defeat, the whole party down.",
  ADVENTURE_OUTCOMES,
);
const StageKindRef = enumOf("StageKind", "What a stage of a job is, the engine's `StageKind`.", STAGE_KINDS);
const StageEndingRef = enumOf("StageEnding", "How a stage ended, the engine's `StageEnding`: DONE for travel and arrive; the rest are a battle's.", STAGE_ENDINGS);

const HeroStatusRef = builder.enumType("HeroStatus", {
  description: "Alive or dead at the camp, or retired for good.",
  values: ["ALIVE", "DEAD", "RETIRED"] as const,
});

const AdventureStatusRef = builder.enumType("AdventureStatus", {
  description: "Open while the player plays it; settled once the hub verified it and paid out; discarded when no deploy could verify it any more.",
  values: ["OPEN", "SETTLED", "DISCARDED"] as const,
});

// --- Object types. ---

const HoldingRef = builder.objectRef<Holding>("Holding").implement({
  description: "A camp's stock of one resource.",
  fields: (t) => ({
    material: t.expose("material", { type: MaterialRef }),
    balance: t.exposeInt("balance"),
  }),
});

const FacilityLevelRef = builder.objectRef<{ kind: (typeof FACILITY_KINDS)[number]; level: number }>("FacilityLevel").implement({
  description: "One of a camp's own facilities and its level.",
  fields: (t) => ({
    kind: t.expose("kind", { type: FacilityKindRef }),
    level: t.exposeInt("level"),
  }),
});

const CampRef = builder.objectRef<Camp>("Camp").implement({
  description: "One player's view of one location: their facilities, resources and heroes there.",
  fields: (t) => ({
    location: t.exposeID("location", { description: "The location's id in the static content." }),
    name: t.string({ resolve: (camp) => location(camp.location)?.name ?? camp.location }),
    hallLevel: t.exposeInt("hallLevel"),
    warehouseLevel: t.exposeInt("warehouseLevel"),
    heroCapacity: t.int({
      description: "Active heroes the heroes hall holds at its level.",
      resolve: (camp) => hallCapacity(camp.hallLevel),
    }),
    resourceCapacity: t.int({
      description: "Stock of each resource the warehouse holds at its level.",
      resolve: (camp) => warehouseCapacity(camp.warehouseLevel),
    }),
    activeHeroes: t.exposeInt("activeHeroes", { description: "Living and dead heroes; retired ones are not active." }),
    livingHeroes: t.exposeInt("livingHeroes"),
    holdings: t.expose("holdings", { type: [HoldingRef] }),
    facilities: t.field({
      type: [FacilityLevelRef],
      description: "Each of the camp's own facilities, those every camp has and those it may build, with its level: 0 for one not built.",
      resolve: (camp) => {
        const at = location(camp.location);
        const levels = campLevels(camp);
        return [...(at?.ownFacilities ?? []), ...(at?.buildableFacilities ?? [])].map((kind) => ({ kind, level: levels[kind] ?? 0 }));
      },
    }),
  }),
});

const HeroRef = builder.objectRef<Hero>("Hero").implement({
  description: "A hero, drawn by the hub at recruitment: its sprite set and name are never the client's choice.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    unitType: t.expose("unitType", { type: UnitTypeRef }),
    spriteSet: t.exposeString("spriteSet", { description: "The set's directory under art/heroes/." }),
    location: t.exposeID("location", { description: "The location's id in the static content." }),
    recruitedAt: t.expose("recruitedAt", { type: "DateTime" }),
    level: t.exposeInt("level"),
    xp: t.exposeInt("xp"),
    status: t.field({ type: HeroStatusRef, resolve: (hero) => hero.status }),
    retiredAt: t.expose("retiredAt", { type: "DateTime", nullable: true }),
  }),
});

const SeenHeroRef = builder.objectRef<Sighting>("SeenHero").implement({
  description: "Another player's hero seen at a location: its public fields only, and nothing that says whose it is (decision 0029).",
  fields: (t) => ({
    id: t.exposeID("heroId"),
    name: t.exposeString("name"),
    unitType: t.expose("unitType", { type: UnitTypeRef }),
    spriteSet: t.exposeString("spriteSet", { description: "The set's directory under art/heroes/." }),
    level: t.exposeInt("level"),
  }),
});

const JobRef = builder.objectRef<Job>("Job").implement({
  description: "A job a location posts, on its job board or at a facility, from the static content; the client reads its stages from the engine it loaded.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description"),
    location: t.exposeID("location", { description: "The location that posts it." }),
    facility: t.field({
      type: FacilityKindRef,
      nullable: true,
      description: "The own facility that posts it, which the camp must have built to start it; null for a job on the job board.",
      resolve: (job) => job.facility ?? null,
    }),
  }),
});

const UnitStatsRef = builder.objectRef<UnitStats>("UnitStats").implement({
  description: "A unit's numbers in battle.",
  fields: (t) => ({
    maxHealth: t.exposeInt("maxHealth"),
    speed: t.exposeInt("speed", { description: "Turns per ten seconds." }),
    damage: t.exposeInt("damage"),
    gathering: t.exposeInt("gathering", { description: "Work done to a resource node by a gather ability." }),
  }),
});

const SnapshotHeroRef = builder.objectRef<SnapshotHero>("SnapshotHero").implement({
  description: "A hero as the adventure took it at the start: its effective numbers, frozen for the run.",
  fields: (t) => ({
    heroId: t.exposeID("heroId"),
    unitType: t.expose("unitType", { type: UnitTypeRef }),
    name: t.exposeString("name"),
    spriteSet: t.exposeString("spriteSet"),
    level: t.exposeInt("level"),
    stats: t.expose("stats", { type: UnitStatsRef }),
  }),
});

const SnapshotRef = builder.objectRef<AdventureSnapshot>("Snapshot").implement({
  description: "The frozen snapshot the hub issued at the start, the engine's AdventureSnapshot field for field: the party's effective numbers and the job by id (decision 0030).",
  fields: (t) => ({
    version: t.exposeString("version"),
    jobId: t.exposeID("jobId"),
    heroes: t.expose("heroes", { type: [SnapshotHeroRef] }),
  }),
});

const RewardRef = builder.objectRef<Reward>("Reward").implement({
  description: "An amount of one resource.",
  fields: (t) => ({
    material: t.expose("material", { type: MaterialRef }),
    amount: t.exposeInt("amount"),
  }),
});

const StageResultRef = builder.objectRef<StageResult>("StageResult").implement({
  description: "How one stage the party entered ended.",
  fields: (t) => ({
    stage: t.exposeInt("stage"),
    kind: t.expose("kind", { type: StageKindRef }),
    ended: t.expose("ended", { type: StageEndingRef }),
    startedAtMs: t.exposeInt("startedAtMs"),
    endedAtMs: t.exposeInt("endedAtMs"),
  }),
});

const HeroOutcomeRef = builder.objectRef<HeroOutcome>("HeroOutcome").implement({
  description: "One hero of the party at settlement.",
  fields: (t) => ({
    heroId: t.exposeID("heroId"),
    xpGained: t.exposeInt("xpGained"),
    xp: t.exposeInt("xp", { description: "The hero's XP after settlement." }),
    level: t.exposeInt("level", { description: "The hero's level after settlement." }),
    health: t.exposeInt("health", { description: "Health at the end of the adventure." }),
    dead: t.exposeBoolean("dead"),
  }),
});

const AdventureResultRef = builder.objectRef<SettledResult>("AdventureResult").implement({
  description: "What the hub's replay found and settlement wrote: how each stage ended, the rewards, what the warehouse took and what its cap lost, and each hero's XP and fate.",
  fields: (t) => ({
    outcome: t.expose("outcome", { type: AdventureOutcomeRef }),
    endedAtMs: t.exposeInt("endedAtMs"),
    reachedStage: t.exposeInt("reachedStage"),
    stages: t.expose("stages", { type: [StageResultRef] }),
    rewards: t.expose("rewards", { type: [RewardRef], description: "What the run yielded." }),
    credited: t.expose("credited", { type: [RewardRef], description: "What went into the warehouse." }),
    lost: t.expose("lost", { type: [RewardRef], description: "What the warehouse's cap turned away." }),
    heroes: t.expose("heroes", { type: [HeroOutcomeRef] }),
  }),
});

const AdventureRef = builder.objectRef<AdventureRecord>("Adventure").implement({
  description: "An adventure as the hub issued it: what the client needs to play it with the seed, and once settled its result and its timeline.",
  fields: (t) => ({
    id: t.exposeID("adventureId"),
    seed: t.exposeString("seed"),
    startedAt: t.expose("startedAt", { type: "DateTime" }),
    location: t.exposeID("location", { description: "The location's id in the static content." }),
    job: t.field({
      type: JobRef,
      resolve: (adventure) => {
        const job = Object.hasOwn(JOBS, adventure.jobId) ? JOBS[adventure.jobId as keyof typeof JOBS] : undefined;
        // A job this version does not know means the adventure is another version's.
        if (!job) throw new GraphQLError(`no job ${adventure.jobId} in this version`, { extensions: { code: "NO_SUCH_JOB" } });
        return job;
      },
    }),
    snapshot: t.expose("snapshot", { type: SnapshotRef }),
    version: t.exposeString("version", { description: "The deploy that issued the adventure, and the only one that verifies it." }),
    status: t.field({ type: AdventureStatusRef, resolve: (adventure) => adventure.status }),
    result: t.field({ type: AdventureResultRef, nullable: true, resolve: (adventure) => adventure.result }),
    timeline: t.field({
      type: "JSON",
      nullable: true,
      description: "The timeline the hub's replay wrote at settlement, the engine's AdventureTimeline, display only: any version of the client plays it. Null until the adventure is settled.",
      resolve: async (adventure, _args, ctx) => {
        if (adventure.status !== "SETTLED") return null;
        const body = await ctx.timelines.get(adventure.adventureId);
        return body === undefined ? null : (JSON.parse(body) as unknown);
      },
    }),
  }),
});

const PlayerRef = builder.objectRef<Player>("Player").implement({
  description: "A player: the id and name anyone may read, and the camps, heroes and open adventure only the player may.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    camps: t.field({
      type: [CampRef],
      nullable: true,
      description: "Private: only the player may read their own camps. Null, with an error on this field, for anyone else.",
      authScopes: (player) => ({ self: player.id }),
      resolve: (player, _args, ctx) => ctx.repo.camps(player.id),
    }),
    heroes: t.field({
      type: [HeroRef],
      nullable: true,
      description: "Private: only the player may read their own heroes.",
      authScopes: (player) => ({ self: player.id }),
      resolve: (player, _args, ctx) => ctx.repo.heroes(player.id),
    }),
    openAdventure: t.field({
      type: AdventureRef,
      nullable: true,
      authScopes: (player) => ({ self: player.id }),
      resolve: async (player, _args, ctx) => {
        const open = await ctx.repo.openAdventure(player.id);
        return open ? ctx.repo.getAdventure(open.adventureId) : undefined;
      },
    }),
  }),
});

// --- The refusals, as data: an Error interface and one object type per
// refusal class (src/refusals.ts), shared by the unions that list them. ---

const ErrorInterface = builder.interfaceRef<Refusal>("Error").implement({
  description: "A refusal: the game's rule the request failed, in the player's words. Every refusal type implements it; the type's name says which rule, and its own fields say what the client needs.",
  fields: (t) => ({
    message: t.exposeString("message", { description: "In the player's words; the client may show it as it is." }),
  }),
});

const ShortfallRef = builder.objectRef<Shortfall>("Shortfall").implement({
  description: "One resource the camp is short of: what the thing costs and what the camp has.",
  fields: (t) => ({
    material: t.expose("material", { type: MaterialRef }),
    amount: t.exposeInt("amount", { description: "The amount the thing costs." }),
    balance: t.exposeInt("balance", { description: "The camp's balance." }),
  }),
});

const RequirementRef = builder.objectRef<Requirement>("Requirement").implement({
  description: "A facility the camp needs first, at this level or above.",
  fields: (t) => ({
    kind: t.expose("kind", { type: FacilityKindRef }),
    level: t.exposeInt("level"),
  }),
});

builder.objectType(HallLevel, {
  name: "HallLevel",
  description: "The unit type needs a higher heroes hall.",
  interfaces: [ErrorInterface],
  fields: (t) => ({ level: t.exposeInt("hallLevel", { description: "The hall level the unit type needs." }) }),
});
builder.objectType(HallFull, {
  name: "HallFull",
  description: "The heroes hall holds no more active heroes at its level.",
  interfaces: [ErrorInterface],
});
builder.objectType(InsufficientResources, {
  name: "InsufficientResources",
  description: "The camp cannot pay for it.",
  interfaces: [ErrorInterface],
  fields: (t) => ({ short: t.expose("short", { type: [ShortfallRef], description: "Each resource the camp is short of." }) }),
});
builder.objectType(MaxLevel, {
  name: "MaxLevel",
  description: "The facility is at its highest level at this location.",
  interfaces: [ErrorInterface],
});
builder.objectType(Requires, {
  name: "Requires",
  description: "Another facility is needed first.",
  interfaces: [ErrorInterface],
  fields: (t) => ({ missing: t.expose("missing", { type: [RequirementRef], description: "Each facility and the level it needs." }) }),
});
builder.objectType(Conflict, {
  name: "Conflict",
  description: "The camp or the party changed while the request ran, and no rule explains the failure. Nothing was changed; try again.",
  interfaces: [ErrorInterface],
});
builder.objectType(AdventureOpen, {
  name: "AdventureOpen",
  description: "The player's one adventure is open (decision 0003).",
  interfaces: [ErrorInterface],
  fields: (t) => ({ adventureId: t.exposeID("adventureId", { description: "The open one, which the client reads from me.openAdventure." }) }),
});
builder.objectType(HeroDead, {
  name: "HeroDead",
  description: "A hero of the party is dead.",
  interfaces: [ErrorInterface],
  fields: (t) => ({ heroId: t.exposeID("heroId", { description: "The hero the refusal is about." }) }),
});
builder.objectType(HeroRetired, {
  name: "HeroRetired",
  description: "A hero of the party has retired.",
  interfaces: [ErrorInterface],
  fields: (t) => ({ heroId: t.exposeID("heroId", { description: "The hero the refusal is about." }) }),
});
builder.objectType(HeroNotHere, {
  name: "HeroNotHere",
  description: "A hero of the party is not at this camp.",
  interfaces: [ErrorInterface],
  fields: (t) => ({ heroId: t.exposeID("heroId", { description: "The hero the refusal is about." }) }),
});
builder.objectType(HeroAdventuring, {
  name: "HeroAdventuring",
  description: "The hero is on an adventure: it can neither set out again nor retire until the adventure is settled.",
  interfaces: [ErrorInterface],
  fields: (t) => ({ heroId: t.exposeID("heroId", { description: "The hero the refusal is about." }) }),
});
builder.objectType(AdventureDiscarded, {
  name: "AdventureDiscarded",
  description: "The adventure was discarded: no deploy could verify it, and nothing was credited.",
  interfaces: [ErrorInterface],
});
builder.objectType(AdventureSettled, {
  name: "AdventureSettled",
  description: "The adventure is settled, so it cannot be discarded.",
  interfaces: [ErrorInterface],
});
builder.objectType(EngineUpdated, {
  name: "EngineUpdated",
  description: "Another version of the game issued the adventure, so this deploy cannot verify it: try /previous/graphql, and discard it when that deploy says the same (decision 0030).",
  interfaces: [ErrorInterface],
  fields: (t) => ({ version: t.exposeString("version", { description: "This deploy's version." }) }),
});
builder.objectType(AdventureVerifiable, {
  name: "AdventureVerifiable",
  description: "The adventure can still be submitted, so it is not discarded: a player who dislikes how a run is going finishes it.",
  interfaces: [ErrorInterface],
  fields: (t) => ({ version: t.exposeString("version", { description: "The version that issued the adventure and still verifies it." }) }),
});

/** The errors option of a mutation: its result union, its success type wrapping what it changed, and the refusals it lists. */
function answers(verb: string, changed: { field: string; what: string }, types: (new (...args: never[]) => Refusal)[]) {
  return {
    types,
    union: {
      name: `${verb}Result`,
      description: `What ${verb[0]?.toLowerCase() ?? ""}${verb.slice(1)} answers: ${verb}Success${types.length > 0 ? ", or one of the refusals the union lists, each an Error" : ", since nothing refuses it"}.`,
    },
    result: { name: `${verb}Success`, description: `The mutation did its work: ${changed.what}.` },
    dataField: { name: changed.field },
  };
}

// --- Inputs. ---

const OverrideInputRef = builder.inputRef<OverrideInput>("OverrideInput").implement({
  description: "One entry of the override log, as the engine kept it: a hero's forced action (UNIT, with unitId and abilityId) or a party order (PARTY, with order), stamped with the adventure's clock when it was taken up.",
  fields: (t) => ({
    kind: t.field({
      type: builder.enumType("OverrideKind", {
        description: "What a log entry is: a hero's forced action, or an order to the whole party.",
        values: ["UNIT", "PARTY"] as const,
      }),
      required: true,
    }),
    acceptedAtSimTime: t.field({ type: "NonNegativeInt", required: true, description: "Milliseconds on the adventure's clock." }),
    unitId: t.string({ description: "The hero, for a UNIT entry." }),
    abilityId: t.string({
      description: `The ability forced, for a UNIT entry: at most ${MAX_ABILITY_ID} characters.`,
      validate: z.string().check(z.maxLength(MAX_ABILITY_ID, `an ability id is at most ${MAX_ABILITY_ID} characters`)),
    }),
    order: t.field({
      type: builder.enumType("PartyOrder", {
        description: "The orders a party takes: press on into the next stage, or retreat home.",
        values: ["PRESS_ON", "RETREAT"] as const,
      }),
      description: "The order, for a PARTY entry.",
    }),
  }),
});

const RecruitHeroInput = builder.inputType("RecruitHeroInput", {
  description: "What to recruit, and the request's id.",
  fields: (t) => ({
    unitType: t.field({ type: UnitTypeRef, required: true, description: "A unit type on the location's recruitment list." }),
    requestId: t.field({
      type: "UUID",
      required: true,
      description: "A UUID the client makes, which becomes the hero's id; a repeat answers the hero already made.",
      // The scalar passes any case and a stray closing brace, and this value is a key: one
      // request has one spelling, or a repeat in another case would make a second hero.
      validate: z.uuid("a request id is a UUID").check(z.toLowerCase()),
    }),
  }),
});

const BuildFacilityInput = builder.inputType("BuildFacilityInput", {
  description: "Which facility to build at which camp, and the level being built.",
  fields: (t) => ({
    location: t.id({ required: true, description: "The camp's location." }),
    kind: t.field({ type: FacilityKindRef, required: true, description: "One of the camp's own facilities." }),
    level: t.field({ type: "PositiveInt", required: true, description: "The level being built: the next one. A level already built answers the camp and charges nothing." }),
  }),
});

const RetireHeroInput = builder.inputType("RetireHeroInput", {
  description: "Which hero to retire.",
  fields: (t) => ({ heroId: t.id({ required: true }) }),
});

const PARTY_SIZE = `a party is 1 to ${MAX_PARTY} heroes`;

const StartAdventureInput = builder.inputType("StartAdventureInput", {
  description: "Which job to start, where, and with whom.",
  fields: (t) => ({
    location: t.id({ required: true, description: "The camp's location, which posts the job." }),
    jobId: t.id({ required: true, description: "A job the location posts, on its job board or at a facility the camp has built." }),
    heroIds: t.idList({
      required: true,
      description: "The party: one to four of the player's living heroes at that camp.",
      validate: z.array(z.string().check(z.toLowerCase())).check(
        z.minLength(1, PARTY_SIZE),
        z.maxLength(MAX_PARTY, PARTY_SIZE),
        z.refine((ids) => uniq(ids).length === ids.length, "a hero is in the party twice"),
      ),
    }),
  }),
});

const SubmitAdventureInput = builder.inputType("SubmitAdventureInput", {
  description: "Which adventure to submit, with its override log.",
  fields: (t) => ({
    adventureId: t.id({ required: true }),
    overrides: t.field({
      type: [OverrideInputRef],
      required: true,
      description: `The override log, as the engine kept it; empty when the player forced nothing, and at most ${MAX_OVERRIDES} entries.`,
      validate: z.array(z.unknown()).check(z.maxLength(MAX_OVERRIDES, `a log holds at most ${MAX_OVERRIDES} entries`)),
    }),
  }),
});

const DiscardAdventureInput = builder.inputType("DiscardAdventureInput", {
  description: "Which adventure to discard.",
  fields: (t) => ({ adventureId: t.id({ required: true }) }),
});

// --- The roots. Every root field is nullable (graphql.md, rule 6), so one
// field's failure nulls that field and not the response. ---

builder.queryFields((t) => ({
  player: t.field({
    type: PlayerRef,
    nullable: true,
    description: "Public: any caller may look a player up by id.",
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.repo.getPlayer(args.id),
  }),
  me: t.field({
    type: PlayerRef,
    nullable: true,
    authScopes: { authenticated: true },
    description: "The signed-in player, or null before joinGame has made their profile.",
    resolve: async (_root, _args, ctx) => (ctx.playerId ? ctx.repo.getPlayer(ctx.playerId) : undefined),
  }),
  version: t.string({
    nullable: true,
    description: "The deploy's version: the commit this route's deploy runs. /graphql answers the current deploy's, /previous/graphql the one before.",
    resolve: (_root, _args, ctx) => ctx.version,
  }),
  adventure: t.field({
    type: AdventureRef,
    nullable: true,
    authScopes: { authenticated: true },
    description: "An adventure by id: any settled one, for its replay; an open or discarded one only for its own player. Null otherwise.",
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const adventure = await ctx.repo.getAdventure(args.id);
      if (!adventure) return null;
      return adventure.status === "SETTLED" || adventure.playerId === ctx.playerId ? adventure : null;
    },
  }),
  heroesSeenAt: t.field({
    type: [SeenHeroRef],
    nullable: true,
    authScopes: { authenticated: true },
    description: "A random few of other players' heroes seen at the location lately, never all of them and never the caller's own.",
    args: {
      location: t.arg.id({
        required: true,
        validate: z.string().check(z.refine((id) => location(id) !== undefined, { error: ({ input }) => `no location ${String(input)}` })),
      }),
    },
    resolve: (_root, args, ctx) => heroesSeenAt(ctx.repo, callerId(ctx), args.location),
  }),
}));

builder.mutationFields((t) => ({
  joinGame: t.field({
    type: PlayerRef,
    nullable: true,
    authScopes: { authenticated: true },
    description: "Makes the signed-in player's profile if they have none, named from the token, and answers it. Called by the client after every sign-in; a repeat changes nothing. Nothing refuses it.",
    errors: answers("JoinGame", { field: "player", what: "the player's profile, made or found" }, []),
    resolve: (_root, _args, ctx) => ctx.repo.joinPlayer({ id: callerId(ctx), name: ctx.playerName ?? callerId(ctx) }),
  }),
  recruitHero: t.field({
    type: HeroRef,
    nullable: true,
    authScopes: { authenticated: true },
    description:
      "Recruits a hero of the unit type at the heroes hall of the starting camp, paid in resources from the camp's holdings; a villager is free when no hero at the camp is alive. The request id becomes the hero's id, so a repeat answers with the hero already made. Refused with HallLevel, HallFull, InsufficientResources or Conflict; a unit type the location does not recruit, or a request id reused for another unit type, is BAD_USER_INPUT.",
    errors: answers("RecruitHero", { field: "hero", what: "the hero recruited, or already made by this request" }, [HallLevel, HallFull, InsufficientResources, Conflict]),
    args: { input: t.arg({ type: RecruitHeroInput, required: true }) },
    resolve: (_root, { input }, ctx) => recruitHero(ctx.repo, callerId(ctx), input.unitType, input.requestId),
  }),
  buildFacility: t.field({
    type: CampRef,
    nullable: true,
    authScopes: { authenticated: true },
    description:
      "Builds the next level of one of the camp's own facilities, at once, paid in resources from the camp's holdings, and answers the camp. The client names the level it is building, so a repeat finds it built and is answered with the camp, charging nothing. Refused with MaxLevel, Requires, InsufficientResources or Conflict; a camp or facility the player has none of, or a level that is not the next, is BAD_USER_INPUT.",
    errors: answers("BuildFacility", { field: "camp", what: "the camp with the level built" }, [MaxLevel, Requires, InsufficientResources, Conflict]),
    args: { input: t.arg({ type: BuildFacilityInput, required: true }) },
    resolve: (_root, { input }, ctx) => buildFacility(ctx.repo, callerId(ctx), input.location, input.kind, input.level),
  }),
  retireHero: t.field({
    type: HeroRef,
    nullable: true,
    authScopes: { authenticated: true },
    description:
      "Retires one of the player's heroes, alive or dead: permanent, and the hero stays on the record. It frees a slot in the heroes hall. A hero already retired is answered as it is. Refused with HeroAdventuring or Conflict; a hero that is not the player's is BAD_USER_INPUT.",
    errors: answers("RetireHero", { field: "hero", what: "the hero, retired" }, [HeroAdventuring, Conflict]),
    args: { input: t.arg({ type: RetireHeroInput, required: true }) },
    resolve: (_root, { input }, ctx) => retireHero(ctx.repo, callerId(ctx), input.heroId),
  }),
  startAdventure: t.field({
    type: AdventureRef,
    nullable: true,
    authScopes: { authenticated: true },
    description:
      "Starts a job the location posts, on its job board or at a facility the camp has built, with a party of one to four of the player's living heroes at that camp: issues the seed and the frozen snapshot, stamped with the deploy's version, and opens the player's one adventure. Refused with AdventureOpen while one is open, Requires while the facility that posts the job is not built, HeroDead, HeroRetired, HeroNotHere or HeroAdventuring for a hero of the party, or Conflict; a location or job the hub does not know, a party of the wrong size or a hero that is not the player's is BAD_USER_INPUT.",
    errors: answers("StartAdventure", { field: "adventure", what: "the adventure opened" }, [AdventureOpen, Requires, HeroDead, HeroRetired, HeroNotHere, HeroAdventuring, Conflict]),
    args: { input: t.arg({ type: StartAdventureInput, required: true }) },
    resolve: (_root, { input }, ctx) => startAdventure(ctx.repo, callerId(ctx), ctx.version, input.location, input.jobId, input.heroIds),
  }),
  submitAdventure: t.field({
    type: AdventureRef,
    nullable: true,
    authScopes: { authenticated: true },
    description:
      "Submits the caller's open adventure with its override log. The hub replays the log with the engine of the version that issued the adventure, stores the timeline, and settles: XP and levels, the rewards up to the warehouse's cap, the deaths. A settled adventure answers as it is; nothing is paid twice. Refused with EngineUpdated when another version issued it, AdventureDiscarded, or Conflict; an adventure that is not the player's, or a malformed log, is BAD_USER_INPUT.",
    errors: answers("SubmitAdventure", { field: "adventure", what: "the adventure, settled, with its result" }, [EngineUpdated, AdventureDiscarded, Conflict]),
    args: { input: t.arg({ type: SubmitAdventureInput, required: true }) },
    resolve: (_root, { input }, ctx) => submitAdventure(ctx.repo, ctx.timelines, callerId(ctx), ctx.version, input.adventureId, input.overrides),
  }),
  discardAdventure: t.field({
    type: AdventureRef,
    nullable: true,
    authScopes: { authenticated: true },
    description:
      "Discards the caller's open adventure when no deploy can verify it any more: its party comes home and nothing is credited. A discarded adventure answers as it is. Refused with AdventureVerifiable while this deploy or the previous one could still verify it, AdventureSettled, or Conflict; an adventure that is not the player's is BAD_USER_INPUT.",
    errors: answers("DiscardAdventure", { field: "adventure", what: "the adventure, discarded" }, [AdventureVerifiable, AdventureSettled, Conflict]),
    args: { input: t.arg({ type: DiscardAdventureInput, required: true }) },
    resolve: (_root, { input }, ctx) =>
      discardAdventure(ctx.repo, callerId(ctx), { current: ctx.version, previous: ctx.previousVersion }, input.adventureId),
  }),
}));

export const schema = builder.toSchema();
