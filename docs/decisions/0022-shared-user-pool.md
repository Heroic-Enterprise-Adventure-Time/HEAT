# 0022: The shared user pool: Essentials tier, email as the username, administrator-created users, no MFA, administrator-only recovery, a password-flow CI client

- **Status:** Decided
- **Date:** 2026-10-17
- **Settles:** the pool's shape, which Issue-13 (closed as superseded) carried as "a Cognito user pool and browser app client" and which 0018 placed in the sandbox base without settling. 0018's "one pool per account, an app client per stack" and 0020's "test users are data" are taken as given.

## Decision

One user pool per account, created by the `base` module (`terraform/modules/base`) and shared by every stack in the account. Its settings, each fixed at creation because the ones that matter most cannot be changed afterwards:

| Setting | Value | Because |
| --- | --- | --- |
| Feature plan | Essentials | The lowest plan with managed login, which Issue-46's browser sign-in uses; free for the first 10,000 monthly active users, without expiry |
| Username | The email address, required, matched without regard to case | One identity per address whatever its spelling; Google supplies an address for every player |
| Self sign-up | Off: only an administrator creates a user | Players arrive through Google (Issue-46) and test users through the apply job (0020); a password sign-up form would be an attack surface with no user |
| MFA | Off | Test users have no second device; Google brings its own second factor |
| Password policy | Cognito's default | Nothing here needs more; the test password meets it |
| Account recovery | Administrator only | Test addresses receive no mail; players recover through Google |
| Deletion protection | On, and `prevent_destroy` | The pool holds players' records and its id is in every stack's configuration |
| Domain and managed login | None yet | They arrive with the first browser client (Issue-46) |

One app client in the base, `ci`: public, `USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH` only, access and ID tokens of one hour, a refresh token of one day, user-existence errors suppressed, token revocation on. It is what the end-to-end tests sign in with, and the agent when it needs a token. Browser clients, with the authorization code grant and PKCE, are each stack's own (Issue-38, Issue-46).

## Considered and not chosen

**The Lite plan.** It carries the hosted UI, not managed login, and AWS directs new features to Essentials. The free tier is the same 10,000 monthly active users. Essentials costs more only above that number, which is a problem this project would be glad to have.

**The Plus plan.** Adds threat protection, at a price from the first user with no free tier. Revisited if the pool ever sees an attack that the other controls do not stop.

**An opaque username with the email as an alias.** Lets a player change the address later while keeping the same sign-in name; with email as the username attribute Cognito keeps the record's `sub` stable and the address is mutable anyway, so the alias buys nothing here.

**Optional MFA.** The only password users are test users, and a second factor on them is a second secret for the pipeline to hold.

**Recovery by email.** A recovery code to a test address goes nowhere, and a player's recovery is Google's.

**A stricter password policy, and password history.** Nothing in the pool is protected by a password that a person chooses.

**Longer tokens for the CI client.** A test run lasts minutes; a refresh token of one day covers a run that is retried the next morning and nothing longer.

## Facts checked

All read on 2026-10-17.

- **Feature plans** (Cognito developer guide, "Essentials plan features"): "Where the Lite plan has the hosted UI, the Essentials plan opens up this advanced version of sign-up and sign-in pages"; "The Essentials plan is the lowest plan level that unlocks access to managed login"; "To stay up-to-date with new user pool features, choose the Essentials plan for your user pools."
- **Pricing** (Cognito pricing page): Lite and Essentials each have 10,000 monthly active users free; Essentials is $0.015 per monthly active user above that; Plus is $0.020 from the first user with no free tier; the free tier "does not automatically expire at the end of your 12-month AWS Free Tier term"; "There is no additional charge for the number of app clients you have registered in your account."
- **The provider** (hashicorp/aws 6.69.1, `terraform providers schema -json`): `aws_cognito_user_pool` has `user_pool_tier`, `deletion_protection`, `username_attributes`, `auto_verified_attributes`, the blocks `username_configuration`, `admin_create_user_config`, `account_recovery_setting`, `schema`, `password_policy` and `sign_in_policy`; `aws_cognito_user_pool_client` has `explicit_auth_flows`, `generate_secret`, the three validities with `token_validity_units`, `prevent_user_existence_errors` and `enable_token_revocation`. The plan of the base, run through the plan role, shows `password_policy` and `sign_in_policy` as known after apply, which is the service's defaults being applied.
- **What cannot change after creation**: `username_attributes`, `username_configuration` and a `schema` block's `required` force a new pool (the provider's documentation and the schema's replace-triggering attributes), which is why they are settled here before the first player exists.

## Where it is described

`terraform/modules/base/user_pool.tf` and `terraform/environment/sandbox-base/README.md`. `docs/architecture/overview.md`, "Environments".
