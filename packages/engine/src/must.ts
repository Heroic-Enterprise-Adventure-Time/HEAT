/**
 * The value, or a failure with a message. For a value the types say may be
 * absent while the code knows it is present, a Map entry just written or an
 * index a loop keeps in range, and for a test's fixture lookup, a content
 * entry by id or the first hero of a party: the message says what was
 * expected, instead of a `!` that would fail later as a TypeError
 * (docs/standards/typescript.md, rule 6). One function for every package,
 * here because the engine is the package the hub and the client import.
 */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null) throw new Error(`${what} is missing`);
  return value;
}
