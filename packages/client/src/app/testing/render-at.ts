import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideRouter, Router, RouterOutlet, type Routes } from '@angular/router';
import { render } from '@testing-library/angular/zoneless';

/**
 * Renders what a URL routes to, in an outlet, the way the application reaches a
 * page. Answers the router, for where a test ended up, and `settle`, which waits
 * for the page to catch up with what a test did outside it.
 */
export async function renderAt(url: string, routes: Routes, providers: (Provider | EnvironmentProviders)[]) {
  const { fixture } = await render('<router-outlet />', { imports: [RouterOutlet], providers: [provideRouter(routes), ...providers] });
  const router = fixture.debugElement.injector.get(Router);
  await router.navigateByUrl(url);
  await fixture.whenStable();
  return { router, settle: () => fixture.whenStable() };
}
