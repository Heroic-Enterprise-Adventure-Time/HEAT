import { inputBinding, outputBinding } from '@angular/core';
import { render, screen } from '@testing-library/angular/zoneless';
import userEvent from '@testing-library/user-event';

import { routes } from '../app.routes';
import { Icons } from '../icons';
import { fakeIcons } from '../testing/fake-icons';
import { renderAt } from '../testing/render-at';
import { HeroTile } from './hero-tile';
import { ResourceChip } from './resource-chip';

describe('ResourceChip', () => {
  it("shows a resource's icon, named for the resource, and its amount", async () => {
    await render(ResourceChip, { bindings: [inputBinding('material', () => 'timber'), inputBinding('amount', () => 40)], providers: [fakeIcons] });
    expect(screen.getByRole('img', { name: 'timber' })).toHaveAttribute('src', '/art/icons/timber.test.png');
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('shows the name in place of an icon the index does not hold', async () => {
    await render(ResourceChip, { bindings: [inputBinding('material', () => 'cloth'), inputBinding('amount', () => 3)], providers: [{ provide: Icons, useValue: { src: () => null } }] });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('cloth')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('HeroTile', () => {
  const wren = { name: 'Wren', unitType: 'ranger', level: 3 } as const;

  it('is a toggle, pressed while its hero is picked', async () => {
    const user = userEvent.setup();
    const toggled = vi.fn();
    await render(HeroTile, { bindings: [inputBinding('hero', () => wren), inputBinding('picked', () => true), outputBinding('toggled', toggled)] });
    const tile = screen.getByRole('button', { name: /Wren/ });
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(tile).toHaveTextContent('ranger, level 3');
    await user.click(tile);
    expect(toggled).toHaveBeenCalledOnce();
  });

  it('is not pressed while its hero is not picked', async () => {
    await render(HeroTile, { bindings: [inputBinding('hero', () => wren)] });
    expect(screen.getByRole('button', { name: /Wren/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is no control for an empty slot', async () => {
    await render(HeroTile, { bindings: [inputBinding('hero', () => null)] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Empty slot')).toBeInTheDocument();
  });
});

describe('the gallery', () => {
  it('opens without sign-in and shows every primitive', async () => {
    const { user } = await renderAt('/gallery', routes, [fakeIcons]);
    expect(await screen.findByRole('heading', { name: 'Gallery' })).toBeInTheDocument();
    for (const name of ['Buttons', 'Panel frame', 'Resource chips', 'Hero tiles', 'Beside the scene']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'primary, disabled' })[0]).toBeDisabled();
    const bram = screen.getByRole('button', { name: /Bram/ });
    expect(bram).toHaveAttribute('aria-pressed', 'false');
    await user.click(bram);
    expect(bram).toHaveAttribute('aria-pressed', 'true');
  });
});
