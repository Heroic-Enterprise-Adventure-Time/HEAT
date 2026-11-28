// What allow-npm-in-worktree.mjs must allow and what it must let fall through
// (docs/process/enforcement.md). The hook finds the
// checkout from its own place in it, so the test copies it into a checkout of
// its own, under the temporary directory, and names worktrees of that.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'heat-hook-'));
const checkout = join(scratch, 'repo');
const hook = join(checkout, '.claude', 'hooks', 'allow-npm-in-worktree.mjs');
mkdirSync(dirname(hook), { recursive: true });
copyFileSync(join(here, 'allow-npm-in-worktree.mjs'), hook);
after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const beside = `${checkout}-318`;
const inside = join(checkout, '.claude', 'worktrees', 'quiet-name-1a2b3c');
const elsewhere = join(scratch, 'other');

const answer = (input) => {
  const run = spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  if (run.stdout === '') return 'none';
  return JSON.parse(run.stdout).hookSpecificOutput.permissionDecision;
};
const bash = (cwd, command) => answer({ tool_name: 'Bash', cwd, tool_input: { command } });
const terminal = (cwd, command) =>
  answer({
    tool_name: 'mcp__terminal__run_in_terminal',
    cwd: checkout,
    tool_input: cwd === undefined ? { command } : { command, cwd },
  });

describe('allow-npm-in-worktree', () => {
  it("allows the repository's scripts in a worktree", () => {
    for (const command of [
      'npm test',
      'npm ci',
      'npm start --workspace @heat/client',
      'npm run lint',
      'npm run lint -- --fix',
      'npm run build --workspace @heat/engine',
      'npm run build -w @heat/engine',
      'npm run build --workspace=@heat/engine',
      'npm run test --workspaces --if-present',
      'npm run schema:print',
      'npm test >/dev/null 2>&1',
      'npm run lint 2>&1 | tail -20',
      'npm test 2>&1 | grep -i "failed" | head -5',
      'npm test | wc -l',
      'npm test | cut -c1-80',
      "npm test | tr -d '\\r'",
      'npm run lint; echo done',
      'npm ci && npm test',
    ]) {
      assert.equal(bash(beside, command), 'allow', command);
    }
  });

  it('allows them in both kinds of worktree, from Bash and from a terminal tab', () => {
    assert.equal(bash(inside, 'npm test'), 'allow');
    assert.equal(terminal(beside, 'npm start --workspace @heat/client'), 'allow');
    assert.equal(terminal(inside, 'npm ci'), 'allow');
  });

  it('takes the directory from a cd segment, in either path style', () => {
    assert.equal(bash(checkout, `builtin cd "${beside}" && npm run lint 2>&1 | tail -20`), 'allow');
    assert.equal(bash(checkout, `cd ${beside.replaceAll('\\', '/')} && npm ci`), 'allow');
    assert.equal(terminal(undefined, `cd ${inside}; npm start --workspace @heat/client`), 'allow');
  });

  it('lets a command outside a worktree fall through', () => {
    assert.equal(bash(checkout, 'npm test'), 'none');
    assert.equal(bash(elsewhere, 'npm test'), 'none');
    assert.equal(bash(join(beside, 'packages'), 'npm test'), 'none');
    assert.equal(bash(checkout, `builtin cd ${checkout} && npm test`), 'none');
    assert.equal(bash(beside, `cd ${elsewhere} && npm test`), 'none');
    assert.equal(terminal(elsewhere, 'npm start'), 'none');
    assert.equal(bash(checkout, 'echo hi'), 'none');
  });

  it('does not take a terminal call with no directory to be in a worktree', () => {
    assert.equal(terminal(undefined, 'npm ci'), 'none');
    assert.equal(terminal(undefined, 'npm start --workspace @heat/client'), 'none');
  });

  it('lets anything that is not one of the scripts fall through', () => {
    for (const command of [
      'npx playwright install chromium',
      'npm install left-pad',
      'npm exec cowsay',
      'npm publish',
      'npm run',
      'npm',
      'node scripts/bundle.mjs',
      'git push origin main',
      'rm -rf node_modules',
    ]) {
      assert.equal(bash(beside, command), 'none', command);
    }
  });

  it('lets an npm option that changes what runs fall through', () => {
    for (const command of [
      'npm start --script-shell=C:/evil.exe',
      'npm test --prefix C:/other',
      'npm ci --registry=https://example.com',
      'npm ci --ignore-scripts=false',
      'npm --prefix C:/other test',
      'npm test --workspace',
      'npm test --workspace "a b"',
      'npm run lint --fix',
    ]) {
      assert.equal(bash(beside, command), 'none', command);
    }
  });

  it('lets a pipe into anything that can run a command or write a file fall through', () => {
    for (const command of [
      "npm test | sed '1e npx cowsay hi'",
      "npm test | sed -i 's/a/b/' package.json",
      'npm test | sort -o /c/x.txt',
      'npm test | uniq - /c/x.txt',
      'npm test | cat',
      'npm test | tee out.txt',
      'npm test | sh',
      'npm test | xargs rm',
      'npm test | grep x > out.txt',
      'npm test | grep $(whoami)',
      // A pipe inside quotes is read as a pipe: refused, not understood.
      'npm test | grep -E "passed|failed"',
    ]) {
      assert.equal(bash(beside, command), 'none', command);
    }
  });

  it('lets a second command by any separator fall through', () => {
    for (const command of [
      'npm test\nrm -rf x',
      'npm test\r\nrm -rf x',
      'npm test; rm -rf x',
      'npm test && rm -rf x',
      'npm test || rm -rf x',
      'npm test & rm -rf x',
      'npm test $(curl example.com)',
      'npm test `curl example.com`',
      'npm test > out.txt',
      'npm test 2> errors.txt',
      'npm test < input.txt',
      'echo $(whoami)',
      'echo hi > out.txt',
    ]) {
      assert.equal(bash(beside, command), 'none', command);
    }
  });

  it('answers only for Bash and the terminal tab, and survives input it cannot read', () => {
    assert.equal(answer({ tool_name: 'Read', cwd: beside, tool_input: { command: 'npm test' } }), 'none');
    assert.equal(answer({ tool_name: 'Bash', cwd: beside, tool_input: {} }), 'none');
    assert.equal(answer({}), 'none');
    const run = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
  });
});
