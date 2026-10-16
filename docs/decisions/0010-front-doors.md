# 0010: Front doors: API Gateway for the API, CloudFront for the client

- **Status:** Decided. Domains amended by 0015; the VPC link moot per 0012; amended by 0018 on 2026-10-16: one hostname per environment, with the APIs on paths behind the CloudFront distribution instead of on their own custom domain.
- **Date:** 2026-10-14

## Decision

**The API.** One API Gateway per environment fronts the GraphQL hub through an HTTP API and carries the live channel as a WebSocket API, both on the environment's custom domain with an ACM certificate. There is no load balancer. If the hub runs as a container, the HTTP API reaches it through a VPC link that discovers the tasks in Cloud Map and spreads requests across the healthy ones; if the hub runs as a Lambda, the integration is direct. Either way the hub is reached only through the gateway.

**The client.** The Angular app is a static site in an S3 bucket behind a CloudFront distribution in the workload account.

**Domains.** `heat.doublecobra.com` for production and `heat-dev.doublecobra.com` for development, each a hosted zone in its workload account delegated by the organization layer (a change in the `dcg-platform` repository). Certificates for CloudFront and the gateway validate through those zones; Cognito callback URLs name them.

**Why API Gateway over a load balancer.** The architecture's live channel is API Gateway-shaped: Lambda handlers on connect and disconnect, a DynamoDB table of connections, the verifier and the hub pushing to clients through the gateway's callback API, which any IAM principal with `execute-api:ManageConnections` may call, the hub included. Behind a load balancer that design has no home; the sockets would terminate in the hub, which would then hold connection state and need a fan-out mechanism between instances. The gateway also costs nothing at rest: one dollar per million requests and twenty-five cents per million WebSocket connection-minutes, against a load balancer's $16.43 a month before traffic (price list, 2026-10-13). Token checking before the hub is available on both.

## Considered and not chosen

**An Application Load Balancer.** Native WebSocket passthrough, HTTP/2 and gRPC, WAF, access logs, weighted target groups and a newer JWT-verification rule. Everything it has that the gateway lacks is a feature HEAT does not use, and it would move the live channel into the hub. $16 a month plus capacity units, more than the hub itself at HEAT's scale.

**App Runner.** Load balancing, TLS and autoscaling built in, cheapest at idle. A less standard story and a narrower product; kept as the fallback if the container shape ever feels heavy, and moot if the hub becomes a Lambda.

**Amplify Hosting for the client.** It is CloudFront and S3 with a pipeline attached; the pipeline is ours already.

## What it imposes

Clients reconnect on the WebSocket API's two-hour connection limit and ten-minute idle disconnect, so the Angular client pings every few minutes and reconnects in a loop. A single GraphQL request is bounded by the HTTP API's integration timeout. Messages through the gateway are JSON and at most 128 KB.

## Where it is described

`docs/architecture/overview.md`, "Live location channel" and "Environments".
