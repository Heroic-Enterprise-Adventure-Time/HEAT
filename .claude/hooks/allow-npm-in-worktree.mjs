// PreToolUse hook for Bash and mcp__terminal__run_in_terminal: allows the
// repository's own npm scripts in an issue's worktree without a prompt (the
// owner's standing rule, 2026-10-23; docs/process/sessions.md, rule 9). It only
// ever answers "allow"; anything it does not recognize falls through to the
// normal permission flow by printing nothing.
//
// A command qualifies when every segment of it, split on `;`, `&&` and line
// ends, is one of:
// - a `cd` into a worktree of this repository (`builtin cd "<path>"`);
// - `npm run ...`, `npm test ...`, `npm ci ...` or `npm start ...`, optionally
//   with `2>&1` or a redirection to /dev/null, and piped into read-only text
//   filters (tail, head, grep, sed, sort, uniq, wc, cat, tr, cut);
// - `echo ...` with no command substitution.
// `npx` is not allowed: it runs code the repository does not hold.
//
// A worktree of this repository is `<checkout>-<issue>`, beside the checkout,
// or `<checkout>/.claude/worktrees/<name>`, where the checkout is found from
// this file's own place in it. The directory a command runs in is the terminal
// tool's `cwd`, the session's `cwd` for Bash, or a `cd` segment of the command;
// a terminal tab used again carries no `cwd` and is taken to be where it was
// opened.
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

const npm = /^npm\s+(run|test|ci|start)(\s|$)/;
const filter = /^(tail|head|grep|sed|sort|uniq|wc|cat|tr|cut)\b[^|;&<>`$()]*$/;
const redirect = /\s(2>&1|(?:2|1)?>\s*\/dev\/null)(?=\s|$)/g;
const stripRedirects = (text) => text.replace(redirect, ' ').trim();

const allows = (input) => {
  const tool = String(input.tool_name ?? '');
  const toolInput = input.tool_input ?? {};
  const command = String(toolInput.command ?? '').trim();
  if (command === '') return false;

  let inWorktree;
  if (tool === 'mcp__terminal__run_in_terminal') {
    inWorktree = toolInput.cwd === undefined || isWorktree(toolInput.cwd);
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
    const main = stripRedirects(` ${first}`);
    if (!npm.test(main) || /[`$()<>&]/.test(main)) return false;
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
        permissionDecisionReason: "The repository's npm scripts in an issue's worktree (standing rule)",
      },
    }),
  );
}
