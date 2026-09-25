import { DOCUMENT, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MATOMO_ENABLED, MATOMO_SITE_ID, MATOMO_URL } from './analytics.config';

/** Matomo's tracker queue. Until matomo.js loads it is a plain array, whose commands are replayed
 *  once the script arrives -- which is what lets the configuration below run first. The script then
 *  replaces it with its own object, whose `push` runs each command immediately. */
interface MatomoQueue {
  push(...commands: unknown[][]): unknown;
}

declare global {
  interface Window {
    _paq?: MatomoQueue;
  }
}

/**
 * The page title reported to Matomo, derived from the route rather than read from document.title
 * (see the class comment for why): '/search?q=x' is 'search', '/' is 'home', '/about/privacy' is
 * 'about/privacy'. Every record page is 'record' -- `record/:pid` is the only parameterised route,
 * and one title per page type keeps Matomo's page-title report from splitting into a row per paper.
 * The PID is not lost: it stays in the custom URL.
 */
export function pageTitle(url: string): string {
  const path = url.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  if (path === '') return 'home';
  return path.startsWith('record/') ? 'record' : path;
}

/**
 * Cookieless, IP-anonymised page-view tracking against the lab's self-hosted Matomo.
 *
 * No-ops entirely unless a site ID is configured (analytics.config.ts), so the shipped default
 * loads no third-party script and contacts no other host -- which is what keeps the privacy
 * page's "no third-party service is contacted" claim true until the day it is switched on.
 *
 * Four decisions worth keeping:
 *
 * - `disableCookies` is pushed BEFORE the tracker loads. Matomo sets first-party cookies by
 *   default; without this it would need a consent banner under ePrivacy, and the whole reason
 *   Google Analytics was dropped in favour of Matomo alone was to not have to build, version and
 *   maintain one. No cookie is set, so there is nothing to consent to.
 * - Page views are tracked on router navigation, not once at load. This is a single-page app: the
 *   document loads once and every subsequent "page" is a client-side route change, so the stock
 *   snippet's one-shot trackPageView would report one hit per session and nothing else.
 * - The page title comes from the route (`pageTitle`), never from document.title. NavigationEnd
 *   fires before Angular's TitleStrategy runs, and the record page sets its title only after its
 *   HTTP load, so document.title at that moment is stale: the static "DOME Observatory", or, going
 *   from one record to the next, the previous record's title.
 * - Every command goes through the live `window._paq`, never a cached reference. matomo.js swaps
 *   window._paq for a proxy on load, so a cached reference goes stale: every page view after the
 *   script arrived would be pushed onto an array nothing reads any more, and silently lost.
 */
@Injectable({ providedIn: 'root' })
export class Matomo {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  /** `enabled` is only a seam for the spec -- the unit-test builder cannot vi.mock a relative
   *  import such as analytics.config.ts. Every real caller leaves it at its default. */
  init(enabled = MATOMO_ENABLED): void {
    if (!enabled) return;

    this.push(['disableCookies']);
    this.push(['enableLinkTracking']);
    this.push(['setTrackerUrl', `${MATOMO_URL}matomo.php`]);
    this.push(['setSiteId', MATOMO_SITE_ID]);

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
        this.push(['setCustomUrl', this.document.location.origin + event.urlAfterRedirects]);
        this.push(['setDocumentTitle', pageTitle(event.urlAfterRedirects)]);
        this.push(['trackPageView']);
      });
  }

  /** Looks window._paq up afresh on every call -- see the class comment for why it is never kept. */
  private push(...commands: unknown[][]): void {
    (window._paq ??= []).push(...commands);
  }
}
