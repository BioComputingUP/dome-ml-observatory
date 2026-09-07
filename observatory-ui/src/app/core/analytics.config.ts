/**
 * The one place the Matomo configuration lives, and the one switch that turns tracking on.
 *
 * `MATOMO_SITE_ID` is null until the lab's Matomo administrator issues a site ID for
 * observatory.dome-ml.org. While it is null nothing is loaded, no request leaves the browser, and
 * the privacy page says so -- see MATOMO_ENABLED below. Setting it to the real ID is the entire
 * activation step on the frontend side; see docs/matomo-activation.local.md.
 *
 * Deliberately a source constant rather than an environment variable or a build-time define. The
 * SPA has no runtime configuration of any kind (see the root README's Architecture section) and
 * this is not a secret -- a site ID and a tracker URL are visible to anyone who opens the page,
 * exactly as they are on the lab's other services. Adding an `environments/` mechanism for two
 * public constants would cost the invariant and buy nothing.
 */
export const MATOMO_URL = 'https://matomo.biocomputingup.it/';

/** Set to the site ID issued by the lab's Matomo, e.g. '7'. Null disables tracking entirely. */
export const MATOMO_SITE_ID: string | null = null;

/**
 * Single source of truth for whether analytics are running, read by BOTH the tracker and the
 * privacy page. They cannot disagree: flipping the site ID above turns on tracking and updates
 * what /about/privacy tells visitors in the same edit. That coupling is the point -- a privacy
 * notice that drifts out of date is the failure mode worth engineering against.
 */
export const MATOMO_ENABLED = MATOMO_SITE_ID !== null;
