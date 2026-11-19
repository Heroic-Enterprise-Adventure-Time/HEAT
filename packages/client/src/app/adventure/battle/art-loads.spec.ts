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

/** Lets the settled promises' callbacks run. */
const settled = () => new Promise<void>((resolve) => { setTimeout(resolve); });

describe('artLoads', () => {
  it('has nothing pending before anything is asked for', () => {
    expect(artLoads(() => undefined).pending()).toBe(false);
  });

  it('is pending until every load has arrived, and hands each its art', async () => {
    const loads = artLoads(() => undefined);
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
    const loads = artLoads(() => undefined);
    const hero = deferred<string>();
    let pendingWhenUsed: boolean | null = null;
    loads.load(hero.promise, () => { pendingWhenUsed = loads.pending(); });
    hero.resolve('fighter-02');
    await settled();
    expect(pendingWhenUsed).toBe(true);
  });

  it('counts a load that fails as over, uses nothing, and says why', async () => {
    const failures: unknown[] = [];
    const loads = artLoads((error) => failures.push(error));
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
});
