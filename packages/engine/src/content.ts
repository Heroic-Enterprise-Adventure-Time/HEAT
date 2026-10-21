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

export type FacilityKind = "heroes-hall" | "warehouse" | "job-board" | "mine" | "lumber-camp" | "caravan-hub";

export interface Facility {
  name: string;
  /** What the facility does, shown in its panel built or not. */
  description: string;
}

/** Every kind of facility, by name and purpose (game.md, "Locations and camps"). */
export const FACILITIES: Readonly<Record<FacilityKind, Facility>> = {
  "heroes-hall": { name: "Heroes hall", description: "Where heroes are recruited, and where you see and manage the heroes of this camp." },
  "job-board": { name: "Job board", description: "General jobs posted for anyone at this location: the first way to set out." },
  warehouse: { name: "Warehouse", description: "Holds this camp's resources. Its level sets how much of each it can hold." },
  mine: { name: "Mine", description: "Sends heroes into the hill on mining runs for ore." },
  "lumber-camp": { name: "Lumber camp", description: "Sends heroes into the woods on lumber runs for timber." },
  "caravan-hub": { name: "Caravan hub", description: "Sends caravans to other locations, carrying resources and heroes as passengers." },
};

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
  /** The own facilities a camp here may build; until built they stand at level 0. */
  buildableFacilities: readonly FacilityKind[];
  recruits: readonly Recruit[];
}

export const LOCATIONS: readonly Location[] = [
  {
    id: "millbrook",
    name: "Millbrook",
    sharedFacilities: ["job-board"],
    ownFacilities: ["heroes-hall", "warehouse"],
    buildableFacilities: ["mine", "lumber-camp", "caravan-hub"],
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
  villager: ["villager-01", "villager-07", "villager-08", "villager-09", "villager-10", "villager-11", "villager-12"],
  fighter: ["fighter-02"],
  knight: ["knight-06"],
  ranger: ["ranger-01"],
  wizard: ["wizard-01", "wizard-03"],
  priest: ["priest-02"],
};

/**
 * How a sprite set or a name reads, so that a hero's name suits its sprite
 * (game.md, "Heroes"). "either" fits both.
 */
export type Presentation = "masculine" | "feminine" | "either";

export const PRESENTATIONS: readonly Presentation[] = ["masculine", "feminine", "either"];

/**
 * Every sprite set's presentation, by its directory under art/heroes/. The
 * test checks this against every set's provenance.json `presentation`.
 */
export const SPRITE_SET_PRESENTATION: Readonly<Record<string, Presentation>> = {
  "villager-01": "either",
  "villager-07": "feminine",
  "villager-08": "masculine",
  "villager-09": "feminine",
  "villager-10": "masculine",
  "villager-11": "either",
  "villager-12": "feminine",
  "fighter-02": "masculine",
  "knight-06": "either",
  "ranger-01": "either",
  "wizard-01": "either",
  "wizard-03": "masculine",
  "priest-02": "either",
};

/**
 * The names a hero is given at recruitment, by presentation. A fixed list,
 * so no text a player wrote is ever shown to another (game.md, "Heroes").
 * Quiet-village names, to suit Millbrook.
 */
export const HERO_NAMES: Readonly<Record<Presentation, readonly string[]>> = {
  masculine: [
    "Aldous", "Ansel", "Baldwin", "Bertram", "Colin", "Cuthbert", "Drogo", "Edwin",
    "Everard", "Fulk", "Geoffrey", "Gilbert", "Godwin", "Hamon", "Hob", "Hugh",
    "Jasper", "Jory", "Lambert", "Leofric", "Ned", "Osric", "Oswin", "Perrin",
    "Piers", "Ralf", "Simkin", "Tobias", "Ulric", "Walter", "Wat", "Wilfred",
  ],
  feminine: [
    "Ada", "Agnes", "Alys", "Avice", "Beatrix", "Clemence", "Constance", "Cora",
    "Dora", "Edith", "Elinor", "Elspeth", "Gwen", "Hawise", "Hilda", "Ida",
    "Isolde", "Joan", "Juliana", "Lettice", "Linnet", "Mabel", "Marjory", "Matilda",
    "Maud", "Nell", "Petronel", "Rosamund", "Sabine", "Sybil", "Tamsin", "Una",
    "Wenna", "Winifred",
  ],
  either: [
    "Alder", "Ash", "Briar", "Bryn", "Ellis", "Fen", "Hollis", "Kit",
    "Lark", "Morgan", "Robin", "Rowan", "Sorrel", "Wren",
  ],
};

/**
 * The names a new hero with a sprite set of this presentation may be given:
 * its own and the "either" names, or every name for an "either" set. Names
 * in `taken`, the camp's living roster, are left out while any remain.
 */
export function heroNames(presentation: Presentation, taken: ReadonlySet<string> = new Set()): readonly string[] {
  const allowed = presentation === "either" ? PRESENTATIONS.flatMap((p) => HERO_NAMES[p]) : [...HERO_NAMES[presentation], ...HERO_NAMES.either];
  const free = allowed.filter((n) => !taken.has(n));
  return free.length > 0 ? free : allowed;
}
