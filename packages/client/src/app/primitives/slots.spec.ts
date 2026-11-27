import { inputBinding } from '@angular/core';
import { render, screen } from '@testing-library/angular/zoneless';

import { Slots } from './slots';

describe('Slots', () => {
  it('is one picture, named for the count', async () => {
    await render(Slots, { bindings: [inputBinding('filled', () => 2), inputBinding('total', () => 4), inputBinding('of', () => 'heroes')] });
    expect(screen.getByRole('img', { name: '2 of 4 heroes' })).toBeInTheDocument();
  });
});
