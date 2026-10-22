/**
 * The adventure's one override log: forced actions and party orders.
 *
 * A force-action is Issue-110's (battle/override.ts), stamped at the turn
 * that used it. A party order, press on or retreat, is stamped at the step
 * that took it up: the next step after it was given. Press on is the default;
 * retreat stays selected until press on is given. Only an order that changes
 * the selection is logged. Every time is on the adventure's clock, so a
 * replay submits each entry before the step that reaches its time and gets
 * the same timeline.
 */

import type { PlayerOverride } from "../battle/index.js";

export type PartyOrder = "press-on" | "retreat";

export type AdventureLogEntry =
  | {
      readonly kind: "unit";
      readonly acceptedAtSimTime: number;
      readonly unitId: string;
      readonly override: PlayerOverride;
    }
  | {
      readonly kind: "party";
      readonly acceptedAtSimTime: number;
      readonly order: PartyOrder;
    };
