import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Entity, type EntityItem, Service } from "electrodb";

import { MATERIALS, UNIT_TYPES } from "@heat/engine";

import type { Sighting } from "../seen.js";
import type { Tables } from "./client.js";
import type { Hero } from "./repository.js";
import { HERO_STATUSES } from "./statuses.js";

/**
 * The items recruit and retire write, as ElectroDB entities (decision 0041).
 * Each key template reproduces its line in keys.ts exactly, `casing: "none"`
 * because ElectroDB lowercases a key by default; keys.ts stays the statement
 * of the layout until every verb is here (Issue-201).
 *
 * ElectroDB writes the composite attributes of a key on the item as well as
 * in it, and its identifiers `__edb_e__` and `__edb_v__`, so a player-table
 * item gains `playerId`. A sighting's composites are its location and hero,
 * so it still holds no owner (decision 0029).
 */

const service = "heat";
const version = "1";

const playerId = { type: "string", required: true } as const;
const playerPk = { field: "PK", composite: ["playerId"], template: "PLAYER#${playerId}", casing: "none" } as const;
const text = { type: "string", required: true } as const;
const count = { type: "number", required: true } as const;

/** One service over the two tables: each entity names its own, and only a collection insists on one table. */
export function createService(client: DynamoDBDocumentClient, tables: Tables) {
  const onPlayer = { client, table: tables.player };
  const camp = new Entity(
    {
      model: { entity: "camp", service, version },
      attributes: { playerId, location: text, hallLevel: count, warehouseLevel: count, activeHeroes: count, livingHeroes: count },
      indexes: {
        primary: {
          pk: playerPk,
          sk: { field: "SK", composite: ["location"], template: "AT#${location}#CAMP", casing: "none" },
        },
      },
    },
    onPlayer,
  );
  const hero = new Entity(
    {
      model: { entity: "hero", service, version },
      attributes: {
        playerId,
        id: text,
        location: text,
        unitType: { type: UNIT_TYPES, required: true },
        spriteSet: text,
        name: text,
        recruitedAt: text,
        level: count,
        xp: count,
        picks: { type: "list", items: { type: "string" }, required: true },
        status: { type: HERO_STATUSES, required: true },
        retiredAt: { type: "string" },
        adventureId: { type: "string" },
      },
      indexes: {
        primary: {
          pk: playerPk,
          sk: { field: "SK", composite: ["id"], template: "HERO#${id}", casing: "none" },
        },
      },
    },
    onPlayer,
  );
  const holding = new Entity(
    {
      model: { entity: "holding", service, version },
      attributes: { playerId, location: text, material: { type: MATERIALS, required: true }, balance: count },
      indexes: {
        primary: {
          pk: playerPk,
          sk: { field: "SK", composite: ["location", "material"], template: "AT#${location}#HOLDING#${material}", casing: "none" },
        },
      },
    },
    onPlayer,
  );
  const ledger = new Entity(
    {
      model: { entity: "ledger", service, version },
      attributes: {
        playerId,
        cause: text,
        entry: text,
        location: text,
        material: { type: MATERIALS, required: true },
        delta: count,
        lost: { type: "number" },
      },
      indexes: {
        primary: {
          pk: playerPk,
          sk: { field: "SK", composite: ["cause", "entry"], template: "LEDGER#${cause}#${entry}", casing: "none" },
        },
      },
    },
    onPlayer,
  );
  const sighting = new Entity(
    {
      model: { entity: "sighting", service, version },
      attributes: {
        location: text,
        heroId: text,
        name: text,
        unitType: { type: UNIT_TYPES, required: true },
        spriteSet: text,
        level: count,
        seenAt: text,
        expiresAt: count,
      },
      indexes: {
        primary: {
          pk: { field: "PK", composite: ["location"], template: "LOCATION#${location}", casing: "none" },
          sk: { field: "SK", composite: ["heroId"], template: "SEEN#${heroId}", casing: "none" },
        },
      },
    },
    { client, table: tables.location },
  );
  return new Service({ camp, hero, holding, ledger, sighting }, { client });
}

export type HeatService = ReturnType<typeof createService>;

/**
 * ElectroDB drops an attribute its entity does not declare, without an error,
 * so a field added to a type written whole is an error here instead of a field
 * never stored. `never` is the only thing each line accepts.
 */
type NothingUndeclared<Undeclared extends never> = Undeclared;
export type EntitiesCoverTheirItems = [
  NothingUndeclared<Exclude<keyof Hero, keyof EntityItem<HeatService["entities"]["hero"]>>>,
  NothingUndeclared<Exclude<keyof Sighting, keyof EntityItem<HeatService["entities"]["sighting"]>>>,
];
