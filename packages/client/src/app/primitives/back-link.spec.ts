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
});
