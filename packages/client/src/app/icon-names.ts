import * as z from 'zod/mini';

import { fetchJson } from './static-json';

/**
 * Where the page's icons are served, the menu's and a resource's
 * (docs/process/assets.md, rules 25 to 27), and the heroes' portraits, which
 * the build cuts from each hero's sprite set (Issue-385). The client's build
 * publishes each under a name that carries a hash of its file,
 * `timber.<hash>.png`, and writes the index of those names beside them,
 * `pictures.json` (`packages/client/scripts/copy-art.mjs`): everything under
 * `/art` is kept by a browser for a year, so a picture made again has to be
 * a new name, and the index, which is read again within a minute, is where
 * the page learns it (the review of PR-348). Nothing spells an icon's address
 * but `iconAddress`, or a portrait's but `portraitAddress`. A plain module,
 * so that the battle scene reads it without Angular (angular.md, rule 11);
 * the page's templates read it through `Icons` (`icons.ts`).
 */

const ICONS = '/art/icons';
const PORTRAITS = '/art/portraits';
/** The published file of each picture, by what it stands for: `timber` to `timber.<hash>.png`, a hero's sprite set `ranger-01` to `ranger-01.<hash>.png`. */
const PictureNamesSchema = z.record(z.string(), z.string());
export type IconNames = Readonly<z.output<typeof PictureNamesSchema>>;
export type PortraitNames = IconNames;

/** The index of the icons as the build wrote it, checked where it is read (angular.md, rule 4). */
export function fetchIconNames(fetchFn: typeof fetch = fetch): Promise<IconNames> {
  return fetchJson(`${ICONS}/pictures.json`, PictureNamesSchema, fetchFn);
}

/** The index of the portraits as the build wrote it, by hero sprite set. */
export function fetchPortraitNames(fetchFn: typeof fetch = fetch): Promise<PortraitNames> {
  return fetchJson(`${PORTRAITS}/pictures.json`, PictureNamesSchema, fetchFn);
}

/** Where an icon is served, or null for one the index does not hold. */
export function iconAddress(names: IconNames, name: string): string | null {
  return address(ICONS, names, name);
}

/** Where a hero's portrait is served, by its sprite set, or null for a set the index does not hold. */
export function portraitAddress(names: PortraitNames, spriteSet: string): string | null {
  return address(PORTRAITS, names, spriteSet);
}

function address(dir: string, names: IconNames, name: string): string | null {
  // `hasOwn`, since a name such as `toString` is on every object.
  const image = Object.hasOwn(names, name) ? names[name] : undefined;
  return image ? `${dir}/${image}` : null;
}
