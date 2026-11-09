import { createRequire } from "node:module";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // One graphql, as the bundle has. Vite would give our files its .mjs build
    // and Node gives Pothos its CommonJS one, and graphql refuses a type from the other.
    alias: [{ find: /^graphql$/, replacement: createRequire(import.meta.url).resolve("graphql") }],
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup/dynamodb.ts"],
    // One DynamoDB Local container for the run; tests use distinct keys.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
