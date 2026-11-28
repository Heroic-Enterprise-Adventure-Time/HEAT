# 0065: A dialog over the page's regions, and the result of an adventure in one

- **Status:** Decided; built by Issue-441.
- **Date:** 2026-11-28
- **Settles:** Issue-441: whether anything may stand over the page's regions, and where an adventure's result is shown. The owner's calls of 2026-11-28, in the issue and in its session.

## Decision

**A dialog may stand over the page's regions. The four regions still never overlap each other.** `docs/design/game.md`, "The page", said "four regions, and nothing overlaps"; a modal dialog overlaps by nature, and the owner accepted that. The header bar, the facility menu, the stage and the content area keep their places and never cover one another, at any width.

**A dialog is for what the page tells the player once and waits for them to put away.** An adventure's result is the first. It has a title, whatever its owner puts in it, and one button; Escape does what the button does, and a click outside it does nothing. A dialog is not a place the player goes to: it has no address, and what it shows is gone when it is put away. So it is not used for a panel's content, for a list, for a view the player comes back to or links to, or for a choice between two actions: those are panels and pages (`docs/standards/angular.md`, rule 8), and a confirmation stays in place beside what it confirms, as retiring a hero does.

**It is the browser's own modal `<dialog>`, opened with `showModal()`.** The browser keeps the focus inside it, makes the page behind it inert, closes it on Escape and draws it above everything else, with no code of the project's doing any of those. The component is `Dialog` in `packages/client/src/app/primitives/dialog.ts`, in the panel's frame over a scrim (`--surface-scrim`).

**An adventure's result is a dialog over the battle as it ended.** Its title is how the adventure ended: "Victory!", "Defeat!" or "Retreat!", and "Adventure lost" for one lost to a game update. It holds what came home and each hero's XP, counted up; what a full warehouse lost; each unlock the run earned that the player did not hold (decision 0059); a caravan's lines; and, where the player could not be read again after the submit, that note with "Read again". Its button, OK, goes to the camp the party left from and puts the result away. Behind it the stage keeps the battle's last frame and the content area the party as it ended, with nothing there usable.

**What was gained is counted up, briefly.** Each resource's amount and then each hero's XP counts from nothing to its whole, one after the other, about half a second each and three seconds at most for the block; a hero who gained a level is shown at the level it set out with until its XP is whole, then at its new level with a "Level up" mark that pops. OK works from the first frame: nothing waits for the count. A player who has asked their system for less motion sees every amount whole at once, and nothing moves. A screen reader is given each whole gain in words from the start and never the counting. The component is `Gains` in `primitives/gains.ts`, made to be used wherever something is won.

**The stages and the replay leave the result.** A result listed each stage's ending and offered "Watch the replay", which played the stored timeline in the same page. Both are on the replay's page, behind the job's "Replays" (decision 0050), and the result no longer repeats them.

## Considered and not chosen

- **The result in the content area, as it was.** It overlaps nothing. But the content area is a quarter of the window beside a battle that has ended, and on a stacked page it is below the scene, so the one thing the player waited for was the least prominent thing on the page.
- **A page of its own for the result.** An address for something shown once, which a reload could not show again, since the result is held by the page that submitted the run and not read back.
- **A panel drawn over the stage without the browser's dialog.** The focus trap, the inert page behind it and Escape would each be code of the project's, and each is where a hand-made modal fails a keyboard or a screen reader.
- **`@angular/cdk/dialog`.** It gives the same behaviour through an overlay of its own. The client has no CDK dependency, and the browser's element does all of it in every browser the game supports.
- **A replay button on the dialog.** The owner's call: the dialog says what was gained and goes back to the camp. A replay is one click from the job's page.
- **A "Count again" button.** It was in the sketch shown in the session, to show the motion. The owner did not want it on the result.
- **Titles in the words the lists of replays use,** "Job done", "The party turned back", "The party fell". The owner chose the shorter "Victory!", "Retreat!" and "Defeat!" for the dialog; the lists keep their phrases, which read in a line.
- **Waiting for the count before OK works.** It would make a player who plays the same job many times wait three seconds each time for numbers they can already see.

## Facts checked

- `HTMLDialogElement.showModal()` and the `::backdrop` pseudo-element are in every current browser, Baseline since March 2022 (MDN, "HTMLDialogElement: showModal() method", read 2026-11-28).
- jsdom 31.0.1, which the client's specs run in, has the `dialog` element and none of `showModal`, `close` or `requestClose`, and no `window.matchMedia`: checked by a script in the issue's worktree on 2026-11-28. So the component checks for the methods before calling them (`docs/standards/angular-detail.md`, "Rule 15"), and that Escape closes the dialog, that the focus stays inside it and that the page behind is inert were seen in a browser, not in a spec.

## Where it is described

`docs/design/game.md`, "The page"; `docs/standards/angular.md`, rules 14 and 23, and `docs/standards/angular-detail.md`, "Rule 17" and "Rule 23"; `packages/client/src/app/primitives/dialog.ts`, `gains.ts` and `count-up.ts`; `packages/client/src/app/adventure/adventure.ts`.
