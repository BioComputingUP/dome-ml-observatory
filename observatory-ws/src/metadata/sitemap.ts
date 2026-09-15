import { escapeXml } from './xml';

/** The sitemaps.org cap on URLs in one file. */
export const SITEMAP_CHUNK = 50_000;

/** The site's own pages worth crawling: every route in observatory-ui's app.routes.ts that is a
 *  real page rather than a redirect, a parameterised record page or the not-found fallback. */
export const STATIC_PAGES: readonly string[] = [
  '/',
  '/search',
  '/journals',
  '/news',
  '/download',
  '/download/bulk',
  '/download/api',
  '/about',
  '/about/processing',
  '/about/team',
  '/about/governance',
  '/about/integrations',
  '/about/licensing',
  '/about/privacy',
  '/about/support',
];

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function entries(tag: 'url' | 'sitemap', items: readonly SitemapEntry[]): string {
  return items
    .map((e) => {
      const lastmod = e.lastmod ? `<lastmod>${escapeXml(e.lastmod)}</lastmod>` : '';
      return `<${tag}><loc>${escapeXml(e.loc)}</loc>${lastmod}</${tag}>`;
    })
    .join('\n');
}

export function urlsetXml(urls: readonly SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n${entries('url', urls)}\n</urlset>\n`;
}

export function sitemapIndexXml(sitemaps: readonly SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${NS}">\n${entries('sitemap', sitemaps)}\n</sitemapindex>\n`;
}

/** Public addresses. The sitemaps sit at the site root, not under /api: a sitemap may only list
 *  URLs at or below its own location, and nginx maps these onto the API routes. */
export function sitemapIndexUrl(origin: string): string {
  return `${origin}/sitemap.xml`;
}

export function pagesSitemapUrl(origin: string): string {
  return `${origin}/sitemaps/pages.xml`;
}

export function recordsSitemapUrl(origin: string, n: number): string {
  return `${origin}/sitemaps/records-${n}.xml`;
}
