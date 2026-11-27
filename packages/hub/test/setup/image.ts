import { readFileSync } from "node:fs";

/**
 * A reference a test may start: a name, an exact version and the digest of
 * what that version was when it was taken (docs/standards/typescript.md,
 * rule 33). `latest`, a bare tag or a tag without a digest do not match.
 */
export const PINNED_IMAGE = /^[a-z0-9]+(?:[._/-][a-z0-9]+)*:[0-9]+(?:\.[0-9]+)*@sha256:[0-9a-f]{64}$/;

/**
 * The image a `*.Dockerfile` names on its one `FROM` line, refused unless it
 * is pinned by version and digest. The file is there for Dependabot, which
 * moves both together; nothing builds it.
 */
export function imageFrom(dockerfile: URL): string {
  const lines = readFileSync(dockerfile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^FROM\s/i.test(line));
  if (lines.length !== 1) {
    throw new Error(`${dockerfile.pathname} must have exactly one FROM line, not ${String(lines.length)}`);
  }
  const image = lines[0]?.split(/\s+/)[1] ?? "";
  if (!PINNED_IMAGE.test(image)) {
    throw new Error(`${dockerfile.pathname} names ${image}, which is not name:version@sha256:<digest>`);
  }
  return image;
}
