import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { Repository } from "../src/db/repository.js";
import { readAdventure } from "../src/read.js";
import { submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";
import { connected, opened as openedBy, player } from "./data.js";
import { PREVIOUS_VERSION as version } from "./versions.js";

/**
 * readAdventure against DynamoDB Local (graphql.md, rules 8 and 11): any
 * settled adventure, for its replay; an open or discarded one only for its
 * own player; nothing for an id with no adventure.
 */

let repo: Repository;

beforeAll(() => {
  ({ repo } = connected());
});

const wolves = "wolves-on-the-mill-road";

const opened = (p: string) => openedBy(repo, p, version, wolves);

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
