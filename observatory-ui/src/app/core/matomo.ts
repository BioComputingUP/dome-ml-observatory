import { DOCUMENT, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MATOMO_ENABLED, MATOMO_SITE_ID, MATOMO_URL } from './analytics.config';

/** Matomo's tracker queue. Calls pushed before matomo.js loads are replayed once it does, which
 *  is what lets the configuration below run before the script has arrived. */
type MatomoQueue = unknown[][];

declare global {
  interface Window {
    _paq?: MatomoQueue;
  }
}

/**
 * Cookieless, IP-anonymised page-view tracking against the lab's self-hosted Matomo.
 *
 * No-ops entirely unless a site ID is configured (analytics.config.ts), so the shipped default
 * loads no third-party script and contacts no other host -- which is what keeps the privacy
 * page's "no third-party service is contacted" claim true until the day it is switched on.
 *
 * Two decisions worth keeping:
 *
 * - `disableCookies` is pushed BEFORE the tracker loads. Matomo sets first-party cookies by
 *   default; without this it would need a consent banner under ePrivacy, and the whole reason
 *   Google Analytics was dropped in favour of Matomo alone was to not have to build, version and
 *   maintain one. No cookie is set, so there is nothing to consent to.
 * - Page views are tracked on router navigation, not once at load. This is a single-page app: the
 *   document loads once and every subsequent "page" is a client-side route change, so the stock
 *   snippet's one-shot trackPageView would report one hit per session and nothing else.
 */
@Injectable({ providedIn: 'root' })
export class Matomo {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  init(): void {
    if (!MATOMO_ENABLED) return;

    const paq: MatomoQueue = (window._paq = window._paq ?? []);
    paq.push(['disableCookies']);
    paq.push(['enableLinkTracking']);
    paq.push(['setTrackerUrl', `${MATOMO_URL}matomo.php`]);
    paq.push(['setSiteId', MATOMO_SITE_ID]);

    const script = this.document.createElement('script');
    script.async = true;
    script.src = `${MATOMO_URL}matomo.js`;
    this.document.head.appendChild(script);

    // The first NavigationEnd fires for the initial route too, so the landing page is counted
    // here rather than needing a separate trackPageView at load.
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        // setCustomUrl on every hit: without it Matomo attributes every page view to whatever URL
        // the document was first opened at, because the SPA never reloads.
        paq.push(['setCustomUrl', this.document.location.origin + event.urlAfterRedirects]);
        paq.push(['setDocumentTitle', this.document.title]);
        paq.push(['trackPageView']);
      });
  }
}
