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
 * It is open for as long as it is in the page: its owner renders it when
 * there is something to say and takes it out on `closed`, which is told
 * once, however the dialog was closed, by its button or by Escape. Nothing
 * else closes it: a click on the scrim does not.
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
    afterNextRender(() => {
      const box = this.box().nativeElement;
      // jsdom, where the specs run, has the element but not its methods, though the DOM types say every dialog has them: there it is shown open, and not modal.
      if (typeof box.showModal === 'function') box.showModal();
      else box.setAttribute('open', '');
      // The browser would start at the first control inside, which may be one of the content's.
      this.button().nativeElement.focus();
    });
  }

  /** Closes the dialog, which tells `closed` through the element's own `close` event, as Escape does. */
  protected close(): void {
    const box = this.box().nativeElement;
    // jsdom again: with no `close()` there is no event to wait for.
    if (typeof box.close === 'function') box.close();
    else this.closed.emit();
  }
}
