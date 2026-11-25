/**
 * The game's static content: the unlocks, the locations, what each recruits, the caps of
 * the hall and the warehouse per level, the hero names, the sprite sets each
 * unit type allows, and the battle's abilities, unit types, monsters and
 * resource nodes, the jobs, and the XP each level needs. TypeScript data, imported by the hub and the client alike
 * (decision 0013); a change here is a change to the rules, reviewed like
 * code. The design is docs/design/game.md, "Locations and camps", "The heroes
 * hall" and "Resources", and docs/design/battle.md; the numbers are its
 * working assumptions. The jobs, the retreat and the XP table are at the end
 * of this file.
 */

import type { AdventureContent, Job, RetreatRule } from "./adventure/index.js";
import type { AbilityDefinition, BattleContent, CombatProfile, LineReach, MonsterProfile, ResourceNodeProfile } from "./battle/index.js";
import type { Material } from "./index.js";

/** The unit types that have a sprite set. Those with a combat profile are in `UNIT_PROFILES`. The list declares the union (typescript.md, rule 18). */
export const UNIT_TYPES = ["villager", "miner", "lumberjack", "fighter", "knight", "ranger", "wizard", "priest"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/** A camp's own facilities: those every camp has and those it may build. */
export const FACILITY_KINDS = ["heroes-hall", "warehouse", "job-board", "mine", "lumber-camp", "caravan-hub"] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];

/** A cost in resources: there is no currency (game.md, "Resources"). */
export type Cost = readonly { material: Material; amount: number }[];

/** Another facility a level needs first, at this level or above. */
export interface Requirement {
  kind: FacilityKind;
  level: number;
}

export interface FacilityLevel {
  /** What building the level costs. Level 1 of a facility every camp has is never built, and costs nothing. */
  cost: Cost;
  /** The facilities the camp needs first. */
  requires: readonly Requirement[];
}

export interface Facility {
  name: string;
  /** What the facility does, shown in its panel built or not. */
  description: string;
  /** The levels a camp can have, index 0 is level 1; a shared facility has none. */
  levels: readonly FacilityLevel[];
  /**
   * The levels with a picture of their own, art/facilities/<kind>/level-<n>.png;
   * any other level shows the highest below it that has one (assets.md,
   * rule 17). The test checks this against the files.
   */
  art: readonly number[];
}

const GIVEN: FacilityLevel = { cost: [], requires: [] };

/**
 * Every kind of facility, by name and purpose (game.md, "Locations and
 * camps"), with what each level costs (Issue-93). The mine's first level is
 * the first progression's (decision 0031). The hall and the warehouse go to
 * level 3 and the rest to level 1 at first: a camp is not meant to build
 * everything at its first location, since later levels will need what other
 * locations have (the owner, Issue-93).
 */
export const FACILITIES: Readonly<Record<FacilityKind, Facility>> = {
  "heroes-hall": {
    name: "Heroes hall",
    description: "Where heroes are recruited, and where you see and manage the heroes of this camp.",
    levels: [
      GIVEN,
      { cost: [{ material: "timber", amount: 80 }, { material: "cloth", amount: 20 }], requires: [] },
      { cost: [{ material: "timber", amount: 150 }, { material: "ore", amount: 40 }, { material: "cloth", amount: 30 }], requires: [] },
    ],
    art: [1, 2, 3],
  },
  "job-board": {
    name: "Job board",
    description: "General jobs posted for anyone at this location: the first way to set out.",
    levels: [],
    art: [1],
  },
  warehouse: {
    name: "Warehouse",
    description: "Holds this camp's resources. Its level sets how much of each it can hold.",
    levels: [
      GIVEN,
      { cost: [{ material: "timber", amount: 80 }, { material: "ore", amount: 40 }], requires: [] },
      { cost: [{ material: "timber", amount: 160 }, { material: "ore", amount: 120 }, { material: "cloth", amount: 20 }], requires: [] },
    ],
    art: [1, 2, 3],
  },
  mine: {
    name: "Mine",
    description: "Sends heroes into the hill on mining runs for ore.",
    levels: [{ cost: [{ material: "timber", amount: 60 }, { material: "cloth", amount: 3 }], requires: [] }],
    art: [0, 1],
  },
  "lumber-camp": {
    name: "Lumber camp",
    description: "Sends heroes into the woods on lumber runs for timber.",
    levels: [{ cost: [{ material: "timber", amount: 50 }, { material: "ore", amount: 20 }], requires: [] }],
    art: [0, 1],
  },
  "caravan-hub": {
    name: "Caravan hub",
    description: "Sends caravans to other locations, carrying resources and heroes as passengers.",
    // Caravans carry stock, so a hub needs room for it first.
    levels: [{
      cost: [{ material: "timber", amount: 100 }, { material: "ore", amount: 60 }, { material: "cloth", amount: 20 }],
      requires: [{ kind: "warehouse", level: 2 }],
    }],
    art: [0, 1],
  },
};

/** The picture a facility at this level shows: the highest level at or below it that has one. */
export function facilityArtLevel(kind: FacilityKind, level: number): number {
  const art = FACILITIES[kind].art;
  return art.filter((l) => l <= level).at(-1) ?? art[0] ?? 1;
}

/** The next level of a facility and what it takes, or undefined at its highest. */
export function nextLevel(kind: FacilityKind, level: number): ({ level: number } & FacilityLevel) | undefined {
  const next = FACILITIES[kind].levels[level];
  return next && { level: level + 1, ...next };
}

/** A camp as building reads it: each own facility's level, and its stock. */
export interface BuildingCamp {
  levels: Readonly<Partial<Record<FacilityKind, number>>>;
  holdings: readonly { material: string; balance: number }[];
}

/** Why a level cannot be built, in the order the panel shows them; `missing` and `short` say exactly what is lacking. */
export type BuildRefusal =
  | { code: "MAX_LEVEL"; message: string }
  | { code: "REQUIRES"; message: string; missing: readonly Requirement[] }
  | { code: "INSUFFICIENT_RESOURCES"; message: string; short: readonly { material: Material; amount: number; balance: number }[] };

/**
 * Why the camp cannot build the facility's next level now, or null when it
 * can. One rule, which the hub checks and the panel shows (Issue-93).
 */
export function buildRefusal(camp: BuildingCamp, kind: FacilityKind): BuildRefusal | null {
  const next = nextLevel(kind, camp.levels[kind] ?? 0);
  const name = FACILITIES[kind].name.toLowerCase();
  if (!next) return { code: "MAX_LEVEL", message: `The ${name} is at its highest level here.` };
  const missing = next.requires.filter((r) => (camp.levels[r.kind] ?? 0) < r.level);
  if (missing.length > 0) {
    const words = missing.map((r) => `a level ${r.level} ${FACILITIES[r.kind].name.toLowerCase()}`).join(" and ");
    return { code: "REQUIRES", message: `Needs ${words} first.`, missing };
  }
  const short = next.cost
    .map(({ material, amount }) => ({ material, amount, balance: camp.holdings.find((h) => h.material === material)?.balance ?? 0 }))
    .filter((s) => s.balance < s.amount);
  if (short.length > 0) {
    const words = short.map((s) => `${s.amount} ${s.material}, and the camp has ${s.balance}`).join("; ");
    return { code: "INSUFFICIENT_RESOURCES", message: `Level ${next.level} costs ${words}.`, short };
  }
  return null;
}

export interface Recruit {
  unitType: UnitType;
  /** The hall level the unit type needs. */
  hallLevel: number;
  /** The cost when the recruit is not the free villager. */
  cost: Cost;
}

/**
 * What a recruit costs a camp with this many living heroes: nothing for a
 * villager when none is alive, so no player is ever locked out (game.md,
 * "The heroes hall"), and the unit type's cost otherwise. The hub charges
 * it and the hall shows it, from this one rule.
 */
export function recruitCost(recruit: Recruit, livingHeroes: number): Cost {
  return recruit.unitType === "villager" && livingHeroes === 0 ? [] : recruit.cost;
}

/**
 * The unlocks: what a player earns once and holds for good (game.md,
 * "Unlocks"; decision 0059). One closed list for every kind of unlock; the
 * list declares the union (typescript.md, rule 18). What needs an unlock
 * names it, a location first, and what grants one names it, a job first.
 */
export const UNLOCK_IDS = ["road-to-highcrag"] as const;
export type UnlockId = (typeof UNLOCK_IDS)[number];

export interface Unlock {
  name: string;
  /** The words said to the player when it is earned. */
  earned: string;
}

/** Every unlock, by its name and the words said when it is earned. The road is granted by the caravan hub's scouting job (Issue-352). */
export const UNLOCKS: Readonly<Record<UnlockId, Unlock>> = {
  "road-to-highcrag": {
    name: "The road to Highcrag",
    earned: "The road to Highcrag is open. You have a camp there now.",
  },
};

/** Whether a string is an unlock of this version's content, as one stored by another version may not be. */
export function isUnlockId(id: string): id is UnlockId {
  return (UNLOCK_IDS as readonly string[]).includes(id);
}

export interface Location {
  id: string;
  name: string;
  /** The unlock a player must hold to have a camp here; the starting location names none (decision 0059). */
  unlock?: UnlockId;
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
      // The first progression (decision 0031): one run of "Pick up sticks"
      // pays for a villager, one run of the mine's first job for a fighter.
      { unitType: "villager", hallLevel: 1, cost: [{ material: "timber", amount: 20 }] },
      // The specialized gatherers (Issue-287): the lumberjack for what
      // villagers bring from one timber run, the miner for an ore run's worth
      // of ore and timber, the alternative to a fighter. Neither needs its
      // facility: the miner's jobs are the mine's already.
      { unitType: "lumberjack", hallLevel: 1, cost: [{ material: "timber", amount: 40 }] },
      { unitType: "miner", hallLevel: 1, cost: [{ material: "ore", amount: 30 }, { material: "timber", amount: 20 }] },
      { unitType: "fighter", hallLevel: 1, cost: [{ material: "ore", amount: 40 }] },
      // The next step (Issue-286): the wolves job's cloth pays for the hall's
      // second level and then for a ranger, the first unit type a hall's
      // level gates.
      { unitType: "ranger", hallLevel: 2, cost: [{ material: "timber", amount: 40 }, { material: "cloth", amount: 10 }] },
    ],
  },
  // A hill fort above a quarry, supplied from Millbrook and not a second
  // start (decision 0059): it recruits no villager, so there is no free hero
  // here, and a camp begins empty until a caravan brings its first. The miner
  // and the fighter cost what they cost at Millbrook; there are no trees, so
  // the miner's timber comes by caravan. Nothing can be built here but the
  // hall's and the warehouse's levels until the quarry and its hub (Issue-356).
  {
    id: "highcrag",
    name: "Highcrag",
    unlock: "road-to-highcrag",
    sharedFacilities: ["job-board"],
    ownFacilities: ["heroes-hall", "warehouse"],
    buildableFacilities: [],
    recruits: [
      { unitType: "miner", hallLevel: 1, cost: [{ material: "ore", amount: 30 }, { material: "timber", amount: 20 }] },
      { unitType: "fighter", hallLevel: 1, cost: [{ material: "ore", amount: 40 }] },
    ],
  },
];

/** A new player starts here, with a camp at level 1 and no heroes. It needs no unlock, and it recruits the villager, so no player is ever locked out. */
export const STARTING_LOCATION = "millbrook";

export function location(id: string): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

/**
 * The locations a player with these unlocks has a camp at, in the content's
 * order: those that need none, and those whose unlock is held (decision
 * 0059). One rule, which the hub's reads and its verbs both use.
 */
export function unlockedLocations(held: ReadonlySet<string>): Location[] {
  return LOCATIONS.filter((l) => l.unlock === undefined || held.has(l.unlock));
}

/** Active heroes a camp can hold, by heroes hall level; index 0 is level 1. */
export const HALL_CAPACITY: readonly number[] = [4, 6, 8];

/** Stock of each resource a camp can hold, by warehouse level; index 0 is level 1. */
export const WAREHOUSE_CAPACITY: readonly number[] = [100, 200, 400];

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
  miner: ["miner-01"],
  lumberjack: ["lumberjack-02"],
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
  "miner-01": "masculine",
  "lumberjack-02": "feminine",
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

// ── The battle ─────────────────────────────────────────────────────

/** The monsters, by the type a fight stage names. Their sprite sets are mapped beside them (Issue-111). */
export const MONSTER_TYPES = ["wolf", "bandit", "goblin-rock-thrower"] as const;
export type MonsterType = (typeof MONSTER_TYPES)[number];

/** The resource nodes a gather stage names. */
export const RESOURCE_TYPES = ["tree", "ore-vein"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Whether a stage's opponent is a resource node, not a monster: a stage lists both together (decision 0051). */
export function isResourceType(type: string): type is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(type);
}

export type AbilityId = "strike" | "strike-weakest" | "bite" | "guard" | "chop" | "mine" | "shoot" | "throw-rock" | "move-up";

const FRONT_ONLY: readonly LineReach[] = [{ actorLine: "front", targetLines: ["front"] }];

const ANY_LINE: readonly LineReach[] = (["front", "near", "far", "back"] as const).map((actorLine) => ({
  actorLine,
  targetLines: ["front", "near", "far", "back"],
}));

/**
 * Every ability a unit type or monster's list names (battle.md).
 * A gather ability works the node with the least left, so a gatherer fells
 * one tree before starting the next (Issue-15). Chop and mine are a strike
 * at a node with their own look: the same damage and the same warmup, so
 * that forcing a strike at a tree gains nothing over chopping it (decision
 * 0051). Each is aimed at the nodes of its kind, those with a drop its trait
 * gathers, whoever swings: no hit gathers anything (decision 0058). A node
 * is worked only when no monster is in the ability's reach, so nobody chops
 * with a wolf at its throat (Issue-341; battle/resolution.ts). A ranged attack reaches every line from every line, which is what
 * makes it the answer to a monster standing behind resource nodes; its
 * warmup is longer than a blow's, and as long as the wind-up and the
 * projectile's flight the page shows as it resolves (decisions 0052 and 0057).
 */
export const ABILITIES: Readonly<Record<AbilityId, AbilityDefinition>> = {
  strike: {
    abilityId: "strike",
    name: "Strike",
    tags: ["melee-attack", "physical", "slashing"],
    targeting: { side: "enemy", reach: FRONT_ONLY, selection: "closest" },
    warmupMs: 300,
    effect: { kind: "damage" },
  },
  "strike-weakest": {
    abilityId: "strike-weakest",
    name: "Strike the weakest",
    tags: ["melee-attack", "physical", "slashing"],
    targeting: { side: "enemy", reach: [{ actorLine: "front", targetLines: ["front", "near"] }], selection: "weakest" },
    warmupMs: 300,
    effect: { kind: "damage" },
  },
  bite: {
    abilityId: "bite",
    name: "Bite",
    tags: ["melee-attack", "physical", "piercing"],
    targeting: { side: "enemy", reach: FRONT_ONLY, selection: "closest" },
    warmupMs: 200,
    effect: { kind: "damage" },
  },
  guard: {
    abilityId: "guard",
    name: "Guard",
    tags: ["support"],
    targeting: { side: "ally", reach: ANY_LINE, selection: "below-half" },
    warmupMs: 0,
    effect: { kind: "guard", durationMs: 4000 },
  },
  chop: {
    abilityId: "chop",
    name: "Chop",
    tags: ["gather", "physical"],
    targeting: { side: "enemy", reach: FRONT_ONLY, selection: "weakest" },
    warmupMs: 300,
    effect: { kind: "gather", trait: "woodcutting" },
  },
  mine: {
    abilityId: "mine",
    name: "Mine",
    tags: ["gather", "physical"],
    targeting: { side: "enemy", reach: FRONT_ONLY, selection: "weakest" },
    warmupMs: 300,
    effect: { kind: "gather", trait: "mining" },
  },
  shoot: {
    abilityId: "shoot",
    name: "Shoot",
    tags: ["ranged-attack", "physical", "piercing"],
    targeting: { side: "enemy", reach: ANY_LINE, selection: "closest" },
    warmupMs: 700,
    effect: { kind: "damage" },
  },
  "throw-rock": {
    abilityId: "throw-rock",
    name: "Throw a rock",
    tags: ["ranged-attack", "physical"],
    targeting: { side: "enemy", reach: ANY_LINE, selection: "closest" },
    warmupMs: 600,
    effect: { kind: "damage" },
  },
  "move-up": {
    abilityId: "move-up",
    name: "Move up",
    tags: ["movement"],
    targeting: { side: "self" },
    warmupMs: 400,
    effect: { kind: "move-up" },
  },
};

/**
 * Each unit type's home line, base stats and one action list, the first
 * usable action winning. A unit type without one cannot join a battle yet.
 * A unit type's gathering traits are in its stats (decision 0058): the
 * villager cuts wood and mines at level 1, the lumberjack cuts wood at level
 * 2 and the miner mines at level 2, each with a villager's body (Issue-287),
 * the ranger skins at level 1 (Issue-340), and the fighter carries none. The
 * villager cannot skin, so hide is the first drop a party gets nothing of
 * without its carrier. A specialist carries its own trait alone to start
 * with; that is where the first unit types start and not a rule, and a unit
 * type added later may carry several (the owner, 2026-11-20). One carrier
 * standing is enough for a party, and a hit gathers nothing, so a fighter
 * costs a resource run nothing. A ranger stands at the back and shoots
 * whatever is closest, monsters before nodes like any unit, and a node when
 * nothing else is left (decision 0052).
 */
export const UNIT_PROFILES: Readonly<Partial<Record<UnitType, CombatProfile>>> = {
  villager: {
    homeLine: "near",
    stats: { maxHealth: 30, speed: 8, damage: 4, traits: [{ trait: "woodcutting", level: 1 }, { trait: "mining", level: 1 }] },
    actions: ["strike", "chop", "mine", "move-up"],
  },
  miner: {
    homeLine: "near",
    stats: { maxHealth: 30, speed: 8, damage: 4, traits: [{ trait: "mining", level: 2 }] },
    actions: ["mine", "chop", "strike", "move-up"],
  },
  lumberjack: {
    homeLine: "near",
    stats: { maxHealth: 30, speed: 8, damage: 4, traits: [{ trait: "woodcutting", level: 2 }] },
    actions: ["chop", "mine", "strike", "move-up"],
  },
  fighter: {
    homeLine: "front",
    stats: { maxHealth: 50, speed: 10, damage: 6, traits: [] },
    actions: ["guard", "strike"],
  },
  ranger: {
    homeLine: "far",
    stats: { maxHealth: 26, speed: 10, damage: 6, traits: [{ trait: "skinning", level: 1 }] },
    actions: ["shoot"],
  },
};

/**
 * The monsters, each with the XP it gives the heroes who survive and what it
 * drops (decision 0058). The wolf's hide is the first drop that is not a
 * staple (Issue-340): one, half the time, to a party that skins at level 1,
 * and one or two, always, at level 2, which no unit type has yet. No job's
 * description mentions it: not every drop is told.
 */
export const MONSTERS: Readonly<Record<MonsterType, MonsterProfile>> = {
  wolf: {
    name: "Wolf",
    homeLine: "front",
    stats: { maxHealth: 24, speed: 12, damage: 3, traits: [] },
    actions: ["bite", "move-up"],
    drops: [{
      material: "hide",
      trait: "skinning",
      levels: [{ chancePercent: 50, min: 1, max: 1 }, { chancePercent: 100, min: 1, max: 2 }],
    }],
    xp: 5,
  },
  bandit: {
    name: "Bandit",
    homeLine: "near",
    stats: { maxHealth: 30, speed: 9, damage: 5, traits: [] },
    actions: ["strike-weakest", "move-up"],
    drops: [],
    xp: 6,
  },
  // Fragile and hard-hitting, on a line melee cannot reach while anything
  // stands in front of it (decision 0052).
  "goblin-rock-thrower": {
    name: "Goblin rock thrower",
    homeLine: "far",
    stats: { maxHealth: 12, speed: 8, damage: 5, traits: [] },
    actions: ["throw-rock"],
    drops: [],
    xp: 5,
  },
};

/**
 * The resource nodes: health, XP, and what each drops when it goes down, a
 * row for each level of the drop's trait (decision 0058). A staple drops
 * always, within a range, so that each step of the first progression is
 * still paid by one run of the job before it at its worst roll (decision
 * 0031): 30 timber a tree and 20 ore a vein at level 1, a villager's, as
 * under decision 0051.
 */
export const RESOURCE_NODES: Readonly<Record<ResourceType, ResourceNodeProfile>> = {
  tree: {
    name: "Tree",
    homeLine: "front",
    health: 40,
    xp: 3,
    drops: [{
      material: "timber",
      trait: "woodcutting",
      levels: [{ chancePercent: 100, min: 30, max: 36 }, { chancePercent: 100, min: 42, max: 50 }],
    }],
  },
  "ore-vein": {
    name: "Ore vein",
    homeLine: "front",
    health: 40,
    xp: 3,
    drops: [{
      material: "ore",
      trait: "mining",
      levels: [{ chancePercent: 100, min: 20, max: 24 }, { chancePercent: 100, min: 28, max: 32 }],
    }],
  },
};

/** The content a battle reads by default. */
export const BATTLE_CONTENT: BattleContent = {
  abilities: ABILITIES,
  heroes: UNIT_PROFILES,
  monsters: MONSTERS,
  resources: RESOURCE_NODES,
};

// ── Jobs and advancement ───────────────────────────────────────────

export type JobId =
  | "pick-up-sticks"
  | "timber-from-the-near-woods"
  | "wolves-on-the-mill-road"
  | "ore-from-the-hill"
  | "goblins-in-the-old-workings"
  | "lumber-from-the-deep-woods"
  | "scout-the-road-to-highcrag"
  | "ore-from-the-crag";

/**
 * The jobs, by id, in the order their poster lists them, easiest first
 * (battle.md, "Millbrook's board"; decision 0031). A job that names a
 * facility is posted by it, not by the job board (Issue-133). A stage ends when
 * everything on the other side is down (decision 0051), and what a job
 * brings home is what its enemies drop for the traits the party carries
 * (decision 0058). Each job's bonus XP is what brings its XP, with the
 * enemies that always appear, to what decision 0030 gave it: 5, 15, 20, 15
 * and 25; the lumber camp's job and Highcrag's, written since, give the ore
 * job's 15, and the caravan hub's scouting job the wolves job's 20. A job's
 * description is all the page tells of it beside its pay and its bonus, so it
 * says what its author chooses to tell. A job may grant unlocks on arrival
 * (decision 0059): the scouting job grants the first, the road to Highcrag.
 *
 * An entry of a fight or a gather stage may vary (decision 0058, Issue-341):
 * its count a range, and a chance of appearing at all, rolled from the
 * adventure's seed by `expandStages`. Every such stage keeps an entry that
 * always appears, its time limit fits its largest roll, and that roll brings
 * home no more of a resource than a level-1 warehouse holds, but for the one
 * resource of a job that the owner accepted at a higher level, which
 * `JOB_WAREHOUSE_LEVEL` names;
 * the content's test checks all three. A job's bonus XP counts only the
 * enemies that always appear: one that appears by chance adds its own.
 */
export const JOBS: Readonly<Record<JobId, Job>> = {
  // A lone villager cannot fail it, whatever it is forced to do (decision
  // 0031). One time in ten a wolf is beside the tree, the first use of a job
  // that varies (Issue-341): the villager strikes the wolf first, since a node
  // is worked only when no monster is in reach, and beats it with a little
  // health left on every seed tried. It is 5 more XP, and a hide to a party
  // that brought a skinner. The description does not say so.
  "pick-up-sticks": {
    id: "pick-up-sticks",
    name: "Pick up sticks",
    description: "One old tree by the village green needs felling. Bring a hero who can cut wood and the timber is yours.",
    location: "millbrook",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      { kind: "gather", opponents: [{ type: "tree", count: 1 }, { type: "wolf", count: 1, chancePercent: 10 }], timeLimitMs: 60_000 },
      { kind: "arrive" },
    ],
    pay: [],
    bonusXp: 2,
  },
  "timber-from-the-near-woods": {
    id: "timber-from-the-near-woods",
    name: "Timber from the near woods",
    description: "Two trees in the near woods are marked for felling. Bring the wood home; a wolf has been seen on the path.",
    location: "millbrook",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      { kind: "gather", opponents: [{ type: "tree", count: 2 }], timeLimitMs: 90_000 },
      { kind: "fight", opponents: [{ type: "wolf", count: 1 }], timeLimitMs: 60_000 },
      { kind: "arrive" },
    ],
    pay: [{ material: "cloth", amount: 3 }],
    bonusXp: 4,
  },
  // A lone villager dies here on every seed; a fighter with a villager, or
  // three villagers, clear it (decision 0031).
  "wolves-on-the-mill-road": {
    id: "wolves-on-the-mill-road",
    name: "Wolves on the mill road",
    description: "Two wolves have been at the miller's carts. The weavers pay in cloth to see the road clear.",
    location: "millbrook",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      { kind: "fight", opponents: [{ type: "wolf", count: 2 }], timeLimitMs: 60_000 },
      { kind: "arrive" },
    ],
    pay: [{ material: "cloth", amount: 10 }],
    bonusXp: 10,
  },
  // The mine's first job, which pays for a fighter (decision 0031). It
  // mirrors the timber job; a lone villager completes it on every seed tried.
  "ore-from-the-hill": {
    id: "ore-from-the-hill",
    name: "Ore from the hill",
    description: "Two veins show at the mine's mouth. Dig them out; a wolf dens in the old workings.",
    location: "millbrook",
    facility: "mine",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      { kind: "gather", opponents: [{ type: "ore-vein", count: 2 }], timeLimitMs: 90_000 },
      { kind: "fight", opponents: [{ type: "wolf", count: 1 }], timeLimitMs: 60_000 },
      { kind: "arrive" },
    ],
    pay: [],
    bonusXp: 4,
  },
  // The first mixed stage (Issue-286, decision 0052): the veins hold the
  // front line and the goblins throw from behind them, out of melee's reach
  // until the veins fall. Villagers alone need four and usually lose one; a
  // ranger with two villagers clears it with no death.
  "goblins-in-the-old-workings": {
    id: "goblins-in-the-old-workings",
    name: "Goblins in the old workings",
    description: "Three good veins lie deeper in, and goblins have moved in behind them. They throw rocks at anyone who digs.",
    location: "millbrook",
    facility: "mine",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      { kind: "gather", opponents: [{ type: "ore-vein", count: 3 }, { type: "goblin-rock-thrower", count: 2 }], timeLimitMs: 120_000 },
      { kind: "arrive" },
    ],
    pay: [],
    bonusXp: 6,
  },
  // The lumber camp's first job (Issue-291), and the first written for
  // decision 0058's shape, not converted to it: three trees or four, and on
  // half its runs a wolf or two among them. The puzzle is the owner's, a
  // woodcutter for the trees and a skinner for the wolves that may appear, in
  // a party that survives them: two wolves come on one run in four, and then
  // a lone villager, lumberjack, miner or ranger always falls and a lone
  // fighter on about half; a fighter beside the cutter makes it safe. It brings
  // home clearly more timber than the board's timber job, 90 to 144 for
  // villagers and 126 to 200 for a lumberjack, which a level-1 warehouse
  // cannot hold (`JOB_WAREHOUSE_LEVEL`). Its XP is 15 at its least roll, as
  // the mine's first job, and 28 at its largest. The description names
  // neither the wolves nor their hides.
  "lumber-from-the-deep-woods": {
    id: "lumber-from-the-deep-woods",
    name: "Lumber from the deep woods",
    description: "The old stand in the deep woods is marked for the camp's axes: three trees at least, and some days a fourth worth felling. Cutters who went out alone have not all come back.",
    location: "millbrook",
    facility: "lumber-camp",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      {
        kind: "gather",
        opponents: [{ type: "tree", count: { min: 3, max: 4 } }, { type: "wolf", count: { min: 1, max: 2 }, chancePercent: 50 }],
        timeLimitMs: 180_000,
      },
      { kind: "arrive" },
    ],
    pay: [],
    bonusXp: 6,
  },
  // The caravan hub's first job, and the first that grants an unlock
  // (Issue-352, decision 0059): a plain job with no cart, the road and two
  // bandits on it, and on arrival the road to Highcrag is the player's. It is
  // the bandit's first job, and a step past the wolves job: no lone hero of a
  // type Millbrook recruits comes through it, nor do two villagers; a fighter
  // with a villager opens the road on every seed tried and loses one of the
  // two on about one run in four; two fighters, a fighter with a ranger and a
  // villager, and a fighter with three villagers open it with nobody lost. Its
  // description says what it opens, and it stays listed once the road is
  // open, a job like any other.
  "scout-the-road-to-highcrag": {
    id: "scout-the-road-to-highcrag",
    name: "Scout the road to Highcrag",
    description: "Nobody has walked the hill road to Highcrag since bandits took it. Clear it as far as the fort's gate and the way is open: you will have a camp there. One sword is not enough.",
    location: "millbrook",
    facility: "caravan-hub",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      { kind: "fight", opponents: [{ type: "bandit", count: 2 }], timeLimitMs: 60_000 },
      { kind: "arrive" },
    ],
    pay: [],
    bonusXp: 8,
    grants: ["road-to-highcrag"],
  },
  // Highcrag's one board job (Issue-351, decision 0059): the mine's first
  // job on another hill, two veins and then a wolf, for the parties Highcrag
  // can field. A lone miner completes it on every seed tried, with no death,
  // and brings home 56 to 64 ore, which pays for a fighter at its worst roll;
  // a fighter alone comes through it with no ore, having no trait to mine by.
  "ore-from-the-crag": {
    id: "ore-from-the-crag",
    name: "Ore from the crag",
    description: "Two veins run bare along the crag below the fort. Dig them out; a wolf comes down off the scree at dusk.",
    location: "highcrag",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      { kind: "gather", opponents: [{ type: "ore-vein", count: 2 }], timeLimitMs: 90_000 },
      { kind: "fight", opponents: [{ type: "wolf", count: 1 }], timeLimitMs: 60_000 },
      { kind: "arrive" },
    ],
    pay: [],
    bonusXp: 4,
  },
};

/**
 * For a job whose largest roll passes a level-1 warehouse: the one resource
 * the owner accepted that for, and the warehouse level whose cap holds it at
 * the best row of its drop. Every other job, and every other resource of a
 * job named here, fits level 1, and the content's test holds each to that.
 * The lumber camp's job is the first, for its timber (the owner, 2026-11-23,
 * Issue-291; decision 0058, its fourth amendment): the board's timber job
 * already reaches a level-1 warehouse's 100 at a lumberjack's best roll, so a
 * job with clearly more timber passes it. A level-1 warehouse loses what it
 * cannot hold, the result says how much, and the job is what makes the second
 * level worth building.
 */
export const JOB_WAREHOUSE_LEVEL: Readonly<Partial<Record<JobId, { readonly material: Material; readonly level: number }>>> = {
  "lumber-from-the-deep-woods": { material: "timber", level: 2 },
};

/** The job with this id, or undefined for an id this version's content does not know, as an adventure of another version may carry. */
export function jobOf(id: string): Job | undefined {
  return Object.hasOwn(JOBS, id) ? JOBS[id as JobId] : undefined;
}

/**
 * The jobs a poster at a location lists, in the content's order: the job
 * board's are those that name no facility, and a facility's those that name
 * it (Issue-133). The hub starts only these, and the panels list them.
 */
export function jobsPostedBy(locationId: string, poster: FacilityKind): Job[] {
  return Object.values(JOBS).filter((job) => job.location === locationId && (job.facility ?? "job-board") === poster);
}

/** A retreat in a fight: an attempt every 2 s, 30% at first, 20 points more after each failure. */
export const RETREAT: RetreatRule = { intervalMs: 2000, firstChancePercent: 30, risePercent: 20 };

/** The content an adventure reads by default. */
export const ADVENTURE_CONTENT: AdventureContent = { battle: BATTLE_CONTENT, jobs: JOBS, retreat: RETREAT };

/**
 * The total XP each level needs; index 0 is level 1. One wolves job takes a
 * hero to level 2, so the fighter's first level is easy to reach.
 */
export const LEVEL_XP: readonly number[] = [0, 10, 30, 60, 100, 150, 210, 280, 360, 450];

/** The level a hero with this much XP has, at most the table's last. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < LEVEL_XP.length && xp >= (LEVEL_XP[level] ?? Infinity)) level++;
  return level;
}
