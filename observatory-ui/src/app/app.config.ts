import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { Matomo } from './core/matomo';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    // Runs once at bootstrap, before the first navigation, so the initial page view is counted.
    // No-ops unless a Matomo site ID is configured -- see core/analytics.config.ts.
    provideAppInitializer(() => {
      inject(Matomo).init();
    }),
  ],
};
