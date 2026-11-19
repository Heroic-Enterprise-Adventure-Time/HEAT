import { artLoads } from './art-loads';

/** A promise the test settles by hand. */
function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<Value>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const LIMIT_MS = 8000;

describe('artLoads', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets the settled promises' callbacks run, with no time passing. */
  const settled = () => vi.advanceTimersByTimeAsync(0);

  it('has nothing pending before anything is asked for', () => {
    expect(artLoads(LIMIT_MS, () => undefined).pending()).toBe(false);
  });

  it('is pending until every load has arrived, and hands each its art', async () => {
    const loads = artLoads(LIMIT_MS, () => undefined);
    const hero = deferred<string>();
    const sword = deferred<string>();
    const used: string[] = [];
    loads.load(hero.promise, (art) => used.push(art));
    loads.load(sword.promise, (art) => used.push(art));
    expect(loads.pending()).toBe(true);

    hero.resolve('fighter-02');
    await settled();
    expect(used).toEqual(['fighter-02']);
    expect(loads.pending()).toBe(true);

    sword.resolve('sword-01');
    await settled();
    expect(used).toEqual(['fighter-02', 'sword-01']);
    expect(loads.pending()).toBe(false);
  });

  it('has the art in hand before the load stops being pending', async () => {
    const loads = artLoads(LIMIT_MS, () => undefined);
    const hero = deferred<string>();
    let pendingWhenUsed: boolean | null = null;
    loads.load(hero.promise, () => { pendingWhenUsed = loads.pending(); });
    hero.resolve('fighter-02');
    await settled();
    expect(pendingWhenUsed).toBe(true);
  });

  it('counts a load that fails as over, uses nothing, and says why', async () => {
    const failures: unknown[] = [];
    const loads = artLoads(LIMIT_MS, (error) => failures.push(error));
    const hero = deferred<string>();
    const used: string[] = [];
    loads.load(hero.promise, (art) => used.push(art));
    const missing = new Error('GET /art/heroes/none/sheet.json answered 404');
    hero.reject(missing);
    await settled();
    expect(loads.pending()).toBe(false);
    expect(used).toEqual([]);
    expect(failures).toEqual([missing]);
  });

  it('stops waiting for a load that takes longer than the limit, and still uses its art when it arrives', async () => {
    const loads = artLoads(LIMIT_MS, () => undefined);
    const hero = deferred<string>();
    const sword = deferred<string>();
    const used: string[] = [];
    loads.load(hero.promise, (art) => used.push(art));
    await vi.advanceTimersByTimeAsync(LIMIT_MS - 1);
    expect(loads.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(loads.pending()).toBe(false);

    // One asked for after the first gave up is waited for in its own right.
    loads.load(sword.promise, (art) => used.push(art));
    expect(loads.pending()).toBe(true);
    hero.resolve('fighter-02');
    await settled();
    expect(used).toEqual(['fighter-02']);
    expect(loads.pending()).toBe(true);
    sword.resolve('sword-01');
    await settled();
    expect(loads.pending()).toBe(false);
  });
});
