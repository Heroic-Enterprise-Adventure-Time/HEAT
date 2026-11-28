import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { must } from "@heat/engine";

import { Repository } from "../src/db/repository.js";
import { jobOfAdventure, readAdventure, readOpenAdventure, readTimeline } from "../src/read.js";
import { submitAdventure } from "../src/submit.js";
import { MemoryTimelines, type Timelines } from "../src/timelines.js";
import { connected, opened as openedBy, player } from "./data.js";
import { PREVIOUS_VERSION as version } from "./versions.js";

/**
 * readAdventure against DynamoDB Local (graphql.md, rules 8 and 11): any
 * settled adventure, for its replay; an open or discarded one only for its
 * own player; nothing for an id with no adventure. And the reads the
 * Adventure and Player types make through this module: the open adventure,
 * a settled adventure's timeline, and the job an adventure names.
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

describe("readOpenAdventure", () => {
  it("answers the player's open adventure whole, and nothing before one is started or after it settles", async () => {
    const p = player();
    expect(await readOpenAdventure(repo, p)).toBeUndefined();
    const adventure = await opened(p);
    expect(await readOpenAdventure(repo, p)).toEqual(adventure);
    expect(await readOpenAdventure(repo, player())).toBeUndefined();
    await submitAdventure(repo, new MemoryTimelines(), p, version, adventure.adventureId, []);
    expect(await readOpenAdventure(repo, p)).toBeUndefined();
  });
});

describe("readTimeline", () => {
  /** A store that must not be asked. */
  const unasked: Timelines = {
    putIfAbsent: () => Promise.reject(new Error("the store was written")),
    get: () => Promise.reject(new Error("the store was read")),
  };

  it("answers nothing for an adventure that is not settled, without asking the store", async () => {
    const adventure = await opened(player());
    expect(await readTimeline(unasked, adventure)).toBeUndefined();
  });

  it("answers a settled adventure's timeline as the JSON the settlement stored", async () => {
    const p = player();
    const adventure = await opened(p);
    const timelines = new MemoryTimelines();
    const settled = await submitAdventure(repo, timelines, p, version, adventure.adventureId, []);
    const stored = must(await timelines.get(adventure.adventureId), "the stored timeline");
    expect(await readTimeline(timelines, settled)).toEqual(JSON.parse(stored));
  });

  it("answers nothing for a settled adventure the store holds no timeline for", async () => {
    const p = player();
    const adventure = await opened(p);
    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, adventure.adventureId, []);
    expect(await readTimeline(new MemoryTimelines(), settled)).toBeUndefined();
  });
});

describe("jobOfAdventure", () => {
  it("answers the job an adventure names", () => {
    expect(jobOfAdventure({ jobId: wolves })).toMatchObject({ id: wolves });
  });

  it("fails on a job this version's content does not hold, as another version's adventure names", () => {
    expect(() => jobOfAdventure({ jobId: "a-job-of-another-version" })).toThrow("no job a-job-of-another-version in this version");
  });
});
