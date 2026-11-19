import { artSettled } from './art-loads';

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

describe('artSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets the settled promises' callbacks run, with no time passing. */
  const settled = () => vi.advanceTimersByTimeAsync(0);

  /** Whether the wait is over, read without waiting for it. */
  const watch = (wait: Promise<void>) => {
    const state = { over: false };
    void wait.then(() => { state.over = true; });
    return state;
  };

  it('is over at once when nothing is asked for', async () => {
    const wait = watch(artSettled([], LIMIT_MS, () => undefined));
    await settled();
    expect(wait.over).toBe(true);
  });

  it('is over only when every load has arrived', async () => {
    const hero = deferred<string>();
    const sword = deferred<string>();
    const wait = watch(artSettled([hero.promise, sword.promise], LIMIT_MS, () => undefined));

    hero.resolve('fighter-02');
    await settled();
    expect(wait.over).toBe(false);

    sword.resolve('sword-01');
    await settled();
    expect(wait.over).toBe(true);
  });

  it('counts a load that fails as over, and says why', async () => {
    const failures: unknown[] = [];
    const hero = deferred<string>();
    const wolf = deferred<string>();
    const wait = watch(artSettled([hero.promise, wolf.promise], LIMIT_MS, (error) => failures.push(error)));
    const missing = new Error('GET /art/monsters/none/sheet.json answered 404');
    wolf.reject(missing);
    await settled();
    expect(wait.over).toBe(false);
    expect(failures).toEqual([missing]);

    hero.resolve('fighter-02');
    await settled();
    expect(wait.over).toBe(true);
  });

  it('is over at the limit, whatever is still on its way', async () => {
    const hero = deferred<string>();
    const wait = watch(artSettled([hero.promise], LIMIT_MS, () => undefined));
    await vi.advanceTimersByTimeAsync(LIMIT_MS - 1);
    expect(wait.over).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.over).toBe(true);
  });

  it('leaves no timer behind once every load has settled', async () => {
    void artSettled([Promise.resolve('fighter-02')], LIMIT_MS, () => undefined);
    await settled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
