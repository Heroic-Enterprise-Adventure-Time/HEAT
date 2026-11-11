/**
 * The key layout of the two tables (decision 0023). Terraform owns the real
 * tables; the tests create identical ones in test/setup/table.ts. Both use
 * generic key names, PK and SK, so that an item type is a sort-key prefix
 * and a new type is a new prefix, never a table change. TEMPLATES below are
 * this layout as ElectroDB reads it, and every entity in entities.ts takes its
 * keys from them (decision 0041).
 *
 * The player table, partitioned by player. Everything the owner asks for is
 * one item collection, read in one Query. Private: read only through the
 * hub, each field under the `self` scope but for the player's id.
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
 * record settle looks up by id. Public: what every player may see, but for an
 * owner id stored for the hub's own checks, which no field serves without a
 * scope (decision 0043).
 *
 *   ADVENTURE#<id> | RECORD                         status, the player's id, seed, location, job, the frozen snapshot,
 *                                                   the version that issued it, start time; at settlement the result
 *   LOCATION#<id>  | SEEN#<heroId>                  a hero seen there: public fields only, no owner, and
 *                                                   expiresAt, the table's TTL attribute (decision 0029)
 *   LOCATION#<id>  | DONE#<settledAt>#<adventureId> an adventure completed there: public fields only, no owner, and
 *                                                   expiresAt; settledAt is ISO 8601 in UTC, so the keys sort in
 *                                                   time order (decision 0050)
 *   LOCATION#<id>  | FACILITY#..., CONTRIB#...      kept for step 5's shared facilities, which are not designed
 */
export const KEY = { pk: "PK", sk: "SK" } as const;

/** The version every entity is at, which ElectroDB writes on an item as `__edb_v__`. */
export const ITEM_VERSION = "1";

export const TEMPLATES = {
  player: "PLAYER#${playerId}",
  profilePk: "PLAYER#${id}",
  profile: "PROFILE",
  camp: "AT#${location}#CAMP",
  facility: "AT#${location}#FACILITY#${kind}",
  holding: "AT#${location}#HOLDING#${material}",
  hero: "HERO#${id}",
  open: "OPEN",
  ledger: "LEDGER#${cause}#${entry}",
  adventurePk: "ADVENTURE#${adventureId}",
  adventure: "RECORD",
  locationPk: "LOCATION#${location}",
  sighting: "SEEN#${heroId}",
  recent: "DONE#${settledAt}#${adventureId}",
} as const;
