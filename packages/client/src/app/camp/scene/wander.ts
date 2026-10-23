import { must } from '../../must';
import type { Point, Rect } from './layout';

/**
 * How a hero mills about the camp, for flavour (game.md, "Locations and
 * camps"): walk to a random spot on the walkable ground, stand still a few
 * seconds, pick another. Pure and driven by the caller's clock and random
 * source, so the scene feeds it the frame time and a test feeds it numbers.
 */

export type Facing = 'south' | 'east' | 'north' | 'west';

export interface Walker {
  x: number;
  y: number;
  target: Point | null;
  facing: Facing;
  /** Milliseconds left standing still before the next walk. */
  restMs: number;
  /** Walking to a door to leave the camp: at the door it stops for good. */
  leaving: boolean;
}

/**
 * A stroll, in the hero's own art pixels a second, which keeps the stride in
 * step with the walk's frames at any size. A hero drawn smaller than the map
 * (Issue-99) covers fewer map pixels: the scene passes `step` the speed in
 * map pixels.
 */
export const WALK_SPEED = 18;
const REST_MIN_MS = 1500;
const REST_MAX_MS = 6000;

export type Random = () => number;

/** A random spot on the walkable ground, each rectangle weighted by its area. */
export function randomSpot(areas: readonly Rect[], random: Random): Point {
  const weighted = areas.map((area) => ({ area, size: (area.x1 - area.x0) * (area.y1 - area.y0) }));
  const within = (area: Rect): Point => ({ x: area.x0 + random() * (area.x1 - area.x0), y: area.y0 + random() * (area.y1 - area.y0) });
  let pick = random() * weighted.reduce((s, w) => s + w.size, 0);
  for (const { area, size } of weighted) {
    if (pick < size) return within(area);
    pick -= size;
  }
  // Rounding can leave `pick` at the very end; a layout always has walkable ground.
  return within(must(areas.at(-1), 'a walkable area'));
}

/** The way a walker faces when moving by (dx, dy): the larger axis wins. */
export function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  return dy > 0 ? 'south' : 'north';
}

export function newWalker(at: Point, random: Random, target: Point | null = null): Walker {
  return {
    x: at.x,
    y: at.y,
    target,
    facing: 'south',
    restMs: target ? 0 : REST_MIN_MS + random() * (REST_MAX_MS - REST_MIN_MS),
    leaving: false,
  };
}

/** Sends a walker to a door, from wherever it is: a retired hero going back into the hall. */
export function leave(walker: Walker, door: Point): void {
  walker.target = { ...door };
  walker.restMs = 0;
  walker.leaving = true;
}

/** Whether a leaving walker has reached its door and is gone. */
export function gone(walker: Walker): boolean {
  return walker.leaving && walker.target === null;
}

/** Advances a walker by dtMs at `speed` map pixels a second. Answers whether it is walking. */
export function step(walker: Walker, dtMs: number, areas: readonly Rect[], random: Random, speed = WALK_SPEED): boolean {
  if (gone(walker)) return false;
  if (!walker.target) {
    walker.restMs -= dtMs;
    if (walker.restMs > 0) return false;
    walker.target = randomSpot(areas, random);
  }
  const dx = walker.target.x - walker.x;
  const dy = walker.target.y - walker.y;
  const distance = Math.hypot(dx, dy);
  const travel = (speed * dtMs) / 1000;
  if (distance <= travel) {
    walker.x = walker.target.x;
    walker.y = walker.target.y;
    walker.target = null;
    walker.restMs = REST_MIN_MS + random() * (REST_MAX_MS - REST_MIN_MS);
    return false;
  }
  walker.facing = facingFor(dx, dy);
  walker.x += (dx / distance) * travel;
  walker.y += (dy / distance) * travel;
  return true;
}
