import * as z from 'zod/mini';

/**
 * Fetches one of the page's own static files, the art's JSON beside its
 * images, and checks it against the zod schema that is its type, where it is
 * read (angular.md, rule 4). A file the build copied wrong, or art whose
 * provenance changed shape, fails here with the file's name, not as a
 * missing field deep in a scene. A request to the hub goes through `Hub`.
 */
export async function fetchJson<Schema extends z.ZodMiniType>(url: string, schema: Schema, fetchFn: typeof fetch = fetch): Promise<z.output<Schema>> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${String(response.status)}`);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`${url} is not what the page reads: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
