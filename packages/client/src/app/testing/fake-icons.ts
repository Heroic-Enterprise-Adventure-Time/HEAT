import type { Provider } from '@angular/core';

import { Icons } from '../icons';

/**
 * The page's icons with their index already in, in place of the one the
 * build writes: every icon is `<name>.test.png`, so a spec can say which
 * icon an entry shows without a fetch.
 */
export const fakeIcons: Provider = { provide: Icons, useValue: { src: (name: string) => `/art/icons/${name}.test.png` } };
