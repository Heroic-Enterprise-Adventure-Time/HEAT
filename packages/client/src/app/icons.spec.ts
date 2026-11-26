import { Icons } from './icons';

const names = { timber: 'timber.0123456789ab.png', mine: 'mine.ba9876543210.png' };

/** A fetch that answers every request with the body and the status. */
const answering = (body: unknown, status = 200): typeof fetch => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('Icons', () => {
  it('has no icon before its index is in, and each one after', async () => {
    const icons = new Icons();
    expect(icons.src('mine')).toBeNull();
    await icons.load(answering(names));
    expect(icons.src('mine')).toBe('/art/icons/mine.ba9876543210.png');
    expect(icons.error()).toBeNull();
  });

  it('records a failure instead of throwing, and has no icons', async () => {
    const icons = new Icons();
    await icons.load(answering(names));
    await icons.load(answering({}, 404));
    expect(icons.src('mine')).toBeNull();
    expect(icons.error()).toBe('GET /art/icons/pictures.json answered 404');
  });
});
