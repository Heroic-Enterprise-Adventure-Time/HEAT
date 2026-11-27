import { screen } from '@testing-library/angular/zoneless';

import { routes } from '../app.routes';
import { fakeIcons } from '../testing/fake-icons';
import { renderAt } from '../testing/render-at';

describe('the gallery', () => {
  it('opens without sign-in and shows every primitive', async () => {
    const { user } = await renderAt('/gallery', routes, [fakeIcons]);
    expect(await screen.findByRole('heading', { name: 'Gallery' })).toBeInTheDocument();
    for (const name of ['Buttons', 'Action icons', 'Panel frame', 'Resource chips', 'Slot circles', 'Hero tiles', 'Beside the scene']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'primary, disabled' })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Depart' })).toHaveLength(2);
    const bram = screen.getByRole('button', { name: /Bram/ });
    expect(bram).toHaveAttribute('aria-pressed', 'false');
    await user.click(bram);
    expect(bram).toHaveAttribute('aria-pressed', 'true');
  });
});
