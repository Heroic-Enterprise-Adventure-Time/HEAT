// PreToolUse hook for Bash and mcp__terminal__run_in_terminal: answers "allow"
// for the repository's own npm scripts in an issue's worktree, so they run
// without a prompt (decision 0054; docs/process/sessions.md, rule 9). It never
// answers anything else: what it does not recognize falls through to the
// normal permission flow by printing nothing.
//
// It is a convenience, not a boundary. `npm test` runs whatever the branch
// holds, and the agent writes the branch; what bounds an agent is in decision
// 0054. What this file keeps out is everything that is not one of the
// repository's scripts.
//
// A command qualifies when every segment of it, split on `;`, `&&` and line
// ends, is one of:
// - a `cd` into a worktree of this repository (`builtin cd "<path>"`);
// - `npm test`, `npm ci`, `npm start` or `npm run <script>`, with no option
//   but `--workspace <name>`, `-w <name>`, `--workspaces` and `--if-present`,
//   then optionally `--` and the script's own arguments; optionally with
//   `2>&1` or a redirection to /dev/null; optionally piped into tail, head,
//   grep, wc, cut or tr, which read and do not write;
// - `echo ...` with no command substitution and no redirection, which sessions
//   use as a marker between steps.
// Not allowed: `npx`, which runs code the repository does not hold; any other
// npm option, because `--script-shell`, `--prefix` and `--registry` change
// what runs or where it comes from; sed, sort and uniq, which can run a
// command or write a file.
//
// A worktree of this repository is `<checkout>-<issue>`, beside the checkout,
// or `<checkout>/.claude/worktrees/<name>`, where the checkout is found from
// this file's own place in it. The directory a command runs in is the terminal
// tool's `cwd`, the session's `cwd` for Bash, or a `cd` segment of the command.
// A terminal call that names no directory is not taken to be in a worktree.
//
// The splitting below is our own and not a library's (docs/standards/
// typescript.md, rule 17): a hook runs before `npm ci`, in a checkout that may
// have no node_modules, so it can import nothing but Node's own modules. It
// refuses what it cannot read, which is the safe side for a hook that can only
// answer "allow". `allow-npm-in-worktree.test.mjs` holds the commands it must
// allow and the ones it must refuse.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const normalize = (path) =>
  String(path)
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\/([a-z])\//i, '$1:/')
    .replace(/\/+$/, '')
    .toLowerCase();

// This file is <root>/.claude/hooks/<name>; the root is the checkout, or a
// worktree of it when the session started in one.
const root = normalize(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const checkouts = [
  root,
  root.replace(/\/\.claude\/worktrees\/[^/]+$/, ''),
  root.replace(/-\d+$/, ''),
];
const suffix = /^(-\d+|\/\.claude\/worktrees\/[a-z0-9._-]+)$/;
const isWorktree = (path) => {
  if (path === undefined || path === null) return false;
  const candidate = normalize(path);
  return checkouts.some(
    (checkout) => candidate.startsWith(checkout) && suffix.test(candidate.slice(checkout.length)),
  );
};

const filter = /^(tail|head|grep|wc|cut|tr)\b[^|;&<>`$()]*$/;
const redirect = /\s(2>&1|(?:2|1)?>\s*\/dev\/null)(?=\s|$)/g;
const stripRedirects = (text) => text.replace(redirect, ' ').trim();
const scriptName = /^[\w:.-]+$/;
const workspaceName = /^[@\w./-]+$/;

// `npm test|ci|start` or `npm run <script>`, then only the workspace options,
// then optionally `--` and whatever the script takes.
const isNpmScript = (text) => {
  if (/[`$()<>&]/.test(text)) return false;
  const [npm, subcommand, ...rest] = text.split(/\s+/);
  if (npm !== 'npm') return false;
  if (subcommand === 'run') {
    const script = rest.shift();
    if (script === undefined || !scriptName.test(script)) return false;
  } else if (!['test', 'ci', 'start'].includes(subcommand)) {
    return false;
  }
  while (rest.length > 0) {
    const option = rest.shift();
    if (option === '--') return true;
    if (option === '--workspaces' || option === '--if-present') continue;
    if (option === '--workspace' || option === '-w') {
      const name = rest.shift();
      if (name === undefined || !workspaceName.test(name)) return false;
      continue;
    }
    if (option.startsWith('--workspace=') && workspaceName.test(option.slice(12))) continue;
    return false;
  }
  return true;
};

const allows = (input) => {
  const tool = String(input.tool_name ?? '');
  const toolInput = input.tool_input ?? {};
  const command = String(toolInput.command ?? '').trim();
  if (command === '') return false;

  let inWorktree;
  if (tool === 'mcp__terminal__run_in_terminal') {
    inWorktree = isWorktree(toolInput.cwd);
  } else if (tool === 'Bash') {
    inWorktree = isWorktree(input.cwd);
  } else {
    return false;
  }

  const segments = command.split(/\s*(?:;|&&|\r?\n)\s*/).filter((segment) => segment.length > 0);
  for (const segment of segments) {
    const cd = /^(?:builtin\s+)?cd\s+(.+)$/.exec(segment);
    if (cd) {
      if (!isWorktree(cd[1])) return false;
      inWorktree = true;
      continue;
    }
    if (/^echo\b(?!.*(?:\$\(|`))[^|;&<>]*$/.test(segment)) continue;
    const [first, ...piped] = segment.split(/\s*\|\s*/);
    if (!isNpmScript(stripRedirects(` ${first}`))) return false;
    if (!piped.every((part) => filter.test(stripRedirects(` ${part}`)))) return false;
  }
  return inWorktree;
};

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  input = undefined;
}

if (input !== undefined && allows(input)) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: "The repository's npm scripts in an issue's worktree (decision 0054)",
      },
    }),
  );
}
