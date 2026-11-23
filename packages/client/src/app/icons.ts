import { Service, signal } from '@angular/core';

import { fetchIconNames, iconAddress, type IconNames } from './icon-names';

/**
 * The icons' index for the page's templates (`icon-names.ts`), read once
 * before the application starts. A failure is recorded, not thrown, as the
 * configuration's is: the page then renders without its icons, and every
 * entry of the menu still has its name.
 */
@Service()
export class Icons {
  private readonly names = signal<IconNames>({});
  readonly error = signal<string | null>(null);

  async load(fetchFn: typeof fetch = fetch): Promise<void> {
    try {
      this.names.set(await fetchIconNames(fetchFn));
      this.error.set(null);
    } catch (e) {
      this.names.set({});
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  /** Where the icon of that name is served; null until the index is in, and for a name it does not hold. */
  src(name: string): string | null {
    return iconAddress(this.names(), name);
  }
}
