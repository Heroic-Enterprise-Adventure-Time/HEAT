/**
 * A caravan's cart in a battle (decision 0059; Issue-353): a party member
 * with health and no actions, on the near line, hit and guarded like any
 * ally, and not a hero. The bandit strikes it first when it is in reach.
 */

import { describe, expect, it } from "vitest";

import { BATTLE_CONTENT, type BattleContent, type BattleSetup, CART, CombatEngine, MONSTERS, must, resolveBattle } from "../../src/index.js";
import { contentWith, hero, ofKind, opponent, runAll, setup } from "./helpers.js";

/** A battle set up with a cart beside the party, at full health unless another is given. */
function withCart(battle: BattleSetup, health: number = CART.health): BattleSetup {
  return { ...battle, cart: { unitId: "cart", health } };
}

/** The game's content with the cart's home line moved. */
function cartOn(line: BattleContent["cart"]["homeLine"]): BattleContent {
  return { ...BATTLE_CONTENT, cart: { ...BATTLE_CONTENT.cart, homeLine: line } };
}

const fighterAndBandit = (seed: string): BattleSetup => setup([hero("fighter-1", "fighter")], [opponent("bandit-1", "bandit")], seed);

describe("a caravan's cart in a battle", () => {
  it("stands with the party on the near line, as a cart and not a hero, with the content's health", () => {
    const outcome = resolveBattle(withCart(fighterAndBandit("stands")));
    const cart = must(outcome.timeline.participants.find((p) => p.unitId === "cart"), "the cart among the participants");
    expect(cart).toEqual({ unitId: "cart", kind: "cart", type: "cart", side: "party", line: "near", health: CART.health, maxHealth: CART.health });
  });

  it("never takes a turn and is never forced to act", () => {
    const engine = new CombatEngine(withCart(fighterAndBandit("no-turn")));
    const events = runAll(engine);
    expect(ofKind(events, "turn-start").filter((e) => e.unitId === "cart")).toEqual([]);
    expect(ofKind(events, "action-declared").filter((e) => e.unitId === "cart")).toEqual([]);
    expect(() => {
      new CombatEngine(withCart(fighterAndBandit("no-override"))).submitOverride("cart", { kind: "force-action", abilityId: "strike" });
    }).toThrow(/heroes/);
  });

  it("is refused at no health, or at more than the content's", () => {
    expect(() => new CombatEngine(withCart(fighterAndBandit("none"), 0))).toThrow(/cart/);
    expect(() => new CombatEngine(withCart(fighterAndBandit("over"), CART.health + 1))).toThrow(/cart/);
  });

  it("is what a bandit strikes first while the cart is in its reach", () => {
    const events = runAll(new CombatEngine(withCart(fighterAndBandit("aim"), CART.health)));
    const bandit = ofKind(events, "action-resolved").filter((e) => e.unitId === "bandit-1");
    expect(bandit.length).toBeGreaterThan(0);
    const down = ofKind(events, "unit-down").find((e) => e.unitId === "cart")?.timestamp ?? Infinity;
    for (const blow of bandit.filter((e) => e.timestamp < down)) {
      expect(blow.abilityId).toBe("strike-cart");
      expect(blow.targetIds).toEqual(["cart"]);
    }
  });

  it("is not aimed at by a bandit when the cart stands out of its reach, and the bandit strikes as it did", () => {
    const events = runAll(new CombatEngine(withCart(fighterAndBandit("far")), cartOn("far")));
    const bandit = ofKind(events, "action-resolved").filter((e) => e.unitId === "bandit-1");
    expect(bandit.length).toBeGreaterThan(0);
    for (const blow of bandit) {
      expect(blow.abilityId).toBe("strike-weakest");
      expect(blow.targetIds).toEqual(["fighter-1"]);
    }
  });

  it("leaves a bandit's battle with no cart as it was: the same timeline with the bandit's old list", () => {
    const oldList = contentWith({ monsters: { bandit: { actions: ["strike-weakest", "move-up"] } } });
    for (const seed of ["absent-1", "absent-2", "absent-3"]) {
      const battle = setup([hero("fighter-1", "fighter"), hero("villager-2", "villager")], [opponent("bandit-1", "bandit"), opponent("bandit-2", "bandit")], seed);
      expect(resolveBattle(battle).timeline.events, seed).toEqual(resolveBattle(battle, oldList).timeline.events);
    }
  });

  it("is hit like any party member: a wolf bites it when it is the closest", () => {
    // The cart alone on the front line, the fighter behind it.
    const content = { ...contentWith({ heroes: { fighter: { homeLine: "near" } } }), cart: { ...CART, homeLine: "front" as const } };
    const events = runAll(new CombatEngine(withCart(setup([hero("fighter-1", "fighter")], [opponent("wolf-1", "wolf")], "bitten")), content));
    const bites = ofKind(events, "action-resolved").filter((e) => e.abilityId === "bite");
    expect(bites.length).toBeGreaterThan(0);
    expect(bites[0]?.effects[0]).toEqual({ kind: "damage", targetId: "cart", amount: MONSTERS.wolf.stats.damage, newHealth: CART.health - MONSTERS.wolf.stats.damage });
  });

  it("is covered by a fighter's guard below half its health, the guard taking the blows aimed at it", () => {
    const events = runAll(new CombatEngine(withCart(fighterAndBandit("guarded"), CART.health / 2 - 1)));
    const guards = ofKind(events, "action-resolved").filter((e) => e.abilityId === "guard");
    expect(guards[0]?.effects[0]).toMatchObject({ kind: "guard", targetId: "cart" });
    const covered = ofKind(events, "action-resolved").filter((e) => e.abilityId === "strike-cart" && e.effects.some((f) => f.kind === "damage" && f.targetId === "fighter-1"));
    expect(covered.length).toBeGreaterThan(0);
    for (const blow of covered) expect(blow.effects[0]).toMatchObject({ kind: "damage", targetId: "fighter-1", guarding: "cart" });
  });

  it("is broken at no health, gives nothing as it goes down, and the battle goes on", () => {
    const outcome = resolveBattle(withCart(fighterAndBandit("broken"), 1));
    const events = outcome.timeline.events;
    expect(ofKind(events, "unit-down").map((e) => e.unitId)).toContain("cart");
    expect(must(outcome.units.find((u) => u.unitId === "cart"), "the cart's end")).toEqual({ unitId: "cart", health: 0, alive: false });
    expect(ofKind(events, "drop").filter((e) => e.unitId === "cart")).toEqual([]);
    expect(outcome.result).toBe("win");
    expect(outcome.xp).toBe(MONSTERS.bandit.xp);
  });

  it("does not keep a party standing whose heroes are all down: the battle is lost with the cart whole", () => {
    // The villager alone on the front line, so the wolf's first bite is its, and its last.
    const content = contentWith({ heroes: { villager: { homeLine: "front", actions: ["move-up"] } } });
    const outcome = resolveBattle(withCart(setup([hero("villager-1", "villager", 1)], [opponent("wolf-1", "wolf")], "lost"), CART.health), content);
    expect(outcome.result).toBe("loss");
    expect(must(outcome.units.find((u) => u.unitId === "cart"), "the cart's end")).toEqual({ unitId: "cart", health: CART.health, alive: true });
  });

  it("carries no trait: a fighter beside a cart fells a tree and nothing drops, and a villager's timber is what it is alone", () => {
    const tree = [opponent("tree-1", "tree")];
    const fighter = resolveBattle(withCart(setup([hero("fighter-1", "fighter")], tree, "trait")));
    expect(fighter.result).toBe("win");
    expect(fighter.drops).toEqual({});
    const alone = resolveBattle(setup([hero("villager-1", "villager")], tree, "trait"));
    const beside = resolveBattle(withCart(setup([hero("villager-1", "villager")], tree, "trait")));
    expect(beside.drops).toEqual(alone.drops);
    expect(beside.drops.timber).toBeGreaterThan(0);
  });

  it("is deterministic: the same setup with a cart gives the same timeline", () => {
    for (const seed of ["same-1", "same-2", "same-3"]) {
      const battle = withCart(setup([hero("fighter-1", "fighter"), hero("villager-2", "villager")], [opponent("bandit-1", "bandit"), opponent("wolf-1", "wolf")], seed));
      expect(resolveBattle(battle).timeline, seed).toEqual(resolveBattle(battle).timeline);
    }
  });
});
