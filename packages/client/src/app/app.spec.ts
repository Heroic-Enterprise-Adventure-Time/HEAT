import { ApplicationInitStatus, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, provideRouter, type RouterStateSnapshot, UrlTree } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApolloTestingModule } from 'apollo-angular/testing';

import { App } from './app';
import { appConfig } from './app.config';
import { routes, signedIn } from './app.routes';
import { Config } from './config';
import { Session, type SessionUser } from './session';

describe('App', () => {
  it('routes the empty path to the home page', async () => {
    // The header reads the game, which needs a client of the hub; signed out, it sends nothing.
    await TestBed.configureTestingModule({
      imports: [App, ApolloTestingModule],
      providers: [provideRouter(routes)],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/');
    const page = harness.routeNativeElement as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toBe('HEAT');
  });

  // The application's own providers, initializers included: the test runner
  // serves no config.json, so the configuration records its failure and the
  // session reports sign-in unavailable, which is the page's third state.
  // What this guards is the initializer itself running to the end in an
  // injection context (NG0203 was found in the browser, not by a test).
  it('runs the configuration and the session before the first render', async () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    expect(TestBed.inject(Config).value()).toBeNull();
    expect(TestBed.inject(Config).error()).toBeTruthy();
    expect(TestBed.inject(Session).error()).toContain('configuration did not load');
  });
});

describe('signedIn', () => {
  /** Runs the guard for a URL against a session that is or is not signed in, and what it kept. */
  function guard(user: SessionUser | null, url: string) {
    const kept: string[] = [];
    const session = { user: signal(user), keep: (path: string) => void kept.push(path) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: Session, useValue: session }] });
    const result = TestBed.runInInjectionContext(() => signedIn({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
    return { result, kept };
  }

  it('lets a signed-in player into the camp and keeps nothing', () => {
    const { result, kept } = guard({ email: null, name: null, accessToken: 'access' }, '/camp/millbrook/mine');
    expect(result).toBe(true);
    expect(kept).toEqual([]);
  });

  it('sends a signed-out player home and keeps the path refused', () => {
    const { result, kept } = guard(null, '/camp/millbrook/heroes-hall/heroes/h1');
    expect(result instanceof UrlTree && result.toString()).toBe('/');
    expect(kept).toEqual(['/camp/millbrook/heroes-hall/heroes/h1']);
  });
});
