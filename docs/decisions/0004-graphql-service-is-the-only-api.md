# 0004: The GraphQL service is the only API for core requests

- **Status:** Superseded by 0012
- **Date:** 2026-10-08

## Decision

A Java GraphQL service (Spring Boot, in a container) is the hub and the only API for these requests. It reads Postgres, DynamoDB and S3, and it is the one place authorization is enforced. If one store is unavailable, GraphQL returns the rest along with errors.

## Considered and not chosen

**Lambdas serve reads alongside the GraphQL service.** The field-level rules would then exist twice, in two languages.

## Where it is described

`docs/architecture/overview.md`, "Services and data".
