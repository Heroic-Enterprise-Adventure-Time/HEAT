import { randomUUID } from "node:crypto";
import { rewardsForSeed } from "@heat/engine";
import { builder } from "./builder.js";
import type { Holding, OpenAdventure, Player } from "../db/repository.js";

/**
 * The spike's graph: a public player, private holdings behind the `self`
 * scope, and the two mutations that drive the start and settle transactions.
 * Settle is exposed as a mutation here only so the spike can exercise it;
 * in the design it is triggered by the verifier's result, not by a client.
 */

const HoldingRef = builder.objectRef<Holding>("Holding").implement({
  fields: (t) => ({
    material: t.exposeString("material"),
    balance: t.exposeInt("balance"),
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
    holdings: t.field({
      type: [HoldingRef],
      nullable: true,
      description: "Private: only the player may read their own holdings. Null, with an error on this field, for anyone else.",
      authScopes: (player) => ({ self: player.id }),
      resolve: (player, _args, ctx) => ctx.repo.holdings(player.id),
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
    resolve: async (_root, _args, ctx) => (ctx.playerId ? ctx.repo.getPlayer(ctx.playerId) : undefined),
  }),
}));

builder.mutationFields((t) => ({
  startAdventure: t.field({
    type: AdventureRef,
    authScopes: { authenticated: true },
    description: "Issues the seed and opens the player's one adventure. Fails if one is already open.",
    resolve: async (_root, _args, ctx) => {
      const playerId = ctx.playerId!;
      return ctx.repo.startAdventure(playerId, randomUUID(), randomUUID());
    },
  }),
  settleAdventure: t.field({
    type: PlayerRef,
    nullable: true,
    authScopes: { authenticated: true },
    description: "Spike only: settles the caller's open adventure with the engine's rewards for its seed.",
    args: { adventureId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const playerId = ctx.playerId!;
      const record = await ctx.repo.getAdventure(args.adventureId);
      if (!record || record.playerId !== playerId) throw new Error("not your adventure");
      await ctx.repo.settle(playerId, args.adventureId, rewardsForSeed(record.seed));
      return ctx.repo.getPlayer(playerId);
    },
  }),
}));

export const schema = builder.toSchema();
