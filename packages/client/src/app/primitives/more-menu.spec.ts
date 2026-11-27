import { inputBinding } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular/zoneless';
import userEvent from '@testing-library/user-event';

import { fakeIcons } from '../testing/fake-icons';
import { MoreMenu } from './more-menu';

describe('MoreMenu', () => {
  async function renderMenu() {
    const user = userEvent.setup();
    await render(MoreMenu, {
      providers: [fakeIcons, provideRouter([])],
      bindings: [inputBinding('items', () => [{ label: 'Recently here', to: '/camp/millbrook/job-board/recent' }])],
    });
    return { user, button: screen.getByRole('button', { name: 'More' }) };
  }

  it('is a closed disclosure at first, showing the more icon and none of its links', async () => {
    const { button } = await renderMenu();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(within(button).getByRole('presentation')).toHaveAttribute('src', '/art/icons/more.test.png');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('opens on its button to the links it holds, showing the close icon, and closes on it again', async () => {
    const { button, user } = await renderMenu();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(button).getByRole('presentation')).toHaveAttribute('src', '/art/icons/close.test.png');
    // The button controls the list it opens.
    const id = button.getAttribute('aria-controls') ?? '';
    expect(screen.getByRole('list')).toHaveAttribute('id', id);
    expect(screen.getByRole('link', { name: 'Recently here' })).toHaveAttribute('href', '/camp/millbrook/job-board/recent');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('closes on Escape from one of its links, giving its button back the focus', async () => {
    const { button, user } = await renderMenu();
    await user.click(button);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Recently here' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });
});
