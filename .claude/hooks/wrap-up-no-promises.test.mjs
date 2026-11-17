// What wrap-up-no-promises.mjs must refuse and what it must let through
// (docs/process/sessions.md, rule 11).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'wrap-up-no-promises.mjs');
const answer = (toolInput) => {
  const run = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: 'mcp__ccd_turn__wrap_up', tool_input: toolInput }),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  if (run.stdout === '') return 'none';
  return JSON.parse(run.stdout).hookSpecificOutput.permissionDecision;
};

describe('wrap-up-no-promises', () => {
  it('refuses a recap that promises content to come', () => {
    for (const recap of [
      'The checklist is below.',
      'The steps are listed below.',
      'See below for the plan.',
      'The pull request is open. Details below.',
      'The plan is as follows.',
      'The proposal is in the next message.',
      'I will write the checklist once you answer.',
    ]) {
      assert.equal(answer({ recap }), 'deny', recap);
    }
  });

  it('refuses a question that promises content to come', () => {
    assert.equal(answer({ recap: 'Done.', ask: 'Shall I use the list that follows?' }), 'deny');
    assert.equal(answer({ recap: 'Done.', ask: 'Which of the options below?' }), 'deny');
  });

  it('lets the same words through where they promise nothing', () => {
    for (const recap of [
      'The build stays below 750 kB.',
      'The fix follows decision 0033.',
      'The following checks pass: lint and the tests.',
      'The rule which follows decision 0033 is unchanged.',
      'The review is done and nothing was changed.',
    ]) {
      assert.equal(answer({ recap }), 'none', recap);
    }
  });

  it('reads a call with no recap', () => {
    assert.equal(answer({}), 'none');
  });
});
