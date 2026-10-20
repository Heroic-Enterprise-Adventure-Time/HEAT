/**
 * The game's static content: the locations, what each recruits, the caps of
 * the hall and the warehouse per level, the hero names and the sprite sets
 * each unit type allows. TypeScript data, imported by the hub and the client
 * alike (decision 0013); a change here is a change to the rules, reviewed
 * like code. The design is docs/design/game.md, "Locations and camps", "The
 * heroes hall" and "Resources"; the numbers are its working assumptions.
 */

import type { Material } from "./index.js";

/** The unit types that have a sprite set. Their stats and abilities come with the turn machinery. */
export type UnitType = "villager" | "fighter" | "knight" | "ranger" | "wizard" | "priest";

export const UNIT_TYPES: readonly UnitType[] = ["villager", "fighter", "knight", "ranger", "wizard", "priest"];

export type FacilityKind = "heroes-hall" | "warehouse" | "job-board";

/** A cost in resources: there is no currency (game.md, "Resources"). */
export type Cost = readonly { material: Material; amount: number }[];

export interface Recruit {
  unitType: UnitType;
  /** The hall level the unit type needs. */
  hallLevel: number;
  /** The cost when the recruit is not the free villager. Paid recruitment is Issue-82. */
  cost: Cost;
}

export interface Location {
  id: string;
  name: string;
  /** The facilities that belong to the location and look the same to every player. */
  sharedFacilities: readonly FacilityKind[];
  /** The facilities every camp here has at level 1 or above. */
  ownFacilities: readonly FacilityKind[];
  recruits: readonly Recruit[];
}

export const LOCATIONS: readonly Location[] = [
  {
    id: "millbrook",
    name: "Millbrook",
    sharedFacilities: ["job-board"],
    ownFacilities: ["heroes-hall", "warehouse"],
    recruits: [
      // Working assumptions until Issue-82 sets the costs.
      { unitType: "villager", hallLevel: 1, cost: [{ material: "timber", amount: 5 }] },
      { unitType: "fighter", hallLevel: 1, cost: [{ material: "ore", amount: 10 }, { material: "cloth", amount: 5 }] },
    ],
  },
];

/** A new player starts here, with a camp at level 1 and no heroes. */
export const STARTING_LOCATION = "millbrook";

export function location(id: string): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

/** Active heroes a camp can hold, by heroes hall level; index 0 is level 1. */
export const HALL_CAPACITY: readonly number[] = [4];

/** Stock of each resource a camp can hold, by warehouse level; index 0 is level 1. */
export const WAREHOUSE_CAPACITY: readonly number[] = [100];

export function hallCapacity(level: number): number {
  return HALL_CAPACITY[Math.min(level, HALL_CAPACITY.length) - 1] ?? 0;
}

export function warehouseCapacity(level: number): number {
  return WAREHOUSE_CAPACITY[Math.min(level, WAREHOUSE_CAPACITY.length) - 1] ?? 0;
}

/**
 * The sprite sets each unit type allows, by the set's directory under
 * art/heroes/. The test checks this against every set's provenance.json
 * `classes`, so a new set is added here and there together.
 */
export const SPRITE_SETS: Readonly<Record<UnitType, readonly string[]>> = {
  villager: ["villager-01"],
  fighter: ["fighter-02"],
  knight: ["knight-06"],
  ranger: ["ranger-01"],
  wizard: ["wizard-01", "wizard-03"],
  priest: ["priest-02"],
};

/**
 * The names a hero is given at recruitment, drawn at random. A fixed list,
 * so no text a player wrote is ever shown to another (game.md, "Heroes").
 * Quiet-village names, to suit Millbrook.
 */
export const HERO_NAMES: readonly string[] = [
  "Agnes", "Alder", "Alys", "Ansel", "Bertram", "Bryn", "Cora", "Cuthbert",
  "Dora", "Edwin", "Elspeth", "Gilbert", "Godwin", "Hilda", "Hob", "Hugh",
  "Isolde", "Jory", "Kit", "Leofric", "Linnet", "Mabel", "Matilda", "Maud",
  "Ned", "Nell", "Osric", "Oswin", "Perrin", "Piers", "Rowan", "Sabine",
  "Tamsin", "Tobias", "Ulric", "Wat", "Wenna", "Wilfred", "Winifred", "Wren",
];
