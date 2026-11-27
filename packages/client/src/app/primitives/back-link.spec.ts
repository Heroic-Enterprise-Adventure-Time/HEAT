import { inputBinding } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular/zoneless';

import { fakeIcons } from '../testing/fake-icons';
import { BackLink } from './back-link';

describe('BackLink', () => {
  it('is a link back, named for where it goes after "Back to", with the back icon', async () => {
    await render(BackLink, { providers: [fakeIcons, provideRouter([])], bindings: [inputBinding('to', () => '/camp/millbrook/heroes-hall'), inputBinding('label', () => 'Heroes hall')] });
    const link = screen.getByRole('link', { name: 'Back to Heroes hall' });
    expect(link).toHaveAttribute('href', '/camp/millbrook/heroes-hall');
    expect(within(link).getByRole('presentation')).toHaveAttribute('src', '/art/icons/back.test.png');
  });

  it('is the close icon as the way out of a view over the camp, named the same way', async () => {
    await render(BackLink, { providers: [fakeIcons, provideRouter([])], bindings: [inputBinding('to', () => '/camp/millbrook'), inputBinding('label', () => 'Millbrook'), inputBinding('kind', () => 'close')] });
    const link = screen.getByRole('link', { name: 'Back to Millbrook' });
    expect(link).toHaveAttribute('href', '/camp/millbrook');
    expect(within(link).getByRole('presentation')).toHaveAttribute('src', '/art/icons/close.test.png');
  });
});
