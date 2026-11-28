import { readdirSync, readFileSync } from "node:fs";

import { range } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { must } from "../src/index.js";
import { artDir, artKind, type ArtSet, artSets, pngSize, type Provenance } from "./art.js";

type Size = readonly [number, number];

/** What a provenance says of the files beside it: each by its name, with its canvas where the provenance gives one. */
type Said = ReadonlyMap<string, Size | undefined>;

/** A picture the provenance names, with its canvas. */
interface Pictured {
  readonly file: string;
  readonly canvas: Size;
}

/** A hero's or a monster's set: the four stills, and each animation by direction. A canvas that differs by direction is recorded by direction. */
interface CharacterSet {
  readonly files: { readonly still: { readonly frames: readonly string[]; readonly canvas: Size } };
  readonly animations: Readonly<
    Record<string, { readonly directions: readonly string[]; readonly framesPerDirection: number; readonly canvas: Size | Readonly<Record<string, Size>> }>
  >;
}

/** A prop's or a weapon's set: its pictures, and each animation, which has one direction. */
interface ObjectSet {
  readonly files: Readonly<Record<string, Pictured>>;
  readonly animations?: Readonly<Record<string, { readonly frames: number; readonly canvas: Size }>>;
}

const isSize = (canvas: Size | Readonly<Record<string, Size>>): canvas is Size => Array.isArray(canvas);

function character(provenance: Provenance): Said {
  const { files, animations } = provenance as unknown as CharacterSet;
  const said = new Map<string, Size>(files.still.frames.map((frame) => [frame, files.still.canvas]));
  for (const [name, { directions, framesPerDirection, canvas }] of Object.entries(animations)) {
    for (const direction of directions) {
      const size = isSize(canvas) ? canvas : must(canvas[direction], `the canvas of ${name} ${direction}`);
      for (const frame of range(framesPerDirection)) said.set(`${name}-${direction}-${frame}.png`, size);
    }
  }
  return said;
}

function object(provenance: Provenance): Said {
  const { files, animations = {} } = provenance as unknown as ObjectSet;
  const said = new Map<string, Size>(Object.values(files).map(({ file, canvas }) => [file, canvas]));
  for (const [name, { frames, canvas }] of Object.entries(animations)) for (const frame of range(frames)) said.set(`${name}-${frame}.png`, canvas);
  return said;
}

/** The pictures a provenance lists under a field, each with its canvas: a facility's levels, the page's icons. */
const pictured =
  (field: string) =>
  (provenance: Provenance): Said =>
    new Map(Object.values(must(provenance[field], `a provenance's ${field}`) as Readonly<Record<string, Pictured>>).map(({ file, canvas }) => [file, canvas]));

/** The files a provenance describes by name, with no canvas of their own: an effect's pack, a ground's sheet. */
const named = (provenance: Provenance): Said => new Map(Object.keys(provenance["files"] as object).map((file) => [file, undefined]));

/** Every kind of art, with its provenances and how each says what its files are. */
const KINDS: Readonly<Record<string, { readonly sets: readonly ArtSet[]; readonly said: (provenance: Provenance) => Said }>> = {
  effects: { sets: artSets("effects"), said: named },
  facilities: { sets: artSets("facilities"), said: pictured("levels") },
  fonts: { sets: artSets("fonts"), said: (provenance) => new Map([provenance["atlas"] as Pictured].map(({ file, canvas }) => [file, canvas])) },
  frames: {
    sets: [artKind("frames")],
    said: (provenance) => new Map(Object.values(provenance["frames"] as Readonly<Record<string, { file: string }>>).map(({ file }) => [file, undefined])),
  },
  ground: { sets: artSets("ground"), said: named },
  heroes: { sets: artSets("heroes"), said: character },
  icons: { sets: [artKind("icons")], said: pictured("icons") },
  monsters: { sets: artSets("monsters"), said: character },
  props: { sets: artSets("props"), said: object },
  weapons: { sets: artSets("weapons"), said: object },
};

/** What stands under art/ and is not a kind: the mock-ups, which are evidence and have no provenance (assets.md, rule 19). */
const NOT_ASSETS = ["mockups"];

describe("what a provenance says of its files (assets.md, rule 5)", () => {
  it("is checked for every kind of art", () => {
    expect(Object.keys(KINDS)).toEqual(
      readdirSync(artDir("."))
        .filter((kind) => !NOT_ASSETS.includes(kind))
        .sort(),
    );
  });

  describe.each(Object.entries(KINDS))("%s", (kind, { sets, said }) => {
    it.each(sets.map((set) => [set.set, set] as const))("%s names the files beside it, each at its canvas", (name, { dir, provenance }) => {
      const files = said(provenance);
      expect(
        readdirSync(dir)
          .filter((file) => file !== "provenance.json")
          .sort(),
        `the files of art/${kind}/${name}`,
      ).toEqual([...files.keys()].sort());
      for (const [file, canvas] of files) if (canvas) expect(pngSize(new URL(file, dir)), `${name}/${file}`).toEqual(canvas);
    });
  });

  it.each(artSets("effects").map((set) => [set.set, set] as const))("%s gives its clip's frames and rate as the pack's manifest does", (_name, { dir, provenance }) => {
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")) as { fps: number; clips: { name: string; frames: number }[] };
    expect(provenance["fps"]).toBe(manifest.fps);
    expect(provenance["frames"]).toBe(manifest.clips.find((clip) => clip.name === "whole")?.frames);
  });
});
