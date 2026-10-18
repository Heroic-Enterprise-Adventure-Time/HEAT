import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { appConfig } from './app.config';
import { routes } from './app.routes';
import { Config } from './config';
import { Session } from './session';

describe('App', () => {
  it('routes the empty path to the home page', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
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
