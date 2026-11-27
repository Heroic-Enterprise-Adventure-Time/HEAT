import { Icons } from './icons';

const names = { timber: 'timber.0123456789ab.png', mine: 'mine.ba9876543210.png' };

/** The address a fetch was asked for. */
const addressOf = (input: Parameters<typeof fetch>[0]): string => (input instanceof Request ? input.url : input.toString());

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
    const fetchFn: typeof fetch = (input) => Promise.resolve(new Response(JSON.stringify(addressOf(input).startsWith('/art/portraits/') ? portraits : names), { status: 200 }));
    expect(icons.portrait('ranger-01')).toBeNull();
    await icons.load(fetchFn);
    expect(icons.portrait('ranger-01')).toBe('/art/portraits/ranger-01.0123456789ab.png');
    expect(icons.portrait('knight-06')).toBeNull();
  });

  it('keeps the icons when only the index of the portraits fails', async () => {
    const icons = new Icons();
    const fetchFn: typeof fetch = (input) => {
      const portraits = addressOf(input).startsWith('/art/portraits/');
      return Promise.resolve(new Response(JSON.stringify(portraits ? {} : names), { status: portraits ? 404 : 200 }));
    };
    await icons.load(fetchFn);
    expect(icons.src('mine')).toBe('/art/icons/mine.ba9876543210.png');
    expect(icons.portrait('ranger-01')).toBeNull();
    expect(icons.error()).toBe('GET /art/portraits/pictures.json answered 404');
  });

  it('records a failure instead of throwing, and has no icons', async () => {
    const icons = new Icons();
    await icons.load(answering(names));
    await icons.load(answering({}, 404));
    expect(icons.src('mine')).toBeNull();
    expect(icons.portrait('mine')).toBeNull();
    expect(icons.error()).toBe('GET /art/icons/pictures.json answered 404; GET /art/portraits/pictures.json answered 404');
  });
});
