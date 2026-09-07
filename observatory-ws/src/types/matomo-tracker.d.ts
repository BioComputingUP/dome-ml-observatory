/**
 * Minimal typings for `matomo-tracker`, which ships none of its own.
 *
 * Only the surface this service uses is declared -- the constructor, `track`, and the EventEmitter
 * `error` event -- rather than the whole HTTP tracking API. The parameter names are Matomo's own
 * (`cip`, `uid`, `ua`, `action_name`), kept verbatim so they can be looked up in Matomo's tracking
 * API documentation without translation.
 */
declare module 'matomo-tracker' {
  import { EventEmitter } from 'node:events';

  interface TrackOptions {
    /** Required by the API. The full URL of the "page" being reported. */
    url: string;
    action_name?: string;
    /** Auth token, required for `cip` to be honoured -- without it Matomo records the server's IP. */
    token_auth?: string;
    /** Client IP to attribute the hit to, rather than the requesting server's. */
    cip?: string;
    uid?: string;
    ua?: string;
    urlref?: string;
    [param: string]: string | number | undefined;
  }

  class MatomoTracker extends EventEmitter {
    constructor(siteId: number | string, trackerUrl: string, noURLValidation?: boolean);
    track(options: TrackOptions | string): void;
    trackBulk(events: TrackOptions[], callback?: (body: string) => void): void;
  }

  export = MatomoTracker;
}
