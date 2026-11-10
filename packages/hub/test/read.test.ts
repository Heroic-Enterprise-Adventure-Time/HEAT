import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { configFromEnv, createDocumentClient } from "../src/db/client.js";
import { Repository } from "../src/db/repository.js";
import { readAdventure } from "../src/read.js";
import { recruitHero } from "../src/recruit.js";
import { startAdventure } from "../src/start.js";
import { submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";
import { player } from "./data.js";

/**
 * readAdventure against DynamoDB Local (graphql.md, rules 8 and 11): any
 * settled adventure, for its replay; an open or discarded one only for its
 * own player; nothing for an id with no adventure.
 */

let repo: Repository;

beforeAll(() => {
  const config = configFromEnv();
  repo = new Repository(createDocumentClient(config), config.tables);
});

const at = "millbrook";
const wolves = "wolves-on-the-mill-road";
const version = "fedcba9876543210fedcba9876543210fedcba98";

/** A player's adventure, open, with the free villager. */
async function opened(p: string) {
  const villager = await recruitHero(repo, p, "villager", randomUUID());
  return startAdventure(repo, p, version, randomUUID(), at, wolves, [villager.id]);
}

describe("readAdventure", () => {
  it("answers an open adventure to its player only", async () => {
    const p = player();
    const adventure = await opened(p);
    expect(await readAdventure(repo, p, adventure.adventureId)).toEqual(adventure);
    expect(await readAdventure(repo, player(), adventure.adventureId)).toBeUndefined();
  });

  it("answers a discarded adventure to its player only", async () => {
    const p = player();
    const adventure = await opened(p);
    await repo.discard(p, adventure);
    expect(await readAdventure(repo, p, adventure.adventureId)).toMatchObject({ status: "DISCARDED" });
    expect(await readAdventure(repo, player(), adventure.adventureId)).toBeUndefined();
  });

  it("answers a settled adventure to anyone", async () => {
    const p = player();
    const adventure = await opened(p);
    await submitAdventure(repo, new MemoryTimelines(), p, version, adventure.adventureId, []);
    expect(await readAdventure(repo, p, adventure.adventureId)).toMatchObject({ status: "SETTLED" });
    expect(await readAdventure(repo, player(), adventure.adventureId)).toMatchObject({ status: "SETTLED" });
  });

  it("answers nothing for an id with no adventure", async () => {
    expect(await readAdventure(repo, player(), randomUUID())).toBeUndefined();
  });
});
