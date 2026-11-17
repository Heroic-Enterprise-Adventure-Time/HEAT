// PreToolUse hook on mcp__ccd_turn__wrap_up, the desktop app's end-of-turn box
// (docs/process/sessions.md, rule 11). A wrap-up that carries a question ends
// the turn, so a recap or a question that promises content "below" promises
// nothing: twice a checklist was lost that way. This refuses the call when
// either holds such a promise; the reason goes back to the model, which then
// writes the content as the closing message. A backstop, not the rule.
//
// It matches the phrases of a promise, not the bare words: "is below", "see
// below", "as follows", "in the next message". A recap that says a bundle
// "stays below 750 kB" or that a fix "follows decision 0033" passes.
// `wrap-up-no-promises.test.mjs` holds both kinds.
import { readFileSync } from 'node:fs';

const promise = new RegExp(
  [
    String.raw`\b(?:see|is|are|listed|written|shown|given|detailed|appears?|comes?) (?:just |right |directly )?below\b`,
    String.raw`\bbelow\s*[.:?!]?\s*$`,
    String.raw`\bas follows\b`,
    String.raw`\b(?:that|which|what) follows?(?=\s*(?:[.,:;?!]|$|is\b|are\b))`,
    String.raw`\b(?:in|with) (?:the|my|a) next message\b`,
    String.raw`\bcoming up\b`,
    String.raw`\bwill (?:write|send|post|follow)\b`,
  ].join('|'),
  'i',
);

const input = JSON.parse(readFileSync(0, 'utf8'));
const fields = [input.tool_input?.recap, input.tool_input?.ask];
const match = fields
  .filter((field) => typeof field === 'string')
  .map((field) => promise.exec(field))
  .find((found) => found !== null);

if (match) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `wrap_up refused: the recap or ask says "${match[0].trim()}", a promise of content that a box with a question cannot be followed by. ` +
          'Call wrap_up with a recap of what is true now and no question, then write the content as the closing message, with any question in its prose.',
      },
    }),
  );
}
