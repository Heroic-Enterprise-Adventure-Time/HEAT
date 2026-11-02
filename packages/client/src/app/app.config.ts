import { provideHttpClient } from '@angular/common/http';
import { type ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { InMemoryCache } from '@apollo/client';
import { provideApollo } from 'apollo-angular';
import { routes } from './app.routes';
import { Config } from './config';
import possibleTypes from './graphql/generated/possible-types';
import { Hub } from './hub';
import { Session } from './session';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    // The client of the hub (decision 0012): Apollo through the hub's link
    // chain, with the schema's unions and interfaces so the cache matches a
    // fragment on `Error` or on a result union.
    provideApollo(() => ({ link: inject(Hub).link(), cache: new InMemoryCache(possibleTypes) })),
    // The stack's configuration, then the session, before the first render:
    // a page opened by the sign-in redirect exchanges its code here. Both
    // are injected before the first await, since inject() only works in
    // the synchronous part of the initializer (NG0203).
    provideAppInitializer(async () => {
      const config = inject(Config);
      const session = inject(Session);
      await config.load();
      await session.start();
    }),
  ],
};
