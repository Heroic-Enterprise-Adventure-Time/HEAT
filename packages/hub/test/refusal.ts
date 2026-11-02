/**
 * What the data-layer tests share for reading a refusal (typescript.md,
 * rule 19): a function throws a refusal class, which the graph answers as
 * data (graphql.md, rule 6), or the GraphQLError of malformed input.
 */

/** What the call threw, or undefined when it answered. */
export async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  return undefined;
}

/** How malformed input is refused: a GraphQLError with the code, never a refusal type (graphql.md, rule 14). */
export const BAD_USER_INPUT = { extensions: { code: "BAD_USER_INPUT" } };
