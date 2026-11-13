/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "fragment AdventureFields on Adventure {\n  id\n  location\n  seed\n  startedAt\n  version\n  job {\n    id\n    description\n    name\n  }\n  snapshot {\n    jobId\n    version\n    heroes {\n      heroId\n      level\n      name\n      spriteSet\n      unitType\n      stats {\n        damage\n        maxHealth\n        speed\n        gather {\n          material\n          rating\n        }\n      }\n    }\n  }\n}": typeof types.AdventureFieldsFragmentDoc,
    "mutation BuildFacility($input: BuildFacilityInput!) {\n  buildFacility(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on BuildFacilitySuccess {\n      camp {\n        location\n      }\n    }\n  }\n}": typeof types.BuildFacilityDocument,
    "fragment CampFields on Camp {\n  activeHeroes\n  hallLevel\n  heroCapacity\n  livingHeroes\n  location\n  name\n  resourceCapacity\n  warehouseLevel\n  facilities {\n    kind\n    level\n  }\n  holdings {\n    balance\n    material\n  }\n}": typeof types.CampFieldsFragmentDoc,
    "mutation DiscardAdventure($input: DiscardAdventureInput!) {\n  discardAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on DiscardAdventureSuccess {\n      adventure {\n        id\n      }\n    }\n  }\n}": typeof types.DiscardAdventureDocument,
    "fragment HeroFields on Hero {\n  id\n  level\n  location\n  name\n  recruitedAt\n  retiredAt\n  spriteSet\n  status\n  unitType\n  xp\n}": typeof types.HeroFieldsFragmentDoc,
    "query HeroesSeenAt($location: ID!) {\n  heroesSeenAt(location: $location) {\n    ...SeenHeroFields\n  }\n}": typeof types.HeroesSeenAtDocument,
    "mutation JoinGame {\n  joinGame {\n    __typename\n    ... on JoinGameSuccess {\n      player {\n        id\n      }\n    }\n  }\n}": typeof types.JoinGameDocument,
    "query Me {\n  me {\n    id\n    camps {\n      ...CampFields\n    }\n    heroes {\n      ...HeroFields\n    }\n    openAdventure {\n      ...AdventureFields\n    }\n  }\n}": typeof types.MeDocument,
    "fragment RecentAdventureFields on RecentAdventure {\n  id\n  outcome\n  settledAt\n  job {\n    id\n    name\n  }\n  party {\n    died\n    level\n    name\n    unitType\n  }\n}": typeof types.RecentAdventureFieldsFragmentDoc,
    "query RecentAdventuresAt($location: ID!) {\n  recentAdventuresAt(location: $location) {\n    ...RecentAdventureFields\n  }\n}": typeof types.RecentAdventuresAtDocument,
    "mutation RecruitHero($input: RecruitHeroInput!) {\n  recruitHero(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on RecruitHeroSuccess {\n      hero {\n        ...HeroFields\n      }\n    }\n  }\n}": typeof types.RecruitHeroDocument,
    "fragment ReplayFields on Adventure {\n  id\n  location\n  settledAt\n  job {\n    id\n    name\n  }\n  result {\n    outcome\n    heroes {\n      dead\n      heroId\n      level\n    }\n  }\n  snapshot {\n    heroes {\n      heroId\n      level\n      name\n      unitType\n    }\n  }\n}": typeof types.ReplayFieldsFragmentDoc,
    "query Replay($id: ID!) {\n  adventure(id: $id) {\n    ...ReplayFields\n    status\n    timeline\n    result {\n      ...ResultFields\n    }\n  }\n}": typeof types.ReplayDocument,
    "query ReplaysOf($job: ID!) {\n  replaysOf(job: $job) {\n    ...ReplayFields\n  }\n}": typeof types.ReplaysOfDocument,
    "fragment ResultFields on AdventureResult {\n  outcome\n  credited {\n    amount\n    material\n  }\n  heroes {\n    dead\n    heroId\n    level\n    xp\n    xpGained\n  }\n  lost {\n    amount\n    material\n  }\n  rewards {\n    amount\n    material\n  }\n  stages {\n    ended\n    kind\n    stage\n  }\n}": typeof types.ResultFieldsFragmentDoc,
    "mutation RetireHero($input: RetireHeroInput!) {\n  retireHero(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on RetireHeroSuccess {\n      hero {\n        ...HeroFields\n      }\n    }\n  }\n}": typeof types.RetireHeroDocument,
    "fragment SeenHeroFields on SeenHero {\n  id\n  level\n  name\n  spriteSet\n  unitType\n}": typeof types.SeenHeroFieldsFragmentDoc,
    "mutation StartAdventure($input: StartAdventureInput!) {\n  startAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on StartAdventureSuccess {\n      adventure {\n        ...AdventureFields\n      }\n    }\n  }\n}": typeof types.StartAdventureDocument,
    "mutation SubmitAdventure($input: SubmitAdventureInput!) {\n  submitAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on SubmitAdventureSuccess {\n      adventure {\n        id\n        result {\n          ...ResultFields\n        }\n      }\n    }\n  }\n}": typeof types.SubmitAdventureDocument,
    "query Timeline($id: ID!) {\n  adventure(id: $id) {\n    id\n    timeline\n  }\n}": typeof types.TimelineDocument,
};
const documents: Documents = {
    "fragment AdventureFields on Adventure {\n  id\n  location\n  seed\n  startedAt\n  version\n  job {\n    id\n    description\n    name\n  }\n  snapshot {\n    jobId\n    version\n    heroes {\n      heroId\n      level\n      name\n      spriteSet\n      unitType\n      stats {\n        damage\n        maxHealth\n        speed\n        gather {\n          material\n          rating\n        }\n      }\n    }\n  }\n}": types.AdventureFieldsFragmentDoc,
    "mutation BuildFacility($input: BuildFacilityInput!) {\n  buildFacility(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on BuildFacilitySuccess {\n      camp {\n        location\n      }\n    }\n  }\n}": types.BuildFacilityDocument,
    "fragment CampFields on Camp {\n  activeHeroes\n  hallLevel\n  heroCapacity\n  livingHeroes\n  location\n  name\n  resourceCapacity\n  warehouseLevel\n  facilities {\n    kind\n    level\n  }\n  holdings {\n    balance\n    material\n  }\n}": types.CampFieldsFragmentDoc,
    "mutation DiscardAdventure($input: DiscardAdventureInput!) {\n  discardAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on DiscardAdventureSuccess {\n      adventure {\n        id\n      }\n    }\n  }\n}": types.DiscardAdventureDocument,
    "fragment HeroFields on Hero {\n  id\n  level\n  location\n  name\n  recruitedAt\n  retiredAt\n  spriteSet\n  status\n  unitType\n  xp\n}": types.HeroFieldsFragmentDoc,
    "query HeroesSeenAt($location: ID!) {\n  heroesSeenAt(location: $location) {\n    ...SeenHeroFields\n  }\n}": types.HeroesSeenAtDocument,
    "mutation JoinGame {\n  joinGame {\n    __typename\n    ... on JoinGameSuccess {\n      player {\n        id\n      }\n    }\n  }\n}": types.JoinGameDocument,
    "query Me {\n  me {\n    id\n    camps {\n      ...CampFields\n    }\n    heroes {\n      ...HeroFields\n    }\n    openAdventure {\n      ...AdventureFields\n    }\n  }\n}": types.MeDocument,
    "fragment RecentAdventureFields on RecentAdventure {\n  id\n  outcome\n  settledAt\n  job {\n    id\n    name\n  }\n  party {\n    died\n    level\n    name\n    unitType\n  }\n}": types.RecentAdventureFieldsFragmentDoc,
    "query RecentAdventuresAt($location: ID!) {\n  recentAdventuresAt(location: $location) {\n    ...RecentAdventureFields\n  }\n}": types.RecentAdventuresAtDocument,
    "mutation RecruitHero($input: RecruitHeroInput!) {\n  recruitHero(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on RecruitHeroSuccess {\n      hero {\n        ...HeroFields\n      }\n    }\n  }\n}": types.RecruitHeroDocument,
    "fragment ReplayFields on Adventure {\n  id\n  location\n  settledAt\n  job {\n    id\n    name\n  }\n  result {\n    outcome\n    heroes {\n      dead\n      heroId\n      level\n    }\n  }\n  snapshot {\n    heroes {\n      heroId\n      level\n      name\n      unitType\n    }\n  }\n}": types.ReplayFieldsFragmentDoc,
    "query Replay($id: ID!) {\n  adventure(id: $id) {\n    ...ReplayFields\n    status\n    timeline\n    result {\n      ...ResultFields\n    }\n  }\n}": types.ReplayDocument,
    "query ReplaysOf($job: ID!) {\n  replaysOf(job: $job) {\n    ...ReplayFields\n  }\n}": types.ReplaysOfDocument,
    "fragment ResultFields on AdventureResult {\n  outcome\n  credited {\n    amount\n    material\n  }\n  heroes {\n    dead\n    heroId\n    level\n    xp\n    xpGained\n  }\n  lost {\n    amount\n    material\n  }\n  rewards {\n    amount\n    material\n  }\n  stages {\n    ended\n    kind\n    stage\n  }\n}": types.ResultFieldsFragmentDoc,
    "mutation RetireHero($input: RetireHeroInput!) {\n  retireHero(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on RetireHeroSuccess {\n      hero {\n        ...HeroFields\n      }\n    }\n  }\n}": types.RetireHeroDocument,
    "fragment SeenHeroFields on SeenHero {\n  id\n  level\n  name\n  spriteSet\n  unitType\n}": types.SeenHeroFieldsFragmentDoc,
    "mutation StartAdventure($input: StartAdventureInput!) {\n  startAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on StartAdventureSuccess {\n      adventure {\n        ...AdventureFields\n      }\n    }\n  }\n}": types.StartAdventureDocument,
    "mutation SubmitAdventure($input: SubmitAdventureInput!) {\n  submitAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on SubmitAdventureSuccess {\n      adventure {\n        id\n        result {\n          ...ResultFields\n        }\n      }\n    }\n  }\n}": types.SubmitAdventureDocument,
    "query Timeline($id: ID!) {\n  adventure(id: $id) {\n    id\n    timeline\n  }\n}": types.TimelineDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment AdventureFields on Adventure {\n  id\n  location\n  seed\n  startedAt\n  version\n  job {\n    id\n    description\n    name\n  }\n  snapshot {\n    jobId\n    version\n    heroes {\n      heroId\n      level\n      name\n      spriteSet\n      unitType\n      stats {\n        damage\n        maxHealth\n        speed\n        gather {\n          material\n          rating\n        }\n      }\n    }\n  }\n}"): (typeof documents)["fragment AdventureFields on Adventure {\n  id\n  location\n  seed\n  startedAt\n  version\n  job {\n    id\n    description\n    name\n  }\n  snapshot {\n    jobId\n    version\n    heroes {\n      heroId\n      level\n      name\n      spriteSet\n      unitType\n      stats {\n        damage\n        maxHealth\n        speed\n        gather {\n          material\n          rating\n        }\n      }\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "mutation BuildFacility($input: BuildFacilityInput!) {\n  buildFacility(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on BuildFacilitySuccess {\n      camp {\n        location\n      }\n    }\n  }\n}"): (typeof documents)["mutation BuildFacility($input: BuildFacilityInput!) {\n  buildFacility(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on BuildFacilitySuccess {\n      camp {\n        location\n      }\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment CampFields on Camp {\n  activeHeroes\n  hallLevel\n  heroCapacity\n  livingHeroes\n  location\n  name\n  resourceCapacity\n  warehouseLevel\n  facilities {\n    kind\n    level\n  }\n  holdings {\n    balance\n    material\n  }\n}"): (typeof documents)["fragment CampFields on Camp {\n  activeHeroes\n  hallLevel\n  heroCapacity\n  livingHeroes\n  location\n  name\n  resourceCapacity\n  warehouseLevel\n  facilities {\n    kind\n    level\n  }\n  holdings {\n    balance\n    material\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "mutation DiscardAdventure($input: DiscardAdventureInput!) {\n  discardAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on DiscardAdventureSuccess {\n      adventure {\n        id\n      }\n    }\n  }\n}"): (typeof documents)["mutation DiscardAdventure($input: DiscardAdventureInput!) {\n  discardAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on DiscardAdventureSuccess {\n      adventure {\n        id\n      }\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment HeroFields on Hero {\n  id\n  level\n  location\n  name\n  recruitedAt\n  retiredAt\n  spriteSet\n  status\n  unitType\n  xp\n}"): (typeof documents)["fragment HeroFields on Hero {\n  id\n  level\n  location\n  name\n  recruitedAt\n  retiredAt\n  spriteSet\n  status\n  unitType\n  xp\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query HeroesSeenAt($location: ID!) {\n  heroesSeenAt(location: $location) {\n    ...SeenHeroFields\n  }\n}"): (typeof documents)["query HeroesSeenAt($location: ID!) {\n  heroesSeenAt(location: $location) {\n    ...SeenHeroFields\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "mutation JoinGame {\n  joinGame {\n    __typename\n    ... on JoinGameSuccess {\n      player {\n        id\n      }\n    }\n  }\n}"): (typeof documents)["mutation JoinGame {\n  joinGame {\n    __typename\n    ... on JoinGameSuccess {\n      player {\n        id\n      }\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Me {\n  me {\n    id\n    camps {\n      ...CampFields\n    }\n    heroes {\n      ...HeroFields\n    }\n    openAdventure {\n      ...AdventureFields\n    }\n  }\n}"): (typeof documents)["query Me {\n  me {\n    id\n    camps {\n      ...CampFields\n    }\n    heroes {\n      ...HeroFields\n    }\n    openAdventure {\n      ...AdventureFields\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment RecentAdventureFields on RecentAdventure {\n  id\n  outcome\n  settledAt\n  job {\n    id\n    name\n  }\n  party {\n    died\n    level\n    name\n    unitType\n  }\n}"): (typeof documents)["fragment RecentAdventureFields on RecentAdventure {\n  id\n  outcome\n  settledAt\n  job {\n    id\n    name\n  }\n  party {\n    died\n    level\n    name\n    unitType\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query RecentAdventuresAt($location: ID!) {\n  recentAdventuresAt(location: $location) {\n    ...RecentAdventureFields\n  }\n}"): (typeof documents)["query RecentAdventuresAt($location: ID!) {\n  recentAdventuresAt(location: $location) {\n    ...RecentAdventureFields\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "mutation RecruitHero($input: RecruitHeroInput!) {\n  recruitHero(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on RecruitHeroSuccess {\n      hero {\n        ...HeroFields\n      }\n    }\n  }\n}"): (typeof documents)["mutation RecruitHero($input: RecruitHeroInput!) {\n  recruitHero(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on RecruitHeroSuccess {\n      hero {\n        ...HeroFields\n      }\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment ReplayFields on Adventure {\n  id\n  location\n  settledAt\n  job {\n    id\n    name\n  }\n  result {\n    outcome\n    heroes {\n      dead\n      heroId\n      level\n    }\n  }\n  snapshot {\n    heroes {\n      heroId\n      level\n      name\n      unitType\n    }\n  }\n}"): (typeof documents)["fragment ReplayFields on Adventure {\n  id\n  location\n  settledAt\n  job {\n    id\n    name\n  }\n  result {\n    outcome\n    heroes {\n      dead\n      heroId\n      level\n    }\n  }\n  snapshot {\n    heroes {\n      heroId\n      level\n      name\n      unitType\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Replay($id: ID!) {\n  adventure(id: $id) {\n    ...ReplayFields\n    status\n    timeline\n    result {\n      ...ResultFields\n    }\n  }\n}"): (typeof documents)["query Replay($id: ID!) {\n  adventure(id: $id) {\n    ...ReplayFields\n    status\n    timeline\n    result {\n      ...ResultFields\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query ReplaysOf($job: ID!) {\n  replaysOf(job: $job) {\n    ...ReplayFields\n  }\n}"): (typeof documents)["query ReplaysOf($job: ID!) {\n  replaysOf(job: $job) {\n    ...ReplayFields\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment ResultFields on AdventureResult {\n  outcome\n  credited {\n    amount\n    material\n  }\n  heroes {\n    dead\n    heroId\n    level\n    xp\n    xpGained\n  }\n  lost {\n    amount\n    material\n  }\n  rewards {\n    amount\n    material\n  }\n  stages {\n    ended\n    kind\n    stage\n  }\n}"): (typeof documents)["fragment ResultFields on AdventureResult {\n  outcome\n  credited {\n    amount\n    material\n  }\n  heroes {\n    dead\n    heroId\n    level\n    xp\n    xpGained\n  }\n  lost {\n    amount\n    material\n  }\n  rewards {\n    amount\n    material\n  }\n  stages {\n    ended\n    kind\n    stage\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "mutation RetireHero($input: RetireHeroInput!) {\n  retireHero(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on RetireHeroSuccess {\n      hero {\n        ...HeroFields\n      }\n    }\n  }\n}"): (typeof documents)["mutation RetireHero($input: RetireHeroInput!) {\n  retireHero(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on RetireHeroSuccess {\n      hero {\n        ...HeroFields\n      }\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment SeenHeroFields on SeenHero {\n  id\n  level\n  name\n  spriteSet\n  unitType\n}"): (typeof documents)["fragment SeenHeroFields on SeenHero {\n  id\n  level\n  name\n  spriteSet\n  unitType\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "mutation StartAdventure($input: StartAdventureInput!) {\n  startAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on StartAdventureSuccess {\n      adventure {\n        ...AdventureFields\n      }\n    }\n  }\n}"): (typeof documents)["mutation StartAdventure($input: StartAdventureInput!) {\n  startAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on StartAdventureSuccess {\n      adventure {\n        ...AdventureFields\n      }\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "mutation SubmitAdventure($input: SubmitAdventureInput!) {\n  submitAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on SubmitAdventureSuccess {\n      adventure {\n        id\n        result {\n          ...ResultFields\n        }\n      }\n    }\n  }\n}"): (typeof documents)["mutation SubmitAdventure($input: SubmitAdventureInput!) {\n  submitAdventure(input: $input) {\n    __typename\n    ... on Error {\n      message\n    }\n    ... on SubmitAdventureSuccess {\n      adventure {\n        id\n        result {\n          ...ResultFields\n        }\n      }\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Timeline($id: ID!) {\n  adventure(id: $id) {\n    id\n    timeline\n  }\n}"): (typeof documents)["query Timeline($id: ID!) {\n  adventure(id: $id) {\n    id\n    timeline\n  }\n}"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;