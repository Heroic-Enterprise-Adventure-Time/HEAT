import { fireEvent, render, screen, within } from '@testing-library/angular/zoneless';
import userEvent from '@testing-library/user-event';

import { Dialog } from './dialog';

/**
 * jsdom has the dialog element and none of its behaviour (angular-detail.md,
 * "Rule 15"): no `showModal`, no `close`, no Escape. So these say what the
 * component does around the browser, and that Escape closes the dialog,
 * that the focus stays inside it and that the page behind it is inert are
 * the browser's, seen on a stack.
 */
describe('Dialog', () => {
  async function renderDialog(action = '') {
    const closed = vi.fn();
    await render(`<heat-dialog heading="Victory!" ${action} (closed)="closed()"><p>What came home.</p></heat-dialog>`, { imports: [Dialog], wrapperProperties: { closed } });
    return { closed };
  }

  it('is a dialog named by its heading, which holds what its owner put in it, with the focus on its one button', async () => {
    await renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Victory!' });
    expect(within(dialog).getByRole('heading', { name: 'Victory!', level: 2 })).toBeInTheDocument();
    expect(within(dialog).getByText('What came home.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'OK' })).toHaveFocus();
  });

  it('says another word on its button when given one', async () => {
    await renderDialog('action="Onward"');
    expect(screen.getByRole('button', { name: 'Onward' })).toBeInTheDocument();
  });

  it('tells its owner once when its button is pressed', async () => {
    const user = userEvent.setup();
    const { closed } = await renderDialog();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(closed).toHaveBeenCalledOnce();
  });

  it('tells its owner when the browser closes it, as Escape does', async () => {
    const { closed } = await renderDialog();
    // No key reaches a close in jsdom, so the element's own event stands for the browser's Escape.
    fireEvent(screen.getByRole('dialog'), new Event('close'));
    expect(closed).toHaveBeenCalledOnce();
  });
});
