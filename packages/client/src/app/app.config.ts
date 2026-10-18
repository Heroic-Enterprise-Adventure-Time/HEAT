import { type ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { Config } from './config';
import { Session } from './session';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
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
