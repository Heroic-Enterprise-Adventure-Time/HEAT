/**
 * A draw of a whole number from 0 up to, and not including, `max`:
 * `node:crypto`'s `randomInt` in the hub, and a function a test passes so
 * that the draw is the test's. A verb that draws takes one as an argument,
 * which is why the hub picks and shuffles by hand: es-toolkit's `sample` and
 * `shuffle` draw from `Math.random` and take no source (typescript.md, rule
 * 17).
 */
export type Random = (max: number) => number;
