import { inputBinding } from '@angular/core';
import { render, screen } from '@testing-library/angular/zoneless';

import { Icons } from '../icons';
import { fakeIcons } from '../testing/fake-icons';
import { Icon } from './icon';

describe('Icon', () => {
  it('draws the named icon as decoration, since the word beside it names the control', async () => {
    await render(Icon, { providers: [fakeIcons], bindings: [inputBinding('name', () => 'depart')] });
    expect(screen.getByRole('presentation')).toHaveAttribute('src', '/art/icons/depart.test.png');
  });

  it('draws nothing for an icon the index does not hold', async () => {
    await render(Icon, { providers: [{ provide: Icons, useValue: { src: () => null } }], bindings: [inputBinding('name', () => 'depart')] });
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
  });
});
