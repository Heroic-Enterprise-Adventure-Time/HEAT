# packages

The TypeScript packages: the engine, the hub, the Angular client, and later the Lambda handlers. Each is an npm workspace with its own `package.json`, built, typechecked and tested from the repository root.

Read and follow the standards for this area: @../docs/standards/typescript.md

Function and route definitions for every Lambda live in `../local/manifest.json`, not in any package.
