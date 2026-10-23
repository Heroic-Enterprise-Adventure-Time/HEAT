/**
 * The key layout of the two tables (decision 0023). Terraform owns the real
 * tables; the tests create identical ones in test/setup/table.ts. Both use
 * generic key names, PK and SK, so that an item type is a sort-key prefix
 * and a new type is a new prefix, never a table change.
 *
 * The player table, partitioned by player. Everything the owner asks for is
 * one item collection, read in one Query. Private: read only through the
 * hub, under the `self` scope.
 *
 *   PLAYER#<id>    | PROFILE                           the player
 *   PLAYER#<id>    | AT#<location>#CAMP                hall and warehouse levels, the counts of active and living heroes
 *   PLAYER#<id>    | AT#<location>#FACILITY#<kind>     a facility the camp builds, and its level; the hall's and the
 *                                                       warehouse's levels are on the camp's item (decision 0032)
 *   PLAYER#<id>    | AT#<location>#HOLDING#<material>  a resource balance at that location
 *   PLAYER#<id>    | HERO#<heroId>                    a hero, its location an attribute, since a hero can move, and
 *                                                       adventureId while it is on the open adventure
 *   PLAYER#<id>    | OPEN                              the one open adventure: its id, seed and start time
 *   PLAYER#<id>    | LEDGER#<causeId>#<entry>          append-only; the cause is an adventure id, a hero id or a
 *                                                       build-<location>-<kind>-<level>, and the entry can exist
 *                                                       once, which is what makes settle pay and a build charge once
 *
 * The keys and their reasons are decision 0026. The spike's HOLDING#<material>
 * items in dev and prod are no longer read and are left in place.
 *
 * The location table, partitioned by location, and by adventure for the one
 * record settle looks up by id. Public: what every player may see.
 *
 *   ADVENTURE#<id> | RECORD                         status, seed, location, job, the frozen snapshot, the
 *                                                   version that issued it, start time; at settlement the result
 *   LOCATION#<id>  | SEEN#<heroId>                  a hero seen there: public fields only, no owner, and
 *                                                   expiresAt, the table's TTL attribute (decision 0029)
 *   LOCATION#<id>  | ...                            the feed, offers: the rest of build order step 3
 */
export const KEY = { pk: "PK", sk: "SK" } as const;

export const playerKeys = {
  profile: (id: string) => ({ PK: `PLAYER#${id}`, SK: "PROFILE" }),
  camp: (id: string, location: string) => ({ PK: `PLAYER#${id}`, SK: `AT#${location}#CAMP` }),
  facility: (id: string, location: string, kind: string) => ({ PK: `PLAYER#${id}`, SK: `AT#${location}#FACILITY#${kind}` }),
  holding: (id: string, location: string, material: string) => ({
    PK: `PLAYER#${id}`,
    SK: `AT#${location}#HOLDING#${material}`,
  }),
  hero: (id: string, heroId: string) => ({ PK: `PLAYER#${id}`, SK: `HERO#${heroId}` }),
  open: (id: string) => ({ PK: `PLAYER#${id}`, SK: "OPEN" }),
  ledger: (id: string, causeId: string, entry: string) => ({
    PK: `PLAYER#${id}`,
    SK: `LEDGER#${causeId}#${entry}`,
  }),
};

export const locationKeys = {
  adventure: (adventureId: string) => ({ PK: `ADVENTURE#${adventureId}`, SK: "RECORD" }),
  seen: (location: string, heroId: string) => ({ PK: `LOCATION#${location}`, SK: `SEEN#${heroId}` }),
};
