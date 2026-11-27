import assert from "node:assert/strict";
import { test } from "node:test";

import { colourToken, paletteNames } from "./style-tokens.mjs";

const STYLES = `:root {
  --soot: #140d08;
  --bone: #e6d6b8;
  --scene-glyph: var(--bone);
  --scene-glyph-outline: var(--soot);
  --twice: var(--scene-glyph);
  --loop-a: var(--loop-b);
  --loop-b: var(--loop-a);
  --space: 1rem;
}`;

test("a palette colour is read as opaque RGBA", () => {
  assert.deepEqual(colourToken("--soot", STYLES), [0x14, 0x0d, 0x08, 255]);
});

test("a role is followed through its var() to the palette", () => {
  assert.deepEqual(colourToken("--scene-glyph", STYLES), [0xe6, 0xd6, 0xb8, 255]);
  assert.deepEqual(colourToken("--twice", STYLES), [0xe6, 0xd6, 0xb8, 255]);
});

test("a token whose name begins another's is read as itself", () => {
  assert.deepEqual(colourToken("--scene-glyph-outline", STYLES), [0x14, 0x0d, 0x08, 255]);
});

test("a missing token, a loop and a token that is no colour are refused", () => {
  assert.throws(() => colourToken("--missing", STYLES), /has no colour --missing/);
  assert.throws(() => colourToken("--loop-a", STYLES), /in a loop/);
  assert.throws(() => colourToken("--space", STYLES), /no colour: 1rem/);
});

test("the palette is every token whose value is a colour literal", () => {
  assert.deepEqual(paletteNames(STYLES), ["--soot", "--bone"]);
});

test("the real stylesheet maps the scene's roles onto the scene's two colours", () => {
  assert.deepEqual(colourToken("--scene-glyph"), colourToken("--bone"));
  assert.deepEqual(colourToken("--scene-glyph-outline"), colourToken("--soot"));
});
