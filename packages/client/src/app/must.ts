/**
 * The value, or a failure with a message. For a value the types say may be
 * absent while the code knows it is present, a Map entry just written or an
 * index a loop keeps in range, and for a test's fixture lookup: the message
 * says what was expected, instead of a `!` that would fail later as a
 * TypeError (docs/standards/typescript.md, rule 6). The client's copy; the
 * engine's and the hub's tests each have their own, since packages do not
 * import each other's tests.
 */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null) throw new Error(`${what} is missing`);
  return value;
}
