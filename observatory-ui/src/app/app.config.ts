import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { Matomo } from './core/matomo';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Every route is a lazy loadComponent; preloading fetches their chunks in the background
    // once the first navigation settles, so a navbar click never waits on a chunk download
    // before it can even start the page's API call. ~100KB gzipped across all of them,
    // same-origin, and the same dynamic import() the click would do -- no CSP interaction.
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),
    // Runs once at bootstrap, before the first navigation, so the initial page view is counted.
    // No-ops unless a Matomo site ID is configured -- see core/analytics.config.ts.
    provideAppInitializer(() => {
      inject(Matomo).init();
    }),
  ],
};
