import * as z from "zod/mini";

/**
 * The environment Terraform sets on the function, read through zod like every
 * other boundary (decision 0039). Each module declares the variables it reads
 * and reads them here, so a variable that is missing fails
 * the import, saying which, and the function never starts half configured.
 */

/** A variable the hub cannot run without: present and not empty. */
export const requiredVariable = z.string().check(z.minLength(1));

export function parseEnv<T extends z.ZodMiniType>(schema: T, env: NodeJS.ProcessEnv): z.output<T> {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  throw new Error(parsed.error.issues.map(({ path }) => `${path.join(".")} is not set`).join("; "));
}
