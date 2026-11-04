import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { configFromEnv, createDocumentClient } from "../src/db/client.js";
import {
  AdventureAlreadyOpen,
  AlreadyApplied,
  InsufficientBalance,
  Repository,
} from "../src/db/repository.js";
import { player } from "./data.js";

let repo: Repository;

beforeAll(() => {
  const config = configFromEnv();
  repo = new Repository(createDocumentClient(config), config.tables);
});

const at = "millbrook";

/** An adventure with no party: these tests are of the open item and the record, not the heroes. */
const adventure = (adventureId: string, seed: string) => ({
  adventureId,
  seed,
  location: at,
  jobId: "wolves-on-the-mill-road",
  snapshot: { version: "v", jobId: "wolves-on-the-mill-road", heroes: [] },
  version: "v",
  startedAt: new Date().toISOString(),
});

describe("start: one open adventure per player", () => {
  it("opens one and refuses a second", async () => {
    const p = player();
    await repo.putPlayer({ id: p, name: "Ada" });
    const first = await repo.startAdventure(p, adventure(randomUUID(), "seed-1"));
    expect(await repo.openAdventure(p)).toEqual({ adventureId: first.adventureId, seed: "seed-1", startedAt: first.startedAt });
    expect(await repo.getAdventure(first.adventureId)).toEqual(first);
    await expect(repo.startAdventure(p, adventure(randomUUID(), "seed-2"))).rejects.toBeInstanceOf(AdventureAlreadyOpen);
  });

  it("lets exactly one of two concurrent starts win", async () => {
    const p = player();
    await repo.putPlayer({ id: p, name: "Bea" });
    const results = await Promise.allSettled([
      repo.startAdventure(p, adventure(randomUUID(), "a")),
      repo.startAdventure(p, adventure(randomUUID(), "b")),
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
    await repo.setBalance(p, at, "timber", 10);
    await repo.debit(p, at, "adv-1", "timber", 7);
    expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 3 }]);
    await expect(repo.debit(p, at, "adv-2", "timber", 4)).rejects.toBeInstanceOf(InsufficientBalance);
    expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 3 }]);
  });

  it("applies the same debit only once", async () => {
    const p = player();
    await repo.setBalance(p, at, "ore", 10);
    await repo.debit(p, at, "adv-1", "ore", 2);
    await expect(repo.debit(p, at, "adv-1", "ore", 2)).rejects.toBeInstanceOf(AlreadyApplied);
    expect(await repo.holdings(p, at)).toEqual([{ material: "ore", balance: 8 }]);
  });

  it("lets exactly one of two concurrent debits that together exceed the balance succeed", async () => {
    const p = player();
    await repo.setBalance(p, at, "cloth", 10);
    const results = await Promise.allSettled([
      repo.debit(p, at, "adv-a", "cloth", 7),
      repo.debit(p, at, "adv-b", "cloth", 7),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilled).toBe(1);
    expect(await repo.holdings(p, at)).toEqual([{ material: "cloth", balance: 3 }]);
  });
});
