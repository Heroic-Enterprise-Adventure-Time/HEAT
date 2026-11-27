import { inputBinding, outputBinding } from '@angular/core';
import { provideRouter } from '@angular/router';
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

  it('is named by its hero alone and described by its unit type and level, so a hero is found by name', async () => {
    await render(HeroTile, { providers: [fakeIcons], bindings: [inputBinding('hero', () => wren)] });
    const tile = screen.getByRole('button', { name: 'Wren' });
    expect(tile).toHaveAccessibleDescription('ranger, level 3');
  });

  it('cannot be pressed while disabled, as a hero beyond a full party', async () => {
    const user = userEvent.setup();
    const toggled = vi.fn();
    await render(HeroTile, { providers: [fakeIcons], bindings: [inputBinding('hero', () => wren), inputBinding('disabled', () => true), outputBinding('toggled', toggled)] });
    const tile = screen.getByRole('button', { name: 'Wren' });
    expect(tile).toBeDisabled();
    await user.click(tile);
    expect(toggled).not.toHaveBeenCalled();
  });

  it('is a link to its hero when given one, and no toggle', async () => {
    await render(HeroTile, { providers: [fakeIcons, provideRouter([])], bindings: [inputBinding('hero', () => wren), inputBinding('link', () => '/camp/millbrook/heroes-hall/heroes/h1')] });
    const link = screen.getByRole('link', { name: 'Wren' });
    expect(link).toHaveAttribute('href', '/camp/millbrook/heroes-hall/heroes/h1');
    expect(link).toHaveAccessibleDescription('ranger, level 3');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is no control when still, as a hero on its way, and still shows its hero', async () => {
    await render(HeroTile, { providers: [fakeIcons], bindings: [inputBinding('hero', () => wren), inputBinding('still', () => true)] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Wren')).toBeInTheDocument();
    expect(screen.getByText('ranger, level 3')).toBeInTheDocument();
  });

  it('is no control for an empty slot', async () => {
    await render(HeroTile, { providers: [fakeIcons], bindings: [inputBinding('hero', () => null)] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Empty slot')).toBeInTheDocument();
  });
});
