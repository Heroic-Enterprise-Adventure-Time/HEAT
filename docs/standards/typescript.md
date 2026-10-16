# TypeScript and Node

Standards for every TypeScript package in this repository: the engine, the hub, the Lambda handlers, and the tooling around them. The Angular client follows these where Angular's own conventions do not say otherwise.

## Rules

### Versions and dependencies

1. **Latest, preferring LTS where it exists.** Node is the current LTS line, pinned by major in `.node-version` at the repository root; `fnm`, CI, the bundler's target and the Lambda runtime identifier (`nodejs<major>.x`, in the emulator and in Terraform) all follow that one number. Libraries are kept at their latest release; a library with an LTS line is kept on that line. Falling behind is a defect to fix, not a state to maintain. Dependabot opens the pull requests (`.github/dependabot.yml`); a major that cannot be taken yet is listed under "Held back" at the end of this document, with the reason and what releases it.
2. **Exact pins, committed lock file.** `package.json` names exact versions, never ranges, and `package-lock.json` is committed. CI installs with `npm ci`, so what runs there is what ran on the laptop.
3. **Install scripts are approved by name.** npm withholds packages' install scripts until they are listed under `allowScripts` in the root `package.json`. A new one is approved with `npm install-scripts approve <package>`, in the pull request that introduces the dependency, and the pull request description says what the script does.
4. **One source of truth for functions and routes.** `local/manifest.json` lists every Lambda and its routes. The emulator, the bundler and Terraform read it; nothing declares a function or route anywhere else.

### Language and modules

5. **ES modules only.** Every package is `"type": "module"`. Imports of local files carry the `.js` extension, as Node's ESM resolution requires. The base settings live in `tsconfig.base.json`; a package overrides only what it must, and says why in a comment.
6. **Strict everything.** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax` are on and stay on. A type error is fixed at its cause; `any` and non-null assertions are last resorts and carry a comment.
7. **Shared code is a package, not a Lambda.** Logic the client and the backend both need, above all the engine, is a workspace package that both import. A Lambda never invokes another Lambda to run shared logic.

### Testing

8. **Vitest, in every package, run by `npm test` at the root.** Unit tests need nothing installed. Integration tests start their own containers through Testcontainers, so they need Docker and nothing else, on a laptop and on CI alike (decision 0009).
9. **Handlers are tested as functions.** A Lambda handler is exercised by calling it with a synthesized event of the exact shape AWS sends, never through a mocked SDK inside the code under test.

### The hub

10. **Apollo Server, Pothos code-first, scope-auth for authorization.** Field-level access is declared as scopes on fields and types; a field the caller may not read resolves to null with an error on that field, so such fields are declared nullable.
11. **The printed schema is committed.** `npm run schema:print` writes `packages/hub/schema.graphql` from the Pothos builder; CI fails if the committed file is stale. Every pull request that changes the API therefore shows the change as a schema diff, and the client's code generation reads a committed file.

### Bundling

12. **One ESM file per function.** `scripts/bundle.mjs` bundles each function from the manifest with esbuild, targeting the Node major in `.node-version`, dependencies included. The workflow uploads the result; Terraform owns the function (decision 0011).

## Held back

Majors not taken, each with the reason and what releases it. Checked 2026-10-16.

- **graphql 17.** Apollo Server 5 declares graphql `^16.11.0` as its peer dependency; Pothos accepts 16 or 17. Released when Apollo Server accepts 17.
- **Node 26.** Node 24 is the LTS line and 26 is Current. Released when 26 enters LTS, as rule 1 says.
- **TypeScript 7.** The latest tag; 5.9.3 is pinned. Released by a trial on a branch showing that Pothos, Vitest and the Angular tooling compile and test under it.

## Why

Latest with LTS preferred is the owner's standing policy for every tool and library, stated 2026-10-14: a project that exists to show current practice should run on current versions, and the cost of staying current in small steps is far below the cost of a large jump later. Exact pins and the lock file make the laptop and CI identical, which decision 0009 depends on. The install-script approval is npm's own control since 11.19; recording approvals in the repository turns a per-machine prompt into a reviewed decision. The manifest exists because the emulator and Terraform would otherwise each hold a copy of the same three routes and drift. Committing the printed schema is how a code-first project keeps schema-first's one real advantage, a reviewable contract.
