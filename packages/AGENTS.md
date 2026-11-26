# packages

The TypeScript packages: the engine, the hub (a Lambda function, decision 0012) and the Angular client. Each is an npm workspace with its own `package.json`, built, typechecked and tested from the repository root.

Read and follow the standards for this area: @../docs/standards/typescript.md

The detail of that standard's rules on dependencies and lint, and what it holds back, is `docs/standards/typescript-dependencies.md`, which nothing loads; its opening says when each section is read.

Function and route definitions for every Lambda live in `../manifest.json` at the repository root, not in any package.
