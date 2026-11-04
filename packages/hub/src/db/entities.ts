import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CustomAttributeType, Entity, type EntityItem, Service } from "electrodb";

import { type AdventureSnapshot, FACILITY_KINDS, MATERIALS, UNIT_TYPES } from "@heat/engine";

import type { Sighting } from "../seen.js";
import type { Tables } from "./client.js";
import { ITEM_VERSION, KEY, TEMPLATES } from "./keys.js";
import type { AdventureRecord, Hero, OpenAdventure, Player, SettledResult } from "./repository.js";
import { ADVENTURE_STATUSES, HERO_STATUSES } from "./statuses.js";

/**
 * The items the repository reads and writes, as ElectroDB entities (decision
 * 0041). Each key template is its line in keys.ts, `casing: "none"` because
 * ElectroDB lowercases a key by default.
 *
 * ElectroDB writes the composite attributes of a key on the item as well as
 * in it, and its identifiers `__edb_e__` and `__edb_v__`, so a player-table
 * item gains `playerId`. A sighting's composites are its location and hero,
 * so it still holds no owner (decision 0029).
 *
 * `required` is enforced on a write and not on a read. An item from before
 * ElectroDB may lack some of these, which the repository says where it reads
 * them (decision 0042).
 */

const service = "heat";
const version = ITEM_VERSION;

const playerId = { type: "string", required: true } as const;
const playerPk = { field: KEY.pk, composite: ["playerId"], template: TEMPLATES.player, casing: "none" } as const;
const text = { type: "string", required: true } as const;
const count = { type: "number", required: true } as const;

/** One service over the two tables: each entity names its own, and only a collection insists on one table. */
export function createService(client: DynamoDBDocumentClient, tables: Tables) {
  const onPlayer = { client, table: tables.player };
  const onLocation = { client, table: tables.location };
  const profile = new Entity(
    {
      model: { entity: "profile", service, version },
      attributes: { id: text, name: text },
      indexes: {
        primary: {
          pk: { field: KEY.pk, composite: ["id"], template: TEMPLATES.profilePk, casing: "none" },
          sk: { field: KEY.sk, composite: [], template: TEMPLATES.profile, casing: "none" },
        },
      },
    },
    onPlayer,
  );
  const camp = new Entity(
    {
      model: { entity: "camp", service, version },
      attributes: { playerId, location: text, hallLevel: count, warehouseLevel: count, activeHeroes: count, livingHeroes: count },
      indexes: {
        primary: {
          pk: playerPk,
          sk: { field: KEY.sk, composite: ["location"], template: TEMPLATES.camp, casing: "none" },
        },
      },
    },
    onPlayer,
  );
  const facility = new Entity(
    {
      model: { entity: "facility", service, version },
      attributes: { playerId, location: text, kind: { type: FACILITY_KINDS, required: true }, level: count },
      indexes: {
        primary: {
          pk: playerPk,
          sk: { field: KEY.sk, composite: ["location", "kind"], template: TEMPLATES.facility, casing: "none" },
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
          sk: { field: KEY.sk, composite: ["id"], template: TEMPLATES.hero, casing: "none" },
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
          sk: { field: KEY.sk, composite: ["location", "material"], template: TEMPLATES.holding, casing: "none" },
        },
      },
    },
    onPlayer,
  );
  const open = new Entity(
    {
      model: { entity: "open", service, version },
      attributes: { playerId, adventureId: text, seed: text, startedAt: text },
      indexes: {
        primary: {
          pk: playerPk,
          sk: { field: KEY.sk, composite: [], template: TEMPLATES.open, casing: "none" },
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
          sk: { field: KEY.sk, composite: ["cause", "entry"], template: TEMPLATES.ledger, casing: "none" },
        },
      },
    },
    onPlayer,
  );
  /**
   * The snapshot and the result are stored whole, typed from the engine's and
   * the settlement's own types: a `map` would state them a second time, and
   * drops a nested field it does not declare, on a write and on a read.
   */
  const adventure = new Entity(
    {
      model: { entity: "adventure", service, version },
      attributes: {
        adventureId: text,
        playerId,
        seed: text,
        location: text,
        jobId: text,
        snapshot: { type: CustomAttributeType<AdventureSnapshot>("any"), required: true },
        version: text,
        startedAt: text,
        status: { type: ADVENTURE_STATUSES, required: true },
        result: { type: CustomAttributeType<SettledResult>("any") },
        settledAt: { type: "string" },
        discardedAt: { type: "string" },
      },
      indexes: {
        primary: {
          pk: { field: KEY.pk, composite: ["adventureId"], template: TEMPLATES.adventurePk, casing: "none" },
          sk: { field: KEY.sk, composite: [], template: TEMPLATES.adventure, casing: "none" },
        },
      },
    },
    onLocation,
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
          pk: { field: KEY.pk, composite: ["location"], template: TEMPLATES.locationPk, casing: "none" },
          sk: { field: KEY.sk, composite: ["heroId"], template: TEMPLATES.sighting, casing: "none" },
        },
      },
    },
    onLocation,
  );
  return new Service({ adventure, camp, facility, hero, holding, ledger, open, profile, sighting }, { client });
}

export type HeatService = ReturnType<typeof createService>;

/**
 * ElectroDB drops an attribute its entity does not declare, without an error,
 * so a field added to a type written whole is an error here instead of a field
 * never stored. `never` is the only thing each line accepts.
 */
type NothingUndeclared<Undeclared extends never> = Undeclared;
export type EntitiesCoverTheirItems = [
  NothingUndeclared<Exclude<keyof AdventureRecord, keyof EntityItem<HeatService["entities"]["adventure"]>>>,
  NothingUndeclared<Exclude<keyof Hero, keyof EntityItem<HeatService["entities"]["hero"]>>>,
  NothingUndeclared<Exclude<keyof OpenAdventure, keyof EntityItem<HeatService["entities"]["open"]>>>,
  NothingUndeclared<Exclude<keyof Player, keyof EntityItem<HeatService["entities"]["profile"]>>>,
  NothingUndeclared<Exclude<keyof Sighting, keyof EntityItem<HeatService["entities"]["sighting"]>>>,
];
