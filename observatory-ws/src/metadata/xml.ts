/**
 * XML 1.0 forbids most C0 control characters outright -- escaped or not -- and corpus abstracts
 * occasionally carry one, so they are dropped rather than escaped.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Text or attribute content, safe to place between tags or inside double or single quotes. */
export function escapeXml(text: string): string {
  return text
    .replace(FORBIDDEN, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
