import {
  JOBS,
  hallCapacity,
  location,
  warehouseCapacity,
  type Job,
  type Reward,
  type SnapshotHero,
  type StageResult,
  type UnitStats,
  type AdventureSnapshot,
} from "@heat/engine";
import { GraphQLError } from "graphql";
import { builder } from "./builder.js";
import { recruitHero } from "../recruit.js";
import { retireHero } from "../retire.js";
import { startAdventure } from "../start.js";
import { submitAdventure, type OverrideInput } from "../submit.js";
import { discardAdventure } from "../discard.js";
import { heroesSeenAt, type Sighting } from "../seen.js";
import type { AdventureRecord, Camp, Hero, HeroOutcome, Holding, Player, SettledResult } from "../db/repository.js";

/**
 * The graph: a public player; their camps, heroes and the open adventure
 * behind the `self` scope; other players' heroes seen at a location, by
 * their public fields only; a settled adventure, with its result and its
 * timeline; the deploy's version; joining, recruiting, retiring, and an
 * adventure started from the job board, submitted for verification and
 * settlement, or discarded when no deploy can verify it.
 */

builder.scalarType("JSON", {
  description: "A JSON value, served as it was stored.",
  serialize: (value) => value,
  parseValue: (value) => value,
});

const HoldingRef = builder.objectRef<Holding>("Holding").implement({
  fields: (t) => ({
    material: t.exposeString("material"),
    balance: t.exposeInt("balance"),
  }),
});

const CampRef = builder.objectRef<Camp>("Camp").implement({
  description: "One player's view of one location: their facilities, resources and heroes there.",
  fields: (t) => ({
    location: t.exposeString("location", { description: "The location's id in the static content." }),
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
  }),
});

const HeroStatusRef = builder.enumType("HeroStatus", { values: ["ALIVE", "DEAD", "RETIRED"] as const });

const HeroRef = builder.objectRef<Hero>("Hero").implement({
  description: "A hero, drawn by the hub at recruitment: its sprite set and name are never the client's choice.",
  fields: (t) => ({
    id: t.exposeString("id"),
    name: t.exposeString("name"),
    unitType: t.exposeString("unitType"),
    spriteSet: t.exposeString("spriteSet", { description: "The set's directory under art/heroes/." }),
    location: t.exposeString("location"),
    recruitedAt: t.exposeString("recruitedAt"),
    level: t.exposeInt("level"),
    xp: t.exposeInt("xp"),
    status: t.field({ type: HeroStatusRef, resolve: (hero) => hero.status }),
    retiredAt: t.exposeString("retiredAt", { nullable: true }),
  }),
});

const SeenHeroRef = builder.objectRef<Sighting>("SeenHero").implement({
  description: "Another player's hero seen at a location: its public fields only, and nothing that says whose it is (decision 0029).",
  fields: (t) => ({
    id: t.exposeString("heroId"),
    name: t.exposeString("name"),
    unitType: t.exposeString("unitType"),
    spriteSet: t.exposeString("spriteSet", { description: "The set's directory under art/heroes/." }),
    level: t.exposeInt("level"),
  }),
});

const JobRef = builder.objectRef<Job>("Job").implement({
  description: "A job on a location's job board, from the static content; the client reads its stages from the engine it loaded.",
  fields: (t) => ({
    id: t.exposeString("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description"),
    location: t.exposeString("location", { description: "The location whose job board posts it." }),
  }),
});

const UnitStatsRef = builder.objectRef<UnitStats>("UnitStats").implement({
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
    heroId: t.exposeString("heroId"),
    unitType: t.exposeString("unitType"),
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
    jobId: t.exposeString("jobId"),
    heroes: t.expose("heroes", { type: [SnapshotHeroRef] }),
  }),
});

const AdventureStatusRef = builder.enumType("AdventureStatus", { values: ["OPEN", "SETTLED", "DISCARDED"] as const });

const RewardRef = builder.objectRef<Reward>("Reward").implement({
  fields: (t) => ({
    material: t.exposeString("material"),
    amount: t.exposeInt("amount"),
  }),
});

const StageResultRef = builder.objectRef<StageResult>("StageResult").implement({
  description: "How one stage the party entered ended.",
  fields: (t) => ({
    stage: t.exposeInt("stage"),
    kind: t.exposeString("kind", { description: "travel, fight, gather or arrive." }),
    ended: t.exposeString("ended", { description: "done for travel and arrive; win, loss, timeout or retreat for a battle." }),
    startedAtMs: t.exposeInt("startedAtMs"),
    endedAtMs: t.exposeInt("endedAtMs"),
  }),
});

const HeroOutcomeRef = builder.objectRef<HeroOutcome>("HeroOutcome").implement({
  description: "One hero of the party at settlement.",
  fields: (t) => ({
    heroId: t.exposeString("heroId"),
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
    outcome: t.exposeString("outcome", { description: "complete, retreat (ordered, or a time limit reached) or defeat." }),
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
    id: t.exposeString("adventureId"),
    seed: t.exposeString("seed"),
    startedAt: t.exposeString("startedAt"),
    location: t.exposeString("location"),
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

const OverrideKindRef = builder.enumType("OverrideKind", { values: ["UNIT", "PARTY"] as const });
const PartyOrderRef = builder.enumType("PartyOrder", { values: ["PRESS_ON", "RETREAT"] as const });

const OverrideInputRef = builder.inputType("OverrideInput", {
  description: "One entry of the override log, as the engine kept it: a hero's forced action (UNIT, with unitId and abilityId) or a party order (PARTY, with order), stamped with the adventure's clock when it was taken up.",
  fields: (t) => ({
    kind: t.field({ type: OverrideKindRef, required: true }),
    acceptedAtSimTime: t.int({ required: true, description: "Milliseconds on the adventure's clock." }),
    unitId: t.string({ description: "The hero, for a UNIT entry." }),
    abilityId: t.string({ description: "The ability forced, for a UNIT entry." }),
    order: t.field({ type: PartyOrderRef, description: "The order, for a PARTY entry." }),
  }),
});

const PlayerRef = builder.objectRef<Player>("Player").implement({
  fields: (t) => ({
    id: t.exposeString("id"),
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

builder.queryFields((t) => ({
  player: t.field({
    type: PlayerRef,
    nullable: true,
    description: "Public: any caller may look a player up by id.",
    args: { id: t.arg.string({ required: true }) },
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
    description: "The deploy's version: the commit this route's deploy runs. /graphql answers the current deploy's, /previous/graphql the one before.",
    resolve: (_root, _args, ctx) => ctx.version,
  }),
  adventure: t.field({
    type: AdventureRef,
    nullable: true,
    authScopes: { authenticated: true },
    description: "An adventure by id: any settled one, for its replay; an open or discarded one only for its own player. Null otherwise.",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const adventure = await ctx.repo.getAdventure(args.id);
      if (!adventure) return null;
      return adventure.status === "SETTLED" || adventure.playerId === ctx.playerId ? adventure : null;
    },
  }),
  heroesSeenAt: t.field({
    type: [SeenHeroRef],
    authScopes: { authenticated: true },
    description: "A random few of other players' heroes seen at the location lately, never all of them and never the caller's own.",
    args: { location: t.arg.string({ required: true }) },
    resolve: (_root, args, ctx) => {
      if (!location(args.location)) throw new GraphQLError(`no location ${args.location}`, { extensions: { code: "BAD_USER_INPUT" } });
      return heroesSeenAt(ctx.repo, ctx.playerId!, args.location);
    },
  }),
}));

builder.mutationFields((t) => ({
  joinGame: t.field({
    type: PlayerRef,
    authScopes: { authenticated: true },
    description: "Makes the signed-in player's profile if they have none, named from the token, and answers it. Called by the client after every sign-in; a repeat changes nothing.",
    resolve: (_root, _args, ctx) => ctx.repo.joinPlayer({ id: ctx.playerId!, name: ctx.playerName ?? ctx.playerId! }),
  }),
  recruitHero: t.field({
    type: HeroRef,
    authScopes: { authenticated: true },
    description: "Recruits a hero of the unit type at the heroes hall of the starting camp, paid in resources from the camp's holdings; a villager is free when no hero at the camp is alive. The request id, a UUID the client makes, becomes the hero's id, so a repeat answers with the hero already made. Refused with HALL_LEVEL, HALL_FULL, INSUFFICIENT_RESOURCES (extensions.short lists each material's amount and the camp's balance), BAD_USER_INPUT or CONFLICT.",
    args: {
      unitType: t.arg.string({ required: true }),
      requestId: t.arg.string({ required: true }),
    },
    resolve: (_root, args, ctx) => recruitHero(ctx.repo, ctx.playerId!, args.unitType, args.requestId),
  }),
  retireHero: t.field({
    type: HeroRef,
    authScopes: { authenticated: true },
    description: "Retires one of the player's heroes, alive or dead: permanent, and the hero stays on the record. It frees a slot in the heroes hall. A hero already retired is answered as it is.",
    args: { heroId: t.arg.string({ required: true }) },
    resolve: (_root, args, ctx) => retireHero(ctx.repo, ctx.playerId!, args.heroId),
  }),
  startAdventure: t.field({
    type: AdventureRef,
    authScopes: { authenticated: true },
    description: "Starts a job from the location's job board with a party of one to four of the player's living heroes at that camp: issues the seed and the frozen snapshot, stamped with the deploy's version, and opens the player's one adventure. Refused with ADVENTURE_OPEN, naming the open one in extensions.adventureId, while one is open.",
    args: {
      location: t.arg.string({ required: true }),
      jobId: t.arg.string({ required: true }),
      heroIds: t.arg.stringList({ required: true }),
    },
    resolve: (_root, args, ctx) => startAdventure(ctx.repo, ctx.playerId!, ctx.version, args.location, args.jobId, args.heroIds),
  }),
  submitAdventure: t.field({
    type: AdventureRef,
    authScopes: { authenticated: true },
    description: "Submits the caller's open adventure with its override log. The hub replays the log with the engine of the version that issued the adventure, stores the timeline, and settles: XP and levels, the rewards up to the warehouse's cap, the deaths. Refused with ENGINE_UPDATED, and this deploy's version in extensions.version, when another version issued it: try /previous/graphql. A settled adventure answers as it is; nothing is paid twice.",
    args: {
      adventureId: t.arg.string({ required: true }),
      overrides: t.arg({ type: [OverrideInputRef], required: true }),
    },
    resolve: (_root, args, ctx) =>
      submitAdventure(ctx.repo, ctx.timelines, ctx.playerId!, ctx.version, args.adventureId, args.overrides as OverrideInput[]),
  }),
  discardAdventure: t.field({
    type: AdventureRef,
    authScopes: { authenticated: true },
    description: "Discards the caller's open adventure when no deploy can verify it any more: its party comes home and nothing is credited. Refused with ADVENTURE_VERIFIABLE while this deploy or the previous one could still verify it.",
    args: { adventureId: t.arg.string({ required: true }) },
    resolve: (_root, args, ctx) =>
      discardAdventure(ctx.repo, ctx.playerId!, { current: ctx.version, previous: ctx.previousVersion }, args.adventureId),
  }),
}));

export const schema = builder.toSchema();
