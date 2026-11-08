# packages

The TypeScript packages: the engine, the hub (the one Lambda function, decision 0012) and the Angular client. Each is an npm workspace with its own `package.json`, built, typechecked and tested from the repository root.

Read and follow the standards for this area: @../docs/standards/typescript.md

Function and route definitions for every Lambda live in `../manifest.json` at the repository root, not in any package.
