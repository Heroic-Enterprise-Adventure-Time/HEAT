# 0015: Domains on dcg-games.com

- **Status:** Decided. Amended by 0018 on 2026-10-16: each hostname is a CloudFront distribution carrying the client and the APIs; the APIs have no hostname of their own.
- **Date:** 2026-10-14, recorded 2026-10-15
- **Amends:** 0010, the "Domains" paragraph

## Decision

`heat.dcg-games.com` for production and `heat-dev.dcg-games.com` for development, each a hosted zone in its workload account delegated by the organization layer in the `dcg-platform` repository. Everything else in 0010 stands.

Checked 2026-10-14 against the management account: `dcg-games.com` is registered in Route 53 Domains with auto-renew and the transfer lock on, renews on 2026-12-18, and its zone held only the NS, SOA and one verification record.

## Considered and not chosen

**`doublecobra.com`**, named in 0010. It is the company's domain and carries its mail. The owner prefers the games domain for the games, and its zone was empty, so HEAT starts in a clean namespace.

## Where it is described

`docs/architecture/overview.md`, "Environments".
