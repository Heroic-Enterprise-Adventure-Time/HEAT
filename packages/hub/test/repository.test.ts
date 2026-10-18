import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { configFromEnv, createDocumentClient } from "../src/db/client.js";
import {
  AdventureAlreadyOpen,
  AlreadyApplied,
  AlreadySettled,
  InsufficientBalance,
  Repository,
} from "../src/db/repository.js";

let repo: Repository;

beforeAll(() => {
  const config = configFromEnv();
  repo = new Repository(createDocumentClient(config), config.tables);
});

const player = () => `p-${randomUUID()}`;

describe("start: one open adventure per player", () => {
  it("opens one and refuses a second", async () => {
    const p = player();
    await repo.putPlayer({ id: p, name: "Ada" });
    const first = await repo.startAdventure(p, randomUUID(), "seed-1");
    expect(await repo.openAdventure(p)).toEqual(first);
    await expect(repo.startAdventure(p, randomUUID(), "seed-2")).rejects.toBeInstanceOf(AdventureAlreadyOpen);
  });

  it("lets exactly one of two concurrent starts win", async () => {
    const p = player();
    await repo.putPlayer({ id: p, name: "Bea" });
    const results = await Promise.allSettled([
      repo.startAdventure(p, randomUUID(), "a"),
      repo.startAdventure(p, randomUUID(), "b"),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(AdventureAlreadyOpen);
    const open = await repo.openAdventure(p);
    expect(open?.adventureId).toBe((won[0] as PromiseFulfilledResult<{ adventureId: string }>).value.adventureId);
  });
});

describe("debit: the ledger never goes negative", () => {
  it("debits within the balance and refuses beyond it", async () => {
    const p = player();
    await repo.setBalance(p, "timber", 10);
    await repo.debit(p, "adv-1", "timber", 7);
    expect(await repo.holdings(p)).toEqual([{ material: "timber", balance: 3 }]);
    await expect(repo.debit(p, "adv-2", "timber", 4)).rejects.toBeInstanceOf(InsufficientBalance);
    expect(await repo.holdings(p)).toEqual([{ material: "timber", balance: 3 }]);
  });

  it("applies the same debit only once", async () => {
    const p = player();
    await repo.setBalance(p, "ore", 10);
    await repo.debit(p, "adv-1", "ore", 2);
    await expect(repo.debit(p, "adv-1", "ore", 2)).rejects.toBeInstanceOf(AlreadyApplied);
    expect(await repo.holdings(p)).toEqual([{ material: "ore", balance: 8 }]);
  });

  it("lets exactly one of two concurrent debits that together exceed the balance succeed", async () => {
    const p = player();
    await repo.setBalance(p, "cloth", 10);
    const results = await Promise.allSettled([
      repo.debit(p, "adv-a", "cloth", 7),
      repo.debit(p, "adv-b", "cloth", 7),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilled).toBe(1);
    expect(await repo.holdings(p)).toEqual([{ material: "cloth", balance: 3 }]);
  });
});

describe("settle: rewards once, keyed on the adventure", () => {
  it("credits rewards, closes the adventure, and refuses a redelivery", async () => {
    const p = player();
    await repo.putPlayer({ id: p, name: "Cy" });
    const adv = randomUUID();
    await repo.startAdventure(p, adv, "seed");
    const rewards = [
      { material: "timber", amount: 3 },
      { material: "ore", amount: 2 },
    ];
    await repo.settle(p, adv, rewards);
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect((await repo.getAdventure(adv))?.status).toBe("SETTLED");
    const holdings = await repo.holdings(p);
    expect(holdings).toEqual(
      expect.arrayContaining([
        { material: "timber", balance: 3 },
        { material: "ore", balance: 2 },
      ]),
    );
    await expect(repo.settle(p, adv, rewards)).rejects.toBeInstanceOf(AlreadySettled);
    expect(await repo.holdings(p)).toEqual(holdings);
  });

  it("will not settle an adventure that is not the open one", async () => {
    const p = player();
    await repo.putPlayer({ id: p, name: "Di" });
    await repo.startAdventure(p, "open-one", "s");
    await expect(repo.settle(p, "some-other", [])).rejects.toBeInstanceOf(AlreadySettled);
    expect((await repo.openAdventure(p))?.adventureId).toBe("open-one");
  });
});
