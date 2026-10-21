import { randomUUID } from "node:crypto";
import { STARTING_LOCATION, hallCapacity, location, rewardsForSeed, warehouseCapacity } from "@heat/engine";
import { GraphQLError } from "graphql";
import { builder } from "./builder.js";
import { recruitHero } from "../recruit.js";
import { retireHero } from "../retire.js";
import { heroesSeenAt, type Sighting } from "../seen.js";
import type { Camp, Hero, Holding, OpenAdventure, Player } from "../db/repository.js";

/**
 * The graph: a public player; their camps, heroes and the open adventure
 * behind the `self` scope; other players' heroes seen at a location, by
 * their public fields only; joining, recruiting, retiring, and the spike's two
 * adventure mutations. Settle is exposed as a mutation here only so the
 * spike can exercise it; in the design it is triggered by the verifier's
 * result, not by a client.
 */

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

const AdventureRef = builder.objectRef<OpenAdventure>("Adventure").implement({
  fields: (t) => ({
    id: t.exposeString("adventureId"),
    seed: t.exposeString("seed"),
    startedAt: t.exposeString("startedAt"),
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
      resolve: (player, _args, ctx) => ctx.repo.openAdventure(player.id),
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
    description: "Recruits a hero of the unit type at the heroes hall of the starting camp. The request id, a UUID the client makes, becomes the hero's id, so a repeat answers with the hero already made. Only the free villager for now: a camp with no living hero and a free slot.",
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
    description: "Issues the seed and opens the player's one adventure. Fails if one is already open.",
    resolve: (_root, _args, ctx) => ctx.repo.startAdventure(ctx.playerId!, randomUUID(), randomUUID()),
  }),
  settleAdventure: t.field({
    type: PlayerRef,
    nullable: true,
    authScopes: { authenticated: true },
    description: "Spike only: settles the caller's open adventure with the engine's rewards for its seed, credited at the starting camp.",
    args: { adventureId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const playerId = ctx.playerId!;
      const record = await ctx.repo.getAdventure(args.adventureId);
      if (!record || record.playerId !== playerId) throw new Error("not your adventure");
      await ctx.repo.settle(playerId, args.adventureId, STARTING_LOCATION, rewardsForSeed(record.seed));
      return ctx.repo.getPlayer(playerId);
    },
  }),
}));

export const schema = builder.toSchema();
