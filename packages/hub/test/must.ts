/**
 * The value, or a failed test with a message. For a value the types say
 * may be absent, such as the first hero of a fixture or a record read back: the test says what it
 * expected, instead of a `!` that would fail later as a TypeError
 * (docs/standards/typescript.md, rule 6).
 */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null) throw new Error(`${what} is missing`);
  return value;
}
