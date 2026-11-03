/**
 * The replay entry point (architecture overview, "The adventure loop"): the
 * hub regenerates an adventure from its snapshot, its seed and the override
 * log the browser submitted, and the client resumes one the same way.
 *
 * New in HEAT; BattleScript Online designed the replay and did not build it.
 */

import { sortBy } from "es-toolkit";

import { ADVENTURE_CONTENT } from "../content.js";
import { AdventureEngine } from "./engine.js";
import type { AdventureResult, AdventureTimeline } from "./events.js";
import type { AdventureContent } from "./job.js";
import type { AdventureLogEntry } from "./override.js";
import type { AdventureSnapshot } from "./snapshot.js";

/**
 * Run an adventure event by event, each logged entry submitted before the
 * step that reaches its time. An entry that changes nothing leaves no entry
 * in the timeline's own log, so a verifier can compare the two.
 */
export function replay(
  snapshot: AdventureSnapshot,
  seed: string,
  overrides: readonly AdventureLogEntry[],
  content: AdventureContent = ADVENTURE_CONTENT,
): { readonly timeline: AdventureTimeline; readonly result: AdventureResult } {
  const engine = new AdventureEngine(snapshot, seed, content);
  const log = sortBy(overrides, ["acceptedAtSimTime"]);
  let i = 0;
  while (!engine.isComplete()) {
    for (let entry = log[i]; entry && entry.acceptedAtSimTime <= engine.getNextEventTime(); entry = log[++i]) {
      if (entry.kind === "unit") engine.submitOverride(entry.unitId, entry.override);
      else engine.submitOrder(entry.order);
    }
    engine.step();
  }
  return { timeline: engine.getTimeline(), result: engine.getResult() };
}
