import { randomUUID } from "node:crypto";

import { context, SpanKind, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider, InMemorySpanExporter, type ReadableSpan, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { Context as LambdaContext } from "aws-lambda";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { VERSION_ATTRIBUTE } from "../src/observability.js";
import { event, type Handler } from "./event.js";
import { VERSION } from "./versions.js";

/**
 * What the hub puts on a trace, through the handler (typescript.md, rule 9;
 * decision 0055): a span for each root field a request runs, named for the
 * field, with the field's name and the deploy's version as X-Ray annotations,
 * and nothing of the request, its variables, its document or its answer
 * (graphql.md, rule 16).
 *
 * In Lambda the layer registers the provider and makes the function's span.
 * Here the test registers one that keeps its spans in memory, and stands in
 * for the function's span with one of its own, so that the parentage shows.
 */
const exporter = new InMemorySpanExporter();

let handler: Handler;

beforeAll(async () => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));
  // The handler reads its configuration at import time, as graphql.test.ts says.
  handler = (await import("../src/handler.js")).handler as unknown as Handler;
});

beforeEach(() => {
  exporter.reset();
});

/** Calls the handler inside a span that stands for the function's, and answers the reply's text and the spans the request made. */
async function traced(query: string, variables: Record<string, unknown>, playerId: string): Promise<{ body: string; spans: ReadableSpan[]; parent: string }> {
  const tracer = trace.getTracer("test");
  return tracer.startActiveSpan("function", { kind: SpanKind.SERVER }, async (span) => {
    const res = await handler(event(query, variables, playerId), {} as LambdaContext);
    span.end();
    return { body: res.body ?? "", spans: exporter.getFinishedSpans().filter((finished) => finished.name !== "function"), parent: span.spanContext().spanId };
  });
}

describe("the hub's spans", () => {
  it("names a span for each root field, under the function's, with the field and the version as annotations", async () => {
    const player = `p-${randomUUID()}`;
    await traced(`mutation { joinGame { __typename } }`, {}, player);
    exporter.reset();

    const { spans, parent } = await traced(`query Anything { me { id } version }`, {}, player);

    expect(spans.map((span) => span.name).sort()).toEqual(["Query.me", "Query.version"]);
    for (const span of spans) {
      expect(span.parentSpanContext?.spanId).toBe(parent);
      expect(span.attributes[VERSION_ATTRIBUTE]).toBe(VERSION);
      expect(span.attributes["aws.xray.annotations"]).toEqual(["graphql.field.name", VERSION_ATTRIBUTE]);
    }
    expect(spans.map((span) => span.attributes["graphql.field.name"]).sort()).toEqual(["me", "version"]);
  });

  it("records nothing of the request: not its variables, its document, the caller or the answer", async () => {
    const player = `p-${randomUUID()}`;
    const requestId = randomUUID();
    await traced(`mutation { joinGame { __typename } }`, {}, player);
    exporter.reset();

    const { body, spans } = await traced(
      `mutation Zzyzx($id: UUID!) { recruitHero(input: { location: "millbrook", unitType: VILLAGER, requestId: $id }) { __typename ... on RecruitHeroSuccess { hero { id name } } } }`,
      { id: requestId },
      player,
    );

    const reply = JSON.parse(body) as { data: { recruitHero: { __typename: string; hero: { id: string; name: string } } } };
    expect(reply.data.recruitHero.__typename).toBe("RecruitHeroSuccess");
    expect(spans.map((span) => span.name)).toEqual(["Mutation.recruitHero"]);

    const [span] = spans;
    expect(Object.keys(span?.attributes ?? {}).sort()).toEqual(["aws.xray.annotations", "graphql.field.name", "graphql.field.path", "graphql.field.type", VERSION_ATTRIBUTE].sort());
    expect(span?.events).toEqual([]);
    const recorded = JSON.stringify(spans.map((finished) => [finished.name, finished.attributes, finished.events, finished.links]));
    for (const secret of [requestId, player, reply.data.recruitHero.hero.id, reply.data.recruitHero.hero.name, "Zzyzx", "VILLAGER"]) {
      expect(recorded).not.toContain(secret);
    }
  });

  it("records no exception for a refusal, which is an answer and not a failure", async () => {
    const player = `p-${randomUUID()}`;
    await traced(`mutation { joinGame { __typename } }`, {}, player);
    exporter.reset();

    // A new camp has no ore, so a fighter is refused, as data (graphql.md, rule 6).
    const { body, spans } = await traced(`mutation($id: UUID!) { recruitHero(input: { location: "millbrook", unitType: FIGHTER, requestId: $id }) { __typename } }`, { id: randomUUID() }, player);

    const reply = JSON.parse(body) as { data: { recruitHero: { __typename: string } }; errors?: unknown };
    expect(reply.errors).toBeUndefined();
    expect(reply.data.recruitHero.__typename).not.toBe("RecruitHeroSuccess");
    expect(spans.map((span) => span.name)).toEqual(["Mutation.recruitHero"]);
    expect(spans[0]?.events).toEqual([]);
  });
});
