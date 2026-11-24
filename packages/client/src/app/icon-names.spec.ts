import { fetchIconNames, iconAddress } from './icon-names';

const names = { timber: 'timber.0123456789ab.png', mine: 'mine.ba9876543210.png' };

describe('fetchIconNames', () => {
  it('reads the index the build wrote beside the icons', async () => {
    const asked: string[] = [];
    const fetchFn: typeof fetch = (input) => {
      asked.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response(JSON.stringify(names), { status: 200 }));
    };
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
