import { writeFileSync } from "node:fs";
import { lexicographicSortSchema, printSchema } from "graphql";
import { schema } from "../src/schema/schema.js";

/**
 * Code-first, but the contract is committed: this prints the SDL that Pothos
 * built so that every pull request shows API changes as a schema diff and the
 * client's code generation reads a committed file. Run through
 * `npm run schema:print`; CI fails if the committed file is stale.
 */
const out = new URL("../schema.graphql", import.meta.url);
writeFileSync(out, printSchema(lexicographicSortSchema(schema)) + "\n");
console.log(`wrote ${out.pathname}`);
