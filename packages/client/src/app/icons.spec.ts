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

  it('has the portrait of each hero from the index of the portraits, by sprite set', async () => {
    const icons = new Icons();
    const portraits = { 'ranger-01': 'ranger-01.0123456789ab.png' };
    const fetchFn: typeof fetch = (input) => Promise.resolve(new Response(JSON.stringify((input instanceof Request ? input.url : input.toString()).startsWith('/art/portraits/') ? portraits : names), { status: 200 }));
    expect(icons.portrait('ranger-01')).toBeNull();
    await icons.load(fetchFn);
    expect(icons.portrait('ranger-01')).toBe('/art/portraits/ranger-01.0123456789ab.png');
    expect(icons.portrait('knight-06')).toBeNull();
  });

  it('records a failure instead of throwing, and has no icons', async () => {
    const icons = new Icons();
    await icons.load(answering(names));
    await icons.load(answering({}, 404));
    expect(icons.src('mine')).toBeNull();
    expect(icons.portrait('mine')).toBeNull();
    expect(icons.error()).toBe('GET /art/icons/pictures.json answered 404');
  });
});
