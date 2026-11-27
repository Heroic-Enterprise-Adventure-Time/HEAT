import { screen, within } from '@testing-library/angular/zoneless';

import { must } from '@heat/engine';

import { routes } from '../app.routes';
import { fakeIcons } from '../testing/fake-icons';
import { renderAt } from '../testing/render-at';

describe('the gallery', () => {
  it('opens without sign-in and shows every primitive', async () => {
    const { user } = await renderAt('/gallery', routes, [fakeIcons]);
    expect(await screen.findByRole('heading', { name: 'Gallery' })).toBeInTheDocument();
    for (const name of ['Buttons', 'Action icons', 'Panel frame', 'Resource chips', 'Slot circles', 'Hero tiles', 'Back links and the more menu', 'Beside the scene']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'primary, disabled' })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Depart' })).toHaveLength(2);
    const [bram, beyond] = screen.getAllByRole('button', { name: 'Bram' });
    expect(bram).toHaveAttribute('aria-pressed', 'false');
    await user.click(must(bram, 'the first Bram'));
    expect(bram).toHaveAttribute('aria-pressed', 'true');
    expect(beyond).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Wren' })).toHaveAttribute('href', '/gallery');
    expect(screen.getByRole('link', { name: 'Back to Gallery' })).toHaveAttribute('href', '/gallery');
    const ways = within(screen.getByRole('region', { name: 'Back links and the more menu' }));
    await user.click(ways.getByRole('button', { name: 'More' }));
    expect(ways.getByRole('link', { name: 'Recently here' })).toBeInTheDocument();
  });
});
