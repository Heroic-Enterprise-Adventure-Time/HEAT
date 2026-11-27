import { Service, signal } from '@angular/core';

import { fetchIconNames, fetchPortraitNames, iconAddress, type IconNames, portraitAddress, type PortraitNames } from './icon-names';

/**
 * The icons' and the portraits' indexes for the page's templates
 * (`icon-names.ts`), read once before the application starts. A failure is
 * recorded, not thrown, as the configuration's is: the page then renders
 * without those pictures, and every entry of the menu and every hero tile
 * still has its name. Each index loads on its own, so the portraits failing
 * leaves the icons, and the icons failing leaves the portraits.
 */
/** What a failed load says. */
function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

@Service()
export class Icons {
  private readonly names = signal<IconNames>({});
  private readonly portraits = signal<PortraitNames>({});
  readonly error = signal<string | null>(null);

  async load(fetchFn: typeof fetch = fetch): Promise<void> {
    const [names, portraits] = await Promise.allSettled([fetchIconNames(fetchFn), fetchPortraitNames(fetchFn)]);
    this.names.set(names.status === 'fulfilled' ? names.value : {});
    this.portraits.set(portraits.status === 'fulfilled' ? portraits.value : {});
    const failures = [names, portraits].flatMap((result) => (result.status === 'rejected' ? [messageOf(result.reason)] : []));
    this.error.set(failures.length > 0 ? failures.join('; ') : null);
  }

  /** Where the icon of that name is served; null until the index is in, and for a name it does not hold. */
  src(name: string): string | null {
    return iconAddress(this.names(), name);
  }

  /** Where the portrait of a hero of that sprite set is served; null until the index is in, and for a set it does not hold. */
  portrait(spriteSet: string): string | null {
    return portraitAddress(this.portraits(), spriteSet);
  }
}
