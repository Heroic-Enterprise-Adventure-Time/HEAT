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
    // a page opened by the sign-in redirect exchanges its code here.
    provideAppInitializer(async () => {
      await inject(Config).load();
      await inject(Session).start();
    }),
  ],
};
