/**
 * The committed art as the engine's tests read it: each set's provenance under
 * `art/<kind>/`, and a picture's size. One module, so that every art test reads
 * a provenance through the same lines (typescript.md, rule 19).
 */
import { readdirSync, readFileSync } from "node:fs";

import { must } from "../src/index.js";

const art = new URL("../../../art/", import.meta.url);

/** A provenance as its file holds it; a test reads the fields it is about. */
export type Provenance = Readonly<Record<string, unknown>>;

/** One directory of committed art with a provenance: a set, or a kind that keeps one provenance for all its files. */
export interface ArtSet {
  /** The directory's name, `ranger-01`, or the kind's where the kind is one directory, `icons`. */
  readonly set: string;
  readonly dir: URL;
  readonly provenance: Provenance;
}

/** `art/<kind>/`. */
export const artDir = (kind: string): URL => new URL(`${kind}/`, art);

const read = (set: string, dir: URL): ArtSet => ({
  set,
  dir,
  provenance: JSON.parse(readFileSync(new URL("provenance.json", dir), "utf8")) as Provenance,
});

/** A kind that keeps one provenance for all its files, as the icons and the page's frames do. */
export const artKind = (kind: string): ArtSet => read(kind, artDir(kind));

/** Every set under `art/<kind>/`, in the order of their names. */
export const artSets = (kind: string): ArtSet[] =>
  readdirSync(artDir(kind))
    .sort()
    .map((set) => read(set, new URL(`${set}/`, artDir(kind))));

/** The names a set's provenance lists under a field: its classes, monsters, props, wielders or abilities. */
export function listed({ set, provenance }: ArtSet, field: string): string[] {
  const names = must(provenance[field], `${set}'s ${field}`);
  if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) throw new Error(`${set}'s ${field} is not a list of names`);
  return names;
}

/**
 * A PNG's width and height, from its header: the two numbers that open its
 * first chunk. Our own lines and not a library's, because the engine's tests
 * need nothing else of a picture and the engine takes no image library for
 * two numbers (typescript.md, rule 17).
 */
export function pngSize(file: URL): [number, number] {
  const bytes = readFileSync(file);
  if (bytes.toString("latin1", 1, 4) !== "PNG" || bytes.toString("latin1", 12, 16) !== "IHDR") throw new Error(`${file.pathname} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
