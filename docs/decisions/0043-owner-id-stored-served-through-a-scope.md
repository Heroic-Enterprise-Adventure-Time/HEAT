# 0043: An owner id may be stored in the location table and is served only through a scope; the hub reads no email, and a player's name is private

- **Status:** Decided
- **Date:** 2026-11-04
- **Settles:** Issue-170, which the checkup filed against `docs/standards/graphql.md` rule 13: every adventure record in the location table names its player. The owner changed its direction on 2026-11-04.

## Decision

**The adventure record keeps `playerId`.** Some player information will become shareable through later features, a public profile or a friends list, and other information will not. So the owner id stays stored, and what is served is gated field by field. Only the hub reads the location table, and no field serves that attribute. The location table is "public" in what the API may serve from it, not in everything an item holds.

**A sighting gets no owner yet.** Sightings expire within a week, so the feature that needs an owner can add it then. What decision 0029 says of a sighting stays true until that feature.

**A later owner field is `owner: Player`,** null unless the viewer may see that player, under a new scope beside `self`. Gating only what is behind the id would not be enough, because a repeated id itself links a player's heroes and adventures. An owner field, DataLoader, a public handle, and whether a public id should be the token's subject all wait for the feature that needs them.

**The hub stops reading the token's `email` claim** (the owner, 2026-11-04). It reads `sub` and no other claim, and a new profile is named with the player's id. The hub has no use for a person's email, so the way to keep it private is not to hold it. The client's own header goes on showing the email from the browser's token, which never reaches the hub.

**`Player.name` takes `self`, and so becomes nullable** (`graphql.md`, rules 2 and 11). A profile made before this change could hold an email, so the field is treated as personal data whatever a given player's holds. `player(id)` stays public and answers only the id to anyone else. Names already stored are not changed and need no migration: they stay in the player table and are served only to their player. The client selects no `name` from `Player`, so its generated code does not change.

**`graphql.md` gains rule 23,** a field holding personal data is never public, and rule 11's public list says what each listed field contains. The list had read "`player(id)` with `id` and `name`", which reviewed the field's name and not what was in it.

## What the exposure turned out to be

The rewritten issue says any signed-in caller holding another player's id can read that player's email. That is narrower in practice:

- **What a caller could read was real:** on `heat-sb170`, on `main`'s code, `player2` read `player1`'s `name` through `player(id)`, with no error.
- **The value was the subject, not an email.** The access token has no `email` claim and the ID token does. The client sends the access token (`packages/client/src/app/hub.ts`), and so does the stack test.
- **An email reached a profile only if an ID token made it.** The authorizer accepts either token, and `joinPlayer` names a profile once, on its first write. On `heat-sb170`, `player1`'s profile, made with the access token, stayed the subject when later read with an ID token. No client or script in the repository's history has sent an ID token.
- **The stored data agrees.** The owner read the names in `prod` on 2026-11-04: each is the player's GUID, and no email is there. The agent's roles are not allowed those items.

So the gap was latent: a real path, which no player's data had taken. It also shows that a profile's `name` is a copy of its `id`, which is what a public handle will have to replace.

## When it takes effect

**One deploy later than the merge, in each environment.** `/previous/graphql` runs the deploy before the current one (decision 0030), so that route goes on serving `name`, and on reading the claim for a new profile, until a second deploy of this code or later. On `heat-sb170`, with the scope current and `da5d313` as the previous route, `player2` read `player1`'s name there; once the previous route was on the scope, the same call answered null with `FORBIDDEN`. No shim is taken for it: the window is one deploy, and what it serves is what every route has served until now. Issue-222 confirms the close in `dev` and `prod`.

## Whether `player(id)` was called with another player's id

**Not checkable, from any log.** The hub's request line holds the operation name and never variables or the caller (`packages/hub/src/observability.ts`, `graphql.md` rule 16). The HTTP API's access log holds the route, the status and the source address, and not the body or a claim (`terraform/modules/environment/api.tf`). Having `prod`'s logs would not change that. What bounds it is that no field reveals another player's id, so a caller would have needed the id from elsewhere.

## Deny by default

**`@pothos/plugin-scope-auth` has no such option at 4.2.2.** Its options are `unauthorizedError`, `cacheKey`, `runScopesOnType`, `treatErrorsAsUnauthorized`, `authorizeOnSubscribe`, `defaultStrategy` and `authScopes` (`src/types.ts`), and `wrapResolve` returns a field with no scopes unwrapped (`src/index.ts`). The nearest it offers is `authScopes` on a type, which covers that type's fields and does nothing for a new type, and a field opts out of it with `skipTypeScopes`.

**The same effect is a test, and it is not built here.** Walk the schema from the root types, stop at any field with a scope, and fail on any field reached that is not on a reviewed list matching rule 11's. A new field is then closed until someone lists it. It is an issue of its own, if the owner wants it, because it starts by listing every field reachable today.

## Considered and not chosen

**Ownership moved out of the record,** the checkup's fix: an item `PLAYER#<id> | ADVENTURE#<adventureId>` in the player table, or the `OPEN` item as the proof of ownership. Either takes `playerId` off the record, with a migration of what is stored past the previous route of decision 0030. It treats the attribute as the exposure, and nothing serves the attribute. It would also have to be undone for an owner field. The owner's call.

**The record as an accepted exception to rule 13,** with the rule otherwise unchanged. It would leave the rule saying the table holds nothing that says whose a hero is, and an exception beside it. The rule now says what is true.

**A chosen display name in place of the scope.** It needs a form, validation and a decision about offensive names, and it is the public handle that waits for its feature. That feature adds its own public field, and `name` stays private.

**Removing `player(id)`.** Nothing in the client or the stack test calls it, and it now answers only an id. It is left for the feature that decides what a public player is, because removing it is a contract change this issue does not need.

**Renaming `name` to `email`.** It changes the contract and the stored attribute, protects nothing more, and would now name something the hub does not hold.

**The scope alone, with the claim still read.** The agent's first recommendation, as the smaller change. It would have gone on storing an email for any first call made with an ID token, to protect it afterwards.

**Removing `Player.name`.** It is now a copy of the id, but a profile in an older shape may differ from it, and what a player's name is belongs to the public handle's feature.

## Facts checked

All on 2026-11-04.

- **`heat-sb170`, on `main`'s code,** as `player1` and `player2` through the `ci` client: the access token's and the ID token's claims, and what `player2` reads about `player1`. The script printed what kind of value each was, never the value. `AuditRole` is denied `ssm:GetParameter`, so the stack's `app_client_id` was read through `plan-heat-sandbox`.
- **The repository's history:** `git log -G 'id_token|idToken'` over `packages/client/src` and `scripts/e2e.mjs` finds nothing.
- **`@pothos/plugin-scope-auth` 4.2.2's published source,** as cited above.

## Where it is described

`docs/standards/graphql.md`, rules 11, 13 and 23. `docs/architecture/overview.md`, "Services and data". `packages/hub/src/db/keys.ts`, `packages/hub/src/schema/schema.ts`.
