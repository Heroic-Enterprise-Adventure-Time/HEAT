/**
 * The wait for a run's art before the run begins (Issue-205): over once
 * every load has arrived or failed, or after `limitMs` on the wall clock,
 * whichever is first, so that one request that hangs does not hold the run
 * for good. It never fails: a load that does is handed to `failed`, and the
 * run begins without that picture, as it begins with no scene at all where
 * WebGL is missing. A load still on its way at the limit goes on, and its
 * picture shows when it arrives.
 */
export function artSettled(loads: readonly Promise<unknown>[], limitMs: number, failed: (error: unknown) => void): Promise<void> {
  return new Promise((resolve) => {
    const limit = setTimeout(resolve, limitMs);
    void Promise.all(loads.map((load) => load.catch(failed))).then(() => {
      clearTimeout(limit);
      resolve();
    });
  });
}
