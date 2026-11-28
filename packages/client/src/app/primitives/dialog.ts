import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

/** Numbers each dialog's title, unique on the page. */
let dialogs = 0;

/**
 * A dialog (decision 0065; game.md, "The page"): what the page tells the
 * player over its regions and waits for them to put away, such as an
 * adventure's result. It is the browser's own modal `<dialog>`, opened with
 * `showModal()`, so the browser keeps the focus inside it, makes the page
 * behind it inert and closes it on Escape; it stands in the panel's frame,
 * over a scrim, with its heading, whatever its owner projects into it, and
 * one button, which is where the focus starts.
 *
 * It opens when it is put in the page: its owner renders it when there is
 * something to say and acts on `closed`, which is told once each time the
 * dialog is closed, by its button or by Escape. Nothing else closes it: a
 * click on the scrim does not. An owner that could not act on the closing,
 * a page that could not go where the button leads, shows it again with
 * `show()`, so that a closed dialog is never left in a page that waits
 * for it (the review of PR-443).
 */
@Component({
  selector: 'heat-dialog',
  templateUrl: './dialog.html',
  styleUrl: './dialog.css',
})
export class Dialog {
  /** What the dialog is about, its title and its accessible name. It is not named `title`, which bound statically would stay on the host element as its tooltip (PR-392's review). */
  readonly heading = input.required<string>();
  /** The word on the one button. */
  readonly action = input('OK');
  /** The player put the dialog away. */
  readonly closed = output();
  protected readonly headingId = `dialog-${++dialogs}-heading`;
  private readonly box = viewChild.required<ElementRef<HTMLDialogElement>>('box');
  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');

  constructor() {
    afterNextRender(() => { this.show(); });
  }

  /** Shows the dialog, modal, with the focus on its button: when it is first in the page, and again for an owner that could not act on its closing. It does nothing to a dialog that is open, or that has left the page. */
  show(): void {
    const box = this.box().nativeElement;
    if (!box.isConnected || box.open) return;
    // jsdom, where the specs run, has the element but not its methods, though the DOM types say every dialog has them: there it is shown open, and not modal.
    if (typeof box.showModal === 'function') box.showModal();
    else box.setAttribute('open', '');
    // The browser would start at the first control inside, which may be one of the content's.
    this.button().nativeElement.focus();
  }

  /** Closes the dialog, which tells `closed` through the element's own `close` event, as Escape does. */
  protected close(): void {
    const box = this.box().nativeElement;
    // jsdom again: with no `close()` there is no event to wait for, so the dialog is closed and its owner told here.
    if (typeof box.close === 'function') box.close();
    else {
      box.removeAttribute('open');
      this.closed.emit();
    }
  }
}
