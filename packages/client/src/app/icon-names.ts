import * as z from 'zod/mini';

import { fetchJson } from './static-json';

/**
 * Where the page's icons are served, the menu's and a resource's
 * (docs/process/assets.md, rules 25 to 27). The client's build publishes
 * each under a name that carries a hash of its file, `timber.<hash>.png`,
 * and writes the index of those names beside them, `pictures.json`
 * (`packages/client/scripts/copy-art.mjs`): everything under `/art` is kept
 * by a browser for a year, so an icon made again has to be a new name, and
 * the index, which is read again within a minute, is where the page learns
 * it (the review of PR-348). Nothing spells an icon's address but
 * `iconAddress`. A plain module, so that the battle scene reads it without
 * Angular (angular.md, rule 11); the page's templates read it through
 * `Icons` (`icons.ts`).
 */

const ICONS = '/art/icons';
/** The published file of each icon, by what the icon stands for: `timber` to `timber.<hash>.png`. */
const IconNamesSchema = z.record(z.string(), z.string());
export type IconNames = Readonly<z.output<typeof IconNamesSchema>>;

/** The index of the icons as the build wrote it, checked where it is read (angular.md, rule 4). */
export function fetchIconNames(fetchFn: typeof fetch = fetch): Promise<IconNames> {
  return fetchJson(`${ICONS}/pictures.json`, IconNamesSchema, fetchFn);
}

/** Where an icon is served, or null for one the index does not hold. */
export function iconAddress(names: IconNames, name: string): string | null {
  // `hasOwn`, since a name such as `toString` is on every object.
  const image = Object.hasOwn(names, name) ? names[name] : undefined;
  return image ? `${ICONS}/${image}` : null;
}
