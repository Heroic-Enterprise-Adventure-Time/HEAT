import { GraphQLError } from "graphql";

import type { Material, Requirement } from "@heat/engine";

/**
 * The game's refusals, as data (docs/standards/graphql.md, rule 6; decision
 * 0038). A function throws one of these classes and the errors plugin
 * answers it as the object type of the same name, a member of the
 * mutation's result union, so the client reads `__typename` and the fields
 * the type carries. The message is in the player's words and may be shown
 * as it is.
 *
 * What is not a refusal stays in the response's `errors` array, whose codes
 * docs/standards/graphql.md, rule 6, lists: malformed input is `badInput`, and
 * anything nobody expected is thrown as it is.
 */
export abstract class Refusal extends Error {}

/** A material the camp is short of: the amount the thing costs and the camp's balance. */
export interface Shortfall {
  material: Material;
  amount: number;
  balance: number;
}

/** The unit type needs a higher heroes hall. */
export class HallLevel extends Refusal {
  constructor(
    message: string,
    readonly hallLevel: number,
  ) {
    super(message);
  }
}

/** The heroes hall holds no more active heroes at its level. */
export class HallFull extends Refusal {}

/** The camp cannot pay: each material it is short of, with the amount and the balance. */
export class InsufficientResources extends Refusal {
  constructor(
    message: string,
    readonly short: readonly Shortfall[],
  ) {
    super(message);
  }
}

/** The facility is at its highest level at this location. */
export class MaxLevel extends Refusal {}

/** Another facility is needed first, at the level named. */
export class Requires extends Refusal {
  constructor(
    message: string,
    readonly missing: readonly Requirement[],
  ) {
    super(message);
  }
}

/** The camp or the party changed while the request ran and no rule explains the failure: try again. */
export class Conflict extends Refusal {}

/** The player's one adventure is open: this one. */
export class AdventureOpen extends Refusal {
  constructor(
    message: string,
    readonly adventureId: string,
  ) {
    super(message);
  }
}

/** A refusal about one hero of the party. */
export abstract class HeroRefusal extends Refusal {
  constructor(
    message: string,
    readonly heroId: string,
  ) {
    super(message);
  }
}
export class HeroDead extends HeroRefusal {}
export class HeroRetired extends HeroRefusal {}
export class HeroNotHere extends HeroRefusal {}
export class HeroAdventuring extends HeroRefusal {}

/** The adventure was discarded: no deploy could verify it. */
export class AdventureDiscarded extends Refusal {}

/** The adventure is settled, so it cannot be discarded. */
export class AdventureSettled extends Refusal {}

/** Another version of the game issued the adventure; this deploy's version is named. */
export class EngineUpdated extends Refusal {
  constructor(
    message: string,
    readonly version: string,
  ) {
    super(message);
  }
}

/** The adventure can still be submitted, to the deploy of the version named. */
export class AdventureVerifiable extends Refusal {
  constructor(
    message: string,
    readonly version: string,
  ) {
    super(message);
  }
}

/** Malformed input is the client's defect, not a refusal: a GraphQLError with BAD_USER_INPUT (rule 14). */
export function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
