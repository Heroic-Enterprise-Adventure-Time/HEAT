/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
/** How an adventure ended, the engine's `AdventureOutcome`: complete; retreat, ordered or forced by a time limit; defeat, the whole party down. */
export type AdventureOutcome =
  | 'COMPLETE'
  | 'DEFEAT'
  | 'RETREAT';

/** Open while the player plays it; settled once the hub verified it and paid out; discarded when no deploy could verify it any more. */
export type AdventureStatus =
  | 'DISCARDED'
  | 'OPEN'
  | 'SETTLED';

/** Which facility to build at which camp, and the level being built. */
export type BuildFacilityInput = {
  /** One of the camp's own facilities. */
  readonly kind: FacilityKind;
  /** The level being built: the next one. A level already built answers the camp and charges nothing. */
  readonly level: number;
  /** The camp's location. */
  readonly location: string | number;
};

/** Which adventure to discard. */
export type DiscardAdventureInput = {
  readonly adventureId: string | number;
};

/** A camp's own facilities, the engine's `FacilityKind`, those every camp has and those it may build. */
export type FacilityKind =
  | 'CARAVAN_HUB'
  | 'HEROES_HALL'
  | 'JOB_BOARD'
  | 'LUMBER_CAMP'
  | 'MINE'
  | 'WAREHOUSE';

/** Alive or dead at the camp, or retired for good. */
export type HeroStatus =
  | 'ALIVE'
  | 'DEAD'
  | 'RETIRED';

/** The resources, the engine's `Material`: there is no currency. */
export type Material =
  | 'CLOTH'
  | 'ORE'
  | 'TIMBER';

/** One entry of the override log, as the engine kept it: a hero's forced action (UNIT, with unitId and abilityId) or a party order (PARTY, with order), stamped with the adventure's clock when it was taken up. */
export type OverrideInput = {
  /** The ability forced, for a UNIT entry: at most 64 characters. */
  readonly abilityId?: string | null | undefined;
  /** Milliseconds on the adventure's clock. */
  readonly acceptedAtSimTime: number;
  readonly kind: OverrideKind;
  /** The order, for a PARTY entry. */
  readonly order?: PartyOrder | null | undefined;
  /** The hero, for a UNIT entry. */
  readonly unitId?: string | null | undefined;
};

/** What a log entry is: a hero's forced action, or an order to the whole party. */
export type OverrideKind =
  | 'PARTY'
  | 'UNIT';

/** The orders a party takes: press on into the next stage, or retreat home. */
export type PartyOrder =
  | 'PRESS_ON'
  | 'RETREAT';

/** What to recruit, and the request's id. */
export type RecruitHeroInput = {
  /** A UUID the client makes, which becomes the hero's id; a repeat answers the hero already made. */
  readonly requestId: string;
  /** A unit type on the location's recruitment list. */
  readonly unitType: UnitType;
};

/** Which hero to retire. */
export type RetireHeroInput = {
  readonly heroId: string | number;
};

/** How a stage ended, the engine's `StageEnding`: DONE for travel and arrive; the rest are a battle's. */
export type StageEnding =
  | 'DONE'
  | 'LOSS'
  | 'RETREAT'
  | 'TIMEOUT'
  | 'WIN';

/** What a stage of a job is, the engine's `StageKind`. */
export type StageKind =
  | 'ARRIVE'
  | 'FIGHT'
  | 'GATHER'
  | 'TRAVEL';

/** Which job to start, where, and with whom, and the request's id. */
export type StartAdventureInput = {
  /** The party: one to four of the player's living heroes at that camp. */
  readonly heroIds: ReadonlyArray<string | number>;
  /** A job the location posts, on its job board or at a facility the camp has built. */
  readonly jobId: string | number;
  /** The camp's location, which posts the job. */
  readonly location: string | number;
  /** A UUID the client makes, which becomes the adventure's id; a repeat answers the adventure already started. */
  readonly requestId: string;
};

/** Which adventure to submit, with its override log. */
export type SubmitAdventureInput = {
  readonly adventureId: string | number;
  /** The override log, as the engine kept it; empty when the player forced nothing, and at most 2000 entries. */
  readonly overrides: ReadonlyArray<OverrideInput>;
};

/** The unit types, the engine's `UnitType`: what a hero is and what the hall recruits. */
export type UnitType =
  | 'FIGHTER'
  | 'KNIGHT'
  | 'LUMBERJACK'
  | 'MINER'
  | 'PRIEST'
  | 'RANGER'
  | 'VILLAGER'
  | 'WIZARD';

export type AdventureFieldsFragment = { readonly id: string, readonly location: string, readonly seed: string, readonly startedAt: string, readonly version: string, readonly job: { readonly id: string, readonly description: string, readonly name: string }, readonly snapshot: { readonly jobId: string, readonly version: string, readonly heroes: ReadonlyArray<{ readonly heroId: string, readonly level: number, readonly name: string, readonly spriteSet: string, readonly unitType: UnitType, readonly stats: { readonly damage: number, readonly maxHealth: number, readonly speed: number, readonly gather: ReadonlyArray<{ readonly material: Material, readonly rating: number }> } }> } };

export type BuildFacilityMutationVariables = Exact<{
  input: BuildFacilityInput;
}>;


export type BuildFacilityMutation = { readonly buildFacility:
    | { readonly __typename: 'BuildFacilitySuccess', readonly camp: { readonly location: string } }
    | { readonly __typename: 'Conflict', readonly message: string }
    | { readonly __typename: 'InsufficientResources', readonly message: string }
    | { readonly __typename: 'MaxLevel', readonly message: string }
    | { readonly __typename: 'Requires', readonly message: string }
   | null };

export type CampFieldsFragment = { readonly activeHeroes: number, readonly hallLevel: number, readonly heroCapacity: number, readonly livingHeroes: number, readonly location: string, readonly name: string, readonly resourceCapacity: number, readonly warehouseLevel: number, readonly facilities: ReadonlyArray<{ readonly kind: FacilityKind, readonly level: number }>, readonly holdings: ReadonlyArray<{ readonly balance: number, readonly material: Material }> };

export type DiscardAdventureMutationVariables = Exact<{
  input: DiscardAdventureInput;
}>;


export type DiscardAdventureMutation = { readonly discardAdventure:
    | { readonly __typename: 'AdventureSettled', readonly message: string }
    | { readonly __typename: 'AdventureVerifiable', readonly message: string }
    | { readonly __typename: 'Conflict', readonly message: string }
    | { readonly __typename: 'DiscardAdventureSuccess', readonly adventure: { readonly id: string } }
   | null };

export type HeroFieldsFragment = { readonly id: string, readonly level: number, readonly location: string, readonly name: string, readonly recruitedAt: string, readonly retiredAt: string | null, readonly spriteSet: string, readonly status: HeroStatus, readonly unitType: UnitType, readonly xp: number };

export type HeroesSeenAtQueryVariables = Exact<{
  location: string | number;
}>;


export type HeroesSeenAtQuery = { readonly heroesSeenAt: ReadonlyArray<{ readonly id: string, readonly level: number, readonly name: string, readonly spriteSet: string, readonly unitType: UnitType }> | null };

export type JoinGameMutationVariables = Exact<{ [key: string]: never; }>;


export type JoinGameMutation = { readonly joinGame: { readonly __typename: 'JoinGameSuccess', readonly player: { readonly id: string } } | null };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { readonly me: { readonly id: string, readonly camps: ReadonlyArray<{ readonly activeHeroes: number, readonly hallLevel: number, readonly heroCapacity: number, readonly livingHeroes: number, readonly location: string, readonly name: string, readonly resourceCapacity: number, readonly warehouseLevel: number, readonly facilities: ReadonlyArray<{ readonly kind: FacilityKind, readonly level: number }>, readonly holdings: ReadonlyArray<{ readonly balance: number, readonly material: Material }> }> | null, readonly heroes: ReadonlyArray<{ readonly id: string, readonly level: number, readonly location: string, readonly name: string, readonly recruitedAt: string, readonly retiredAt: string | null, readonly spriteSet: string, readonly status: HeroStatus, readonly unitType: UnitType, readonly xp: number }> | null, readonly openAdventure: { readonly id: string, readonly location: string, readonly seed: string, readonly startedAt: string, readonly version: string, readonly job: { readonly id: string, readonly description: string, readonly name: string }, readonly snapshot: { readonly jobId: string, readonly version: string, readonly heroes: ReadonlyArray<{ readonly heroId: string, readonly level: number, readonly name: string, readonly spriteSet: string, readonly unitType: UnitType, readonly stats: { readonly damage: number, readonly maxHealth: number, readonly speed: number, readonly gather: ReadonlyArray<{ readonly material: Material, readonly rating: number }> } }> } } | null } | null };

export type RecentAdventureFieldsFragment = { readonly id: string, readonly outcome: AdventureOutcome, readonly settledAt: string, readonly job: { readonly id: string, readonly name: string }, readonly party: ReadonlyArray<{ readonly died: boolean, readonly level: number, readonly name: string, readonly unitType: UnitType }> };

export type RecentAdventuresAtQueryVariables = Exact<{
  location: string | number;
}>;


export type RecentAdventuresAtQuery = { readonly recentAdventuresAt: ReadonlyArray<{ readonly id: string, readonly outcome: AdventureOutcome, readonly settledAt: string, readonly job: { readonly id: string, readonly name: string }, readonly party: ReadonlyArray<{ readonly died: boolean, readonly level: number, readonly name: string, readonly unitType: UnitType }> }> | null };

export type RecruitHeroMutationVariables = Exact<{
  input: RecruitHeroInput;
}>;


export type RecruitHeroMutation = { readonly recruitHero:
    | { readonly __typename: 'Conflict', readonly message: string }
    | { readonly __typename: 'HallFull', readonly message: string }
    | { readonly __typename: 'HallLevel', readonly message: string }
    | { readonly __typename: 'InsufficientResources', readonly message: string }
    | { readonly __typename: 'RecruitHeroSuccess', readonly hero: { readonly id: string, readonly level: number, readonly location: string, readonly name: string, readonly recruitedAt: string, readonly retiredAt: string | null, readonly spriteSet: string, readonly status: HeroStatus, readonly unitType: UnitType, readonly xp: number } }
   | null };

export type ReplayFieldsFragment = { readonly id: string, readonly location: string, readonly settledAt: string | null, readonly job: { readonly id: string, readonly name: string }, readonly result: { readonly outcome: AdventureOutcome, readonly heroes: ReadonlyArray<{ readonly dead: boolean, readonly heroId: string, readonly level: number }> } | null, readonly snapshot: { readonly heroes: ReadonlyArray<{ readonly heroId: string, readonly level: number, readonly name: string, readonly unitType: UnitType }> } };

export type ReplayQueryVariables = Exact<{
  id: string | number;
}>;


export type ReplayQuery = { readonly adventure: { readonly status: AdventureStatus, readonly timeline: unknown, readonly id: string, readonly location: string, readonly settledAt: string | null, readonly result: { readonly outcome: AdventureOutcome, readonly heroes: ReadonlyArray<{ readonly dead: boolean, readonly heroId: string, readonly level: number, readonly xp: number, readonly xpGained: number }>, readonly credited: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly lost: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly rewards: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly stages: ReadonlyArray<{ readonly ended: StageEnding, readonly kind: StageKind, readonly stage: number }> } | null, readonly job: { readonly id: string, readonly name: string }, readonly snapshot: { readonly heroes: ReadonlyArray<{ readonly heroId: string, readonly level: number, readonly name: string, readonly unitType: UnitType }> } } | null };

export type ReplaysOfQueryVariables = Exact<{
  job: string | number;
}>;


export type ReplaysOfQuery = { readonly replaysOf: ReadonlyArray<{ readonly id: string, readonly location: string, readonly settledAt: string | null, readonly job: { readonly id: string, readonly name: string }, readonly result: { readonly outcome: AdventureOutcome, readonly heroes: ReadonlyArray<{ readonly dead: boolean, readonly heroId: string, readonly level: number }> } | null, readonly snapshot: { readonly heroes: ReadonlyArray<{ readonly heroId: string, readonly level: number, readonly name: string, readonly unitType: UnitType }> } }> | null };

export type ResultFieldsFragment = { readonly outcome: AdventureOutcome, readonly credited: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly heroes: ReadonlyArray<{ readonly dead: boolean, readonly heroId: string, readonly level: number, readonly xp: number, readonly xpGained: number }>, readonly lost: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly rewards: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly stages: ReadonlyArray<{ readonly ended: StageEnding, readonly kind: StageKind, readonly stage: number }> };

export type RetireHeroMutationVariables = Exact<{
  input: RetireHeroInput;
}>;


export type RetireHeroMutation = { readonly retireHero:
    | { readonly __typename: 'Conflict', readonly message: string }
    | { readonly __typename: 'HeroAdventuring', readonly message: string }
    | { readonly __typename: 'RetireHeroSuccess', readonly hero: { readonly id: string, readonly level: number, readonly location: string, readonly name: string, readonly recruitedAt: string, readonly retiredAt: string | null, readonly spriteSet: string, readonly status: HeroStatus, readonly unitType: UnitType, readonly xp: number } }
   | null };

export type SeenHeroFieldsFragment = { readonly id: string, readonly level: number, readonly name: string, readonly spriteSet: string, readonly unitType: UnitType };

export type StartAdventureMutationVariables = Exact<{
  input: StartAdventureInput;
}>;


export type StartAdventureMutation = { readonly startAdventure:
    | { readonly __typename: 'AdventureOpen', readonly message: string }
    | { readonly __typename: 'Conflict', readonly message: string }
    | { readonly __typename: 'HeroAdventuring', readonly message: string }
    | { readonly __typename: 'HeroDead', readonly message: string }
    | { readonly __typename: 'HeroNotHere', readonly message: string }
    | { readonly __typename: 'HeroRetired', readonly message: string }
    | { readonly __typename: 'Requires', readonly message: string }
    | { readonly __typename: 'StartAdventureSuccess', readonly adventure: { readonly id: string, readonly location: string, readonly seed: string, readonly startedAt: string, readonly version: string, readonly job: { readonly id: string, readonly description: string, readonly name: string }, readonly snapshot: { readonly jobId: string, readonly version: string, readonly heroes: ReadonlyArray<{ readonly heroId: string, readonly level: number, readonly name: string, readonly spriteSet: string, readonly unitType: UnitType, readonly stats: { readonly damage: number, readonly maxHealth: number, readonly speed: number, readonly gather: ReadonlyArray<{ readonly material: Material, readonly rating: number }> } }> } } }
   | null };

export type SubmitAdventureMutationVariables = Exact<{
  input: SubmitAdventureInput;
}>;


export type SubmitAdventureMutation = { readonly submitAdventure:
    | { readonly __typename: 'AdventureDiscarded', readonly message: string }
    | { readonly __typename: 'Conflict', readonly message: string }
    | { readonly __typename: 'EngineUpdated', readonly message: string }
    | { readonly __typename: 'SubmitAdventureSuccess', readonly adventure: { readonly id: string, readonly result: { readonly outcome: AdventureOutcome, readonly credited: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly heroes: ReadonlyArray<{ readonly dead: boolean, readonly heroId: string, readonly level: number, readonly xp: number, readonly xpGained: number }>, readonly lost: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly rewards: ReadonlyArray<{ readonly amount: number, readonly material: Material }>, readonly stages: ReadonlyArray<{ readonly ended: StageEnding, readonly kind: StageKind, readonly stage: number }> } | null } }
   | null };

export type TimelineQueryVariables = Exact<{
  id: string | number;
}>;


export type TimelineQuery = { readonly adventure: { readonly id: string, readonly timeline: unknown } | null };

export const AdventureFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdventureFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Adventure"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"seed"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"version"}},{"kind":"Field","name":{"kind":"Name","value":"job"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"snapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"jobId"}},{"kind":"Field","name":{"kind":"Name","value":"version"}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}},{"kind":"Field","name":{"kind":"Name","value":"stats"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"damage"}},{"kind":"Field","name":{"kind":"Name","value":"maxHealth"}},{"kind":"Field","name":{"kind":"Name","value":"speed"}},{"kind":"Field","name":{"kind":"Name","value":"gather"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"material"}},{"kind":"Field","name":{"kind":"Name","value":"rating"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<AdventureFieldsFragment, unknown>;
export const CampFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CampFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Camp"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"activeHeroes"}},{"kind":"Field","name":{"kind":"Name","value":"hallLevel"}},{"kind":"Field","name":{"kind":"Name","value":"heroCapacity"}},{"kind":"Field","name":{"kind":"Name","value":"livingHeroes"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"resourceCapacity"}},{"kind":"Field","name":{"kind":"Name","value":"warehouseLevel"}},{"kind":"Field","name":{"kind":"Name","value":"facilities"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"level"}}]}},{"kind":"Field","name":{"kind":"Name","value":"holdings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"balance"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}}]}}]} as unknown as DocumentNode<CampFieldsFragment, unknown>;
export const HeroFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HeroFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"recruitedAt"}},{"kind":"Field","name":{"kind":"Name","value":"retiredAt"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}},{"kind":"Field","name":{"kind":"Name","value":"xp"}}]}}]} as unknown as DocumentNode<HeroFieldsFragment, unknown>;
export const RecentAdventureFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RecentAdventureFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"RecentAdventure"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"settledAt"}},{"kind":"Field","name":{"kind":"Name","value":"job"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"party"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"died"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}}]}}]}}]} as unknown as DocumentNode<RecentAdventureFieldsFragment, unknown>;
export const ReplayFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ReplayFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Adventure"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"settledAt"}},{"kind":"Field","name":{"kind":"Name","value":"job"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"result"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"dead"}},{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"snapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}}]}}]}}]}}]} as unknown as DocumentNode<ReplayFieldsFragment, unknown>;
export const ResultFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ResultFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdventureResult"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"credited"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"dead"}},{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"xp"}},{"kind":"Field","name":{"kind":"Name","value":"xpGained"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lost"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"rewards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"stages"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ended"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}}]}}]}}]} as unknown as DocumentNode<ResultFieldsFragment, unknown>;
export const SeenHeroFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"SeenHeroFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"SeenHero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}}]}}]} as unknown as DocumentNode<SeenHeroFieldsFragment, unknown>;
export const BuildFacilityDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"BuildFacility"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BuildFacilityInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"buildFacility"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Error"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"message"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"BuildFacilitySuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"camp"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"location"}}]}}]}}]}}]}}]} as unknown as DocumentNode<BuildFacilityMutation, BuildFacilityMutationVariables>;
export const DiscardAdventureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DiscardAdventure"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DiscardAdventureInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"discardAdventure"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Error"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"message"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"DiscardAdventureSuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adventure"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]}}]} as unknown as DocumentNode<DiscardAdventureMutation, DiscardAdventureMutationVariables>;
export const HeroesSeenAtDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"HeroesSeenAt"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"location"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroesSeenAt"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"location"},"value":{"kind":"Variable","name":{"kind":"Name","value":"location"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"SeenHeroFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"SeenHeroFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"SeenHero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}}]}}]} as unknown as DocumentNode<HeroesSeenAtQuery, HeroesSeenAtQueryVariables>;
export const JoinGameDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"JoinGame"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"joinGame"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"JoinGameSuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"player"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]}}]} as unknown as DocumentNode<JoinGameMutation, JoinGameMutationVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"camps"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CampFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HeroFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"openAdventure"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AdventureFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CampFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Camp"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"activeHeroes"}},{"kind":"Field","name":{"kind":"Name","value":"hallLevel"}},{"kind":"Field","name":{"kind":"Name","value":"heroCapacity"}},{"kind":"Field","name":{"kind":"Name","value":"livingHeroes"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"resourceCapacity"}},{"kind":"Field","name":{"kind":"Name","value":"warehouseLevel"}},{"kind":"Field","name":{"kind":"Name","value":"facilities"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"level"}}]}},{"kind":"Field","name":{"kind":"Name","value":"holdings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"balance"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HeroFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"recruitedAt"}},{"kind":"Field","name":{"kind":"Name","value":"retiredAt"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}},{"kind":"Field","name":{"kind":"Name","value":"xp"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdventureFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Adventure"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"seed"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"version"}},{"kind":"Field","name":{"kind":"Name","value":"job"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"snapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"jobId"}},{"kind":"Field","name":{"kind":"Name","value":"version"}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}},{"kind":"Field","name":{"kind":"Name","value":"stats"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"damage"}},{"kind":"Field","name":{"kind":"Name","value":"maxHealth"}},{"kind":"Field","name":{"kind":"Name","value":"speed"}},{"kind":"Field","name":{"kind":"Name","value":"gather"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"material"}},{"kind":"Field","name":{"kind":"Name","value":"rating"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const RecentAdventuresAtDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RecentAdventuresAt"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"location"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recentAdventuresAt"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"location"},"value":{"kind":"Variable","name":{"kind":"Name","value":"location"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RecentAdventureFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RecentAdventureFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"RecentAdventure"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"settledAt"}},{"kind":"Field","name":{"kind":"Name","value":"job"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"party"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"died"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}}]}}]}}]} as unknown as DocumentNode<RecentAdventuresAtQuery, RecentAdventuresAtQueryVariables>;
export const RecruitHeroDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RecruitHero"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RecruitHeroInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recruitHero"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Error"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"message"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"RecruitHeroSuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hero"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HeroFields"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HeroFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"recruitedAt"}},{"kind":"Field","name":{"kind":"Name","value":"retiredAt"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}},{"kind":"Field","name":{"kind":"Name","value":"xp"}}]}}]} as unknown as DocumentNode<RecruitHeroMutation, RecruitHeroMutationVariables>;
export const ReplayDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Replay"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adventure"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ReplayFields"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"timeline"}},{"kind":"Field","name":{"kind":"Name","value":"result"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ResultFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ReplayFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Adventure"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"settledAt"}},{"kind":"Field","name":{"kind":"Name","value":"job"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"result"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"dead"}},{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"snapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ResultFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdventureResult"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"credited"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"dead"}},{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"xp"}},{"kind":"Field","name":{"kind":"Name","value":"xpGained"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lost"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"rewards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"stages"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ended"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}}]}}]}}]} as unknown as DocumentNode<ReplayQuery, ReplayQueryVariables>;
export const ReplaysOfDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ReplaysOf"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"job"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"replaysOf"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"job"},"value":{"kind":"Variable","name":{"kind":"Name","value":"job"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ReplayFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ReplayFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Adventure"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"settledAt"}},{"kind":"Field","name":{"kind":"Name","value":"job"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"result"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"dead"}},{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"snapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}}]}}]}}]}}]} as unknown as DocumentNode<ReplaysOfQuery, ReplaysOfQueryVariables>;
export const RetireHeroDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RetireHero"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RetireHeroInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"retireHero"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Error"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"message"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"RetireHeroSuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hero"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HeroFields"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HeroFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hero"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"recruitedAt"}},{"kind":"Field","name":{"kind":"Name","value":"retiredAt"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}},{"kind":"Field","name":{"kind":"Name","value":"xp"}}]}}]} as unknown as DocumentNode<RetireHeroMutation, RetireHeroMutationVariables>;
export const StartAdventureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"StartAdventure"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"StartAdventureInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"startAdventure"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Error"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"message"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StartAdventureSuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adventure"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AdventureFields"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdventureFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Adventure"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"seed"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"version"}},{"kind":"Field","name":{"kind":"Name","value":"job"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"snapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"jobId"}},{"kind":"Field","name":{"kind":"Name","value":"version"}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"spriteSet"}},{"kind":"Field","name":{"kind":"Name","value":"unitType"}},{"kind":"Field","name":{"kind":"Name","value":"stats"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"damage"}},{"kind":"Field","name":{"kind":"Name","value":"maxHealth"}},{"kind":"Field","name":{"kind":"Name","value":"speed"}},{"kind":"Field","name":{"kind":"Name","value":"gather"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"material"}},{"kind":"Field","name":{"kind":"Name","value":"rating"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<StartAdventureMutation, StartAdventureMutationVariables>;
export const SubmitAdventureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SubmitAdventure"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SubmitAdventureInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"submitAdventure"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Error"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"message"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"SubmitAdventureSuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adventure"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"result"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ResultFields"}}]}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ResultFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdventureResult"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"credited"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"heroes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"dead"}},{"kind":"Field","name":{"kind":"Name","value":"heroId"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"xp"}},{"kind":"Field","name":{"kind":"Name","value":"xpGained"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lost"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"rewards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"material"}}]}},{"kind":"Field","name":{"kind":"Name","value":"stages"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ended"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}}]}}]}}]} as unknown as DocumentNode<SubmitAdventureMutation, SubmitAdventureMutationVariables>;
export const TimelineDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Timeline"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adventure"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"timeline"}}]}}]}}]} as unknown as DocumentNode<TimelineQuery, TimelineQueryVariables>;