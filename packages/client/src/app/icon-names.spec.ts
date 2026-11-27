import { fetchIconNames, fetchPortraitNames, iconAddress, portraitAddress } from './icon-names';

const names = { timber: 'timber.0123456789ab.png', mine: 'mine.ba9876543210.png' };

/** A fetch that answers with the body, and the addresses it was asked for. */
function recording(body: unknown): { asked: string[]; fetchFn: typeof fetch } {
  const asked: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    asked.push(input instanceof Request ? input.url : String(input));
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  return { asked, fetchFn };
}

describe('fetchIconNames', () => {
  it('reads the index the build wrote beside the icons', async () => {
    const { asked, fetchFn } = recording(names);
    await expect(fetchIconNames(fetchFn)).resolves.toEqual(names);
    expect(asked).toEqual(['/art/icons/pictures.json']);
  });

  it('refuses an index that is not names by name, naming the file', async () => {
    const fetchFn: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ timber: 7 }), { status: 200 }));
    await expect(fetchIconNames(fetchFn)).rejects.toThrow(/^\/art\/icons\/pictures\.json is not what the page reads/);
  });
});

describe('iconAddress', () => {
  it('is where the icon is served, under the name that carries its hash', () => {
    expect(iconAddress(names, 'timber')).toBe('/art/icons/timber.0123456789ab.png');
  });

  it('is nothing for an icon the index does not hold, or for a name every object has', () => {
    expect(iconAddress(names, 'cloth')).toBeNull();
    expect(iconAddress(names, 'toString')).toBeNull();
  });
});

describe('portraits', () => {
  const portraits = { 'ranger-01': 'ranger-01.0123456789ab.png' };

  it('reads the index the build wrote beside the portraits', async () => {
    const { asked, fetchFn } = recording(portraits);
    await expect(fetchPortraitNames(fetchFn)).resolves.toEqual(portraits);
    expect(asked).toEqual(['/art/portraits/pictures.json']);
  });

  it('is where the portrait of a sprite set is served, or nothing for a set the index does not hold', () => {
    expect(portraitAddress(portraits, 'ranger-01')).toBe('/art/portraits/ranger-01.0123456789ab.png');
    expect(portraitAddress(portraits, 'knight-06')).toBeNull();
    expect(portraitAddress(portraits, 'toString')).toBeNull();
  });
});
