export interface Licence {
  name: string;
  url?: string;
}

/**
 * The article's licence as Europe PMC reports it -- lower-case family names such as `cc by` or
 * `cc by-nc-nd`, with no version. It maps to the Creative Commons family URL, which does not assert
 * a version Europe PMC never gave. Anything unrecognised keeps its name and gets no URL; `""`
 * ("looked up, none disclosed") and null ("never looked up") both mean no licence statement.
 */
export function articleLicence(raw: string | null | undefined): Licence | undefined {
  const original = (raw ?? '').trim();
  const value = original.toLowerCase();
  if (!value) return undefined;
  if (value === 'cc0') {
    return { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
  }
  const cc = /^cc[ -]by((?:-(?:nc|nd|sa))*)$/.exec(value);
  if (cc) {
    return {
      name: `CC BY${cc[1].toUpperCase()}`,
      url: `https://creativecommons.org/licenses/by${cc[1]}/`,
    };
  }
  return { name: original };
}
