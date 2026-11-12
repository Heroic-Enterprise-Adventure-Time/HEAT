/**
 * The game's static content: the locations, what each recruits, the caps of
 * the hall and the warehouse per level, the hero names, the sprite sets each
 * unit type allows, and the battle's abilities, unit types, monsters and
 * resource nodes, the jobs, and the XP each level needs. TypeScript data, imported by the hub and the client alike
 * (decision 0013); a change here is a change to the rules, reviewed like
 * code. The design is docs/design/game.md, "Locations and camps", "The heroes
 * hall", "Resources" and "The battle", and the jobs, the retreat and the XP
 * table at the end; the numbers are its working assumptions.
 */

import type { AdventureContent, Job, RetreatRule } from "./adventure/index.js";
import type { AbilityDefinition, BattleContent, CombatProfile, LineReach, MonsterProfile, ResourceNodeProfile } from "./battle/index.js";
import type { Material } from "./index.js";

/** The unit types that have a sprite set. Those with a combat profile are in `UNIT_PROFILES`. The list declares the union (typescript.md, rule 18). */
export const UNIT_TYPES = ["villager", "fighter", "knight", "ranger", "wizard", "priest"] as const;
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
      // The first progression (decision 0031): one run of "Pick up sticks"
      // pays for a villager, one run of the mine's first job for a fighter.
      { unitType: "villager", hallLevel: 1, cost: [{ material: "timber", amount: 20 }] },
      { unitType: "fighter", hallLevel: 1, cost: [{ material: "ore", amount: 40 }] },
      // The next step (Issue-286): the wolves job's cloth pays for the hall's
      // second level and then for a ranger, the first unit type a hall's
      // level gates.
      { unitType: "ranger", hallLevel: 2, cost: [{ material: "timber", amount: 40 }, { material: "cloth", amount: 10 }] },
    ],
  },
];

/** A new player starts here, with a camp at level 1 and no heroes. */
export const STARTING_LOCATION = "millbrook";

export function location(id: string): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
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
  // Made before their unit types (Issue-285), which Issue-287 adds to SPRITE_SETS.
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
 * Every ability a unit type or monster's list names (game.md, "The battle").
 * A gather ability works the node with the least left, so a gatherer fells
 * one tree before starting the next (Issue-15). Chop and mine are a strike
 * at a node with their own look: the same damage and the same warmup, so
 * that forcing a strike at a tree gains nothing over chopping it (decision
 * 0051). A ranged attack reaches every line from every line, which is what
 * makes it the answer to a monster standing behind resource nodes; its
 * warmup is its wind-up and its projectile's flight together (decision 0052).
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
    effect: { kind: "gather", material: "timber" },
  },
  mine: {
    abilityId: "mine",
    name: "Mine",
    tags: ["gather", "physical"],
    targeting: { side: "enemy", reach: FRONT_ONLY, selection: "weakest" },
    warmupMs: 300,
    effect: { kind: "gather", material: "ore" },
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
 * A villager's gather ratings are low in both timber and ore, below a
 * node's difficulty, so it brings home a share of each; a specialized
 * gatherer later meets the difficulty in one of them, and a combat unit has
 * no rating, so its hits waste a node (decision 0051). A ranger stands at
 * the back and shoots whatever is closest, monsters before nodes like any
 * unit; with nothing else left it shoots a node and wastes its share of it
 * (the owner's call on Issue-286).
 */
export const UNIT_PROFILES: Readonly<Partial<Record<UnitType, CombatProfile>>> = {
  villager: {
    homeLine: "near",
    stats: { maxHealth: 30, speed: 8, damage: 4, gather: [{ material: "timber", rating: 2 }, { material: "ore", rating: 2 }] },
    actions: ["strike", "chop", "mine", "move-up"],
  },
  fighter: {
    homeLine: "front",
    stats: { maxHealth: 50, speed: 10, damage: 6, gather: [] },
    actions: ["guard", "strike"],
  },
  ranger: {
    homeLine: "far",
    stats: { maxHealth: 26, speed: 10, damage: 6, gather: [] },
    actions: ["shoot"],
  },
};

export const MONSTERS: Readonly<Record<MonsterType, MonsterProfile>> = {
  wolf: {
    name: "Wolf",
    homeLine: "front",
    stats: { maxHealth: 24, speed: 12, damage: 3, gather: [] },
    actions: ["bite", "move-up"],
  },
  bandit: {
    name: "Bandit",
    homeLine: "near",
    stats: { maxHealth: 30, speed: 9, damage: 5, gather: [] },
    actions: ["strike-weakest", "move-up"],
  },
  // Fragile and hard-hitting, on a line melee cannot reach while anything
  // stands in front of it (decision 0052).
  "goblin-rock-thrower": {
    name: "Goblin rock thrower",
    homeLine: "far",
    stats: { maxHealth: 12, speed: 8, damage: 5, gather: [] },
    actions: ["throw-rock"],
  },
};

/**
 * The resource nodes: health, the gather rating that harvests one in full,
 * and the most it gives (decision 0051). A villager, at 2 against 3, brings
 * home two thirds: 30 timber a tree, 20 ore a vein.
 */
export const RESOURCE_NODES: Readonly<Record<ResourceType, ResourceNodeProfile>> = {
  tree: { name: "Tree", homeLine: "front", material: "timber", health: 40, difficulty: 3, maxYield: 45 },
  "ore-vein": { name: "Ore vein", homeLine: "front", material: "ore", health: 40, difficulty: 3, maxYield: 30 },
};

/** The content a battle reads by default. */
export const BATTLE_CONTENT: BattleContent = {
  abilities: ABILITIES,
  heroes: UNIT_PROFILES,
  monsters: MONSTERS,
  resources: RESOURCE_NODES,
};

// ── Jobs and advancement ───────────────────────────────────────────

export type JobId = "pick-up-sticks" | "timber-from-the-near-woods" | "wolves-on-the-mill-road" | "ore-from-the-hill" | "goblins-in-the-old-workings";

/**
 * The jobs, by id, in the order their poster lists them, easiest first
 * (game.md, "The battle"; decision 0031). A job that names a facility is
 * posted by it, not by the job board (Issue-133). A stage ends when
 * everything on the other side is down, so its nodes' maximums are the most
 * a job brings home, and what the party's gather ratings make of them is
 * what it does (decision 0051). A retreat forfeits the pay; from a gathering
 * job it keeps what was gathered. A retreat earns half the XP.
 */
export const JOBS: Readonly<Record<JobId, Job>> = {
  // A lone villager cannot fail it: no monster, and its time limit is beyond
  // even a villager forced to swing at the tree every turn (decision 0031).
  "pick-up-sticks": {
    id: "pick-up-sticks",
    name: "Pick up sticks",
    description: "One old tree by the village green needs felling. Bring the wood home; nothing out there bites.",
    location: "millbrook",
    stages: [
      { kind: "travel", lengthMs: 4000 },
      { kind: "gather", opponents: [{ type: "tree", count: 1 }], timeLimitMs: 60_000 },
      { kind: "arrive" },
    ],
    pay: [],
    xp: 5,
    retreat: { keepsPay: false, keepsCargo: true, xpPercent: 50 },
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
    xp: 15,
    retreat: { keepsPay: false, keepsCargo: true, xpPercent: 50 },
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
    xp: 20,
    retreat: { keepsPay: false, keepsCargo: true, xpPercent: 50 },
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
    xp: 15,
    retreat: { keepsPay: false, keepsCargo: true, xpPercent: 50 },
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
    xp: 25,
    retreat: { keepsPay: false, keepsCargo: true, xpPercent: 50 },
  },
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
