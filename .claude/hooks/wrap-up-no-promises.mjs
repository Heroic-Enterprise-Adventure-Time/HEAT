// PreToolUse hook on mcp__ccd_turn__wrap_up, the desktop app's end-of-turn box
// (docs/process/sessions.md, rule 11). A wrap-up that carries a question ends
// the turn, so a recap or a question that promises content "below" promises
// nothing: twice a checklist was lost that way. This refuses the call when
// either holds a promise word; the reason goes back to the model, which then
// writes the content first. A backstop, not the rule.
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const text = `${input.tool_input?.recap ?? ''} ${input.tool_input?.ask ?? ''}`;
const promise =
  /\b(below|follows|following|as follows|next message|coming up|will (write|send|post|follow))\b/i;
const match = promise.exec(text);

if (match) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `wrap_up refused: the recap or ask says "${match[0]}", a promise of content that a box with a question cannot be followed by. ` +
          'Call wrap_up with a recap of what is true now and no question, then write the content as the closing message, with any question in its prose.',
      },
    }),
  );
}
