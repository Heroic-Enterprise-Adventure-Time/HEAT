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
 *   PLAYER#<id>    | PROFILE                        the player
 *   PLAYER#<id>    | HOLDING#<material>             a balance; becomes AT#<location>#HOLDING#<material> once locations exist
 *   PLAYER#<id>    | OPEN                           the one open adventure
 *   PLAYER#<id>    | LEDGER#<adventureId>#<entry>   append-only; the entry can exist once, which is what makes settle pay once
 *
 * The location table, partitioned by location, and by adventure for the one
 * record settle looks up by id. Public: what every player may see.
 *
 *   ADVENTURE#<id> | RECORD                         status, seed, result
 *   LOCATION#<id>  | ...                            the feed, presence, offers: build order step 3
 */
export const KEY = { pk: "PK", sk: "SK" } as const;

export const playerKeys = {
  profile: (id: string) => ({ PK: `PLAYER#${id}`, SK: "PROFILE" }),
  holding: (id: string, material: string) => ({ PK: `PLAYER#${id}`, SK: `HOLDING#${material}` }),
  open: (id: string) => ({ PK: `PLAYER#${id}`, SK: "OPEN" }),
  ledger: (id: string, adventureId: string, entry: string) => ({
    PK: `PLAYER#${id}`,
    SK: `LEDGER#${adventureId}#${entry}`,
  }),
};

export const locationKeys = {
  adventure: (adventureId: string) => ({ PK: `ADVENTURE#${adventureId}`, SK: "RECORD" }),
};
