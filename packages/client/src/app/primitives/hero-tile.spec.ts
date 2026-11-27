import { inputBinding, outputBinding } from '@angular/core';
import { render, screen, within } from '@testing-library/angular/zoneless';
import userEvent from '@testing-library/user-event';

import { fakeIcons } from '../testing/fake-icons';
import { HeroTile } from './hero-tile';

describe('HeroTile', () => {
  const wren = { name: 'Wren', unitType: 'ranger', level: 3, spriteSet: 'ranger-01' } as const;

  it('is a toggle, pressed while its hero is picked', async () => {
    const user = userEvent.setup();
    const toggled = vi.fn();
    await render(HeroTile, { providers: [fakeIcons], bindings: [inputBinding('hero', () => wren), inputBinding('picked', () => true), outputBinding('toggled', toggled)] });
    const tile = screen.getByRole('button', { name: /Wren/ });
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(tile).toHaveTextContent('ranger, level 3');
    await user.click(tile);
    expect(toggled).toHaveBeenCalledOnce();
  });

  it('is not pressed while its hero is not picked', async () => {
    await render(HeroTile, { providers: [fakeIcons], bindings: [inputBinding('hero', () => wren)] });
    expect(screen.getByRole('button', { name: /Wren/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the portrait of its hero, from its sprite set, beside its name', async () => {
    await render(HeroTile, { providers: [fakeIcons], bindings: [inputBinding('hero', () => wren)] });
    const tile = screen.getByRole('button', { name: /Wren/ });
    const portrait = within(tile).getByRole('presentation');
    expect(portrait).toHaveAttribute('src', '/art/portraits/ranger-01.test.png');
  });

  it('is no control for an empty slot', async () => {
    await render(HeroTile, { providers: [fakeIcons], bindings: [inputBinding('hero', () => null)] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Empty slot')).toBeInTheDocument();
  });
});
