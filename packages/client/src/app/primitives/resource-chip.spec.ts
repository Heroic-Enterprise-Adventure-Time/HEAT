import { inputBinding } from '@angular/core';
import { render, screen } from '@testing-library/angular/zoneless';

import { Icons } from '../icons';
import { fakeIcons } from '../testing/fake-icons';
import { ResourceChip } from './resource-chip';

describe('ResourceChip', () => {
  it("shows a resource's icon, named for the resource, and its amount", async () => {
    await render(ResourceChip, { bindings: [inputBinding('material', () => 'timber'), inputBinding('amount', () => 40)], providers: [fakeIcons] });
    expect(screen.getByRole('img', { name: 'timber' })).toHaveAttribute('src', '/art/icons/timber.test.png');
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('is short when the camp has less than the cost, and says so beyond its colour', async () => {
    await render(ResourceChip, { bindings: [inputBinding('material', () => 'timber'), inputBinding('amount', () => 40), inputBinding('have', () => 12)], providers: [fakeIcons] });
    expect(screen.getByText(', more than the camp has')).toBeInTheDocument();
  });

  it('is not short when the camp has enough', async () => {
    await render(ResourceChip, { bindings: [inputBinding('material', () => 'timber'), inputBinding('amount', () => 40), inputBinding('have', () => 40)], providers: [fakeIcons] });
    expect(screen.queryByText(', more than the camp has')).not.toBeInTheDocument();
  });

  it('shows the name in place of an icon the index does not hold', async () => {
    await render(ResourceChip, { bindings: [inputBinding('material', () => 'cloth'), inputBinding('amount', () => 3)], providers: [{ provide: Icons, useValue: { src: () => null } }] });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('cloth')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
