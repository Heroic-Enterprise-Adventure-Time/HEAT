import type { Provider } from '@angular/core';

import { Icons } from '../icons';

/**
 * The page's icons and portraits with their indexes already in, in place of
 * the ones the build writes: every icon is `<name>.test.png` and every
 * portrait `<sprite set>.test.png`, so a spec can say which picture an entry
 * shows without a fetch.
 */
export const fakeIcons: Provider = { provide: Icons, useValue: { src: (name: string) => `/art/icons/${name}.test.png`, portrait: (spriteSet: string) => `/art/portraits/${spriteSet}.test.png` } };
