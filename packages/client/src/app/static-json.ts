import * as z from 'zod/mini';

/**
 * Checks what one of the page's own static files held against the zod schema
 * that is its type, where it is read (angular.md, rule 4). A file the build
 * wrote wrong fails here with the file's name, not as a missing field deep
 * in a scene.
 */
export function checkJson<Schema extends z.ZodMiniType>(url: string, value: unknown, schema: Schema): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${url} is not what the page reads: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/**
 * Fetches one of the page's own static files, the art's JSON beside its
 * images, and checks it with `checkJson`. A request to the hub goes through
 * `Hub`; a sprite set's sheet is loaded by PixiJS (`sprite-sheet.ts`).
 */
export async function fetchJson<Schema extends z.ZodMiniType>(url: string, schema: Schema, fetchFn: typeof fetch = fetch): Promise<z.output<Schema>> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${String(response.status)}`);
  const text = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Not JSON at all, such as the page itself served in place of a missing file.
    throw new Error(`${url} is not JSON`);
  }
  return checkJson(url, value, schema);
}
