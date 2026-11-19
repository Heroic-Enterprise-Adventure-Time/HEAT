/**
 * The art a battle scene is waiting for (Issue-205), apart from the
 * renderer so that it is tested without one. An entry does not move while
 * any of it is pending, so nobody runs on unseen, and the adventure's
 * clock, which waits for the entry, waits with it. A load that fails is
 * over all the same: `failed` hears why, and the run goes on without that
 * picture, as it goes on with no scene at all where WebGL is missing. So is
 * one that has taken `limitMs`: a request that hangs holds the run no
 * longer than that, and its picture shows when it does arrive.
 */
export interface ArtLoads {
  /** Whether any art asked for is still awaited: not arrived, not failed, and asked for less than the limit ago. */
  readonly pending: () => boolean;
  /** Waits for `art` and hands it to `use`, which runs before the load stops being pending, or whenever it arrives after the limit. */
  readonly load: <Art>(art: Promise<Art>, use: (art: Art) => void) => void;
}

export function artLoads(limitMs: number, failed: (error: unknown) => void): ArtLoads {
  let pending = 0;
  return {
    pending: () => pending > 0,
    load: (art, use) => {
      let awaited = true;
      const over = () => {
        if (awaited) pending--;
        awaited = false;
      };
      pending++;
      const limit = setTimeout(over, limitMs);
      void art.then(use, failed).finally(() => {
        clearTimeout(limit);
        over();
      });
    },
  };
}
