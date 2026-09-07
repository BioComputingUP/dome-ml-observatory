/**
 * Where a paper was published: the journal, or the preprint server it was posted to.
 *
 * Preprints have no journal at all -- Europe PMC returns no `journalTitle` for a `SRC:PPR` record,
 * so `publication_metadata.journal` is null on all 56,863 of them (6.7% of the corpus). The card
 * and the record page used to hide the whole venue row when journal was empty, which meant a
 * preprint showed no venue whatsoever. This module is what lets both say `Preprint: bioRxiv`
 * instead, from one rule rather than two copies of it.
 *
 * **The server name is data, not an inference -- eventually.** Schema v1.3.0 defines
 * `publication_metadata.preprint_server`, carrying Europe PMC's own
 * `bookOrReportDetails.publisher` verbatim, and this module prefers it whenever it is populated.
 * Nothing populates it yet (see `preprint.md` at the repo root for the capture and backfill spec),
 * so until then the server is derived from the DOI prefix by the table below. The order matters:
 * when the backfill lands, recorded data silently takes over and a disagreement with the table is
 * the table's bug, not the record's.
 */

import { AiMlRecord } from './record.model';

export interface Venue {
  /** Row label. Also the discriminator -- the two cases are genuinely different kinds of venue. */
  label: 'Journal' | 'Preprint';
  value: string;
  /** EBI icon-font name, for the record page's labelled rows. Same idiom as ArticleSource.icon. */
  icon: 'icon-book' | 'icon-publication';
}

interface PreprintServerRule {
  /** DOI registrant prefix: everything before the first "/". */
  prefix: string;
  /** Tested against everything after the first "/". Absent means the prefix alone decides. */
  suffix?: RegExp;
  /** Europe PMC's own publisher string, exact casing. */
  name: string;
}

/**
 * bioRxiv and medRxiv share a registrant, so the article number is what separates them: medRxiv's
 * is 8 digits, bioRxiv's is 6, with or without the modern `YYYY.MM.DD.` date component.
 *
 * Validated against every one of the 20,230 such DOIs in the corpus (2026-09-07) with zero
 * unmatched, and spot-checked against Europe PMC on both registrants:
 *   medRxiv  10.1101/19008045, 10.1101/2025.10.14.25337964, 10.64898/2026.05.11.26352943
 *   bioRxiv  10.1101/270413,   10.1101/2024.12.02.626299,   10.64898/2026.05.04.722036
 *
 * Declared before PREPRINT_SERVERS because the table references it at module evaluation time.
 */
const MEDRXIV_ARTICLE_NUMBER = /^(?:\d{4}\.\d{2}\.\d{2}\.)?\d{8}(?:v\d+)?$/i;

/**
 * DOI registrant -> preprint server, first match wins.
 *
 * Every name is Europe PMC's own `bookOrReportDetails.publisher`, verified per registrant on
 * 2026-09-07; counts are that day's corpus. These 27 registrants cover **100%** of corpus
 * preprints -- a sweep for any prefix outside this table returned nothing -- and every corpus
 * preprint has a DOI, so the unknown branch guards against a server that appears later rather
 * than a gap today.
 *
 * Rows sharing a prefix are ordered specific-first, and `preprintServerRulesAreOrdered` in the
 * spec holds that invariant when someone appends a row.
 *
 * Several of these registrants also publish *journals* -- 10.1101 is Cold Spring Harbor
 * Laboratory Press (Genome Research, Learning & Memory), 10.1590 is SciELO, 10.3897 is Pensoft,
 * 10.1099 the Microbiology Society, 10.3310 NIHR, 10.3762 Beilstein. This table is never
 * consulted for a record that has a journal name, which is what keeps those 588 records correct.
 *
 * arXiv (10.48550) is deliberately absent: Europe PMC's SRC:PPR does not index it, so the corpus
 * contains zero arXiv preprints.
 */
export const PREPRINT_SERVERS: readonly PreprintServerRule[] = [
  { prefix: '10.21203', name: 'Research Square' }, //                          20,712
  { prefix: '10.1101', suffix: MEDRXIV_ARTICLE_NUMBER, name: 'medRxiv' }, //    6,182
  { prefix: '10.1101', name: 'bioRxiv' }, //                                   10,857
  { prefix: '10.64898', suffix: MEDRXIV_ARTICLE_NUMBER, name: 'medRxiv' }, //   1,357  openRxiv's
  { prefix: '10.64898', name: 'bioRxiv' }, //                                   1,834  2025/26 prefix
  { prefix: '10.20944', name: 'Preprints.org' }, //                             8,479
  { prefix: '10.31234', name: 'PsyArXiv' }, //                                  2,071
  { prefix: '10.2139', name: 'SSRN' }, //                                       1,876
  { prefix: '10.22541', name: 'Authorea Preprints' }, //                        1,640
  // 10.12688 is F1000's platform, not one venue: the partner gateways are separately-named
  // journals sharing it. Slug counts on the corpus, same date.
  { prefix: '10.12688', suffix: /^f1000research\./i, name: 'F1000Research' }, //  406
  { prefix: '10.12688', suffix: /^openreseurope\./i, name: 'Open Research Europe' }, // 117
  { prefix: '10.12688', suffix: /^wellcomeopenres\./i, name: 'Wellcome Open Research' }, // 41
  { prefix: '10.12688', suffix: /^mep\./i, name: 'MedEdPublish' }, //              13
  { prefix: '10.12688', suffix: /^verixiv\./i, name: 'VeriXiv' }, //                9
  { prefix: '10.12688', suffix: /^openresafrica\./i, name: 'Open Research Africa' }, // 6
  { prefix: '10.12688', suffix: /^gatesopenres\./i, name: 'Gates Open Research' }, // 5
  { prefix: '10.12688', suffix: /^hrbopenres\./i, name: 'HRB Open Research' }, //   1
  { prefix: '10.12688', suffix: /^emeraldopenres\./i, name: 'Emerald Open Research' }, // 1
  { prefix: '10.12688', name: 'F1000 Research' }, //            a future gateway on this platform
  { prefix: '10.26434', name: 'ChemRxiv' }, //                                    454
  { prefix: '10.32388', name: 'Qeios' }, //                                       232
  { prefix: '10.14293', name: 'ScienceOpen Preprints' }, //                       196
  { prefix: '10.7287', name: 'PeerJ Preprints' }, //                               90
  { prefix: '10.32942', name: 'EcoEvoRxiv' }, //                                   78
  { prefix: '10.1590', name: 'SciELO Preprints' }, //                              60
  { prefix: '10.31222', name: 'MetaArXiv' }, //                                    41
  { prefix: '10.3897', name: 'ARPHA Preprints' }, //                               27
  { prefix: '10.37044', name: 'BioHackrXiv' }, //                                  16
  { prefix: '10.31220', name: 'agriRxiv' }, //                                     14
  { prefix: '10.31730', name: 'AfricArXiv' }, //                                   14
  { prefix: '10.1099', name: 'Access Microbiology' }, //                            8
  { prefix: '10.3310', name: 'NIHR Open Research' }, //                              7
  { prefix: '10.15694', name: 'MedEdPublish' }, //                                   7
  { prefix: '10.3762', name: 'Beilstein Archives' }, //                              6
  { prefix: '10.21467', name: 'AIJR Preprints' }, //                                 4
  { prefix: '10.35241', name: 'Emerald Open Research' }, //                          2
  { prefix: '10.5281', name: 'Zenodo' }, //                                          2
  { prefix: '10.31233', name: 'PaleorXiv' }, //                                      1
];

/**
 * Shown when a record is a preprint but names no server we can resolve. Matches no corpus record
 * today; it exists so a server first seen after 2026-09-07 reads as an honest gap rather than a
 * blank row. "Not recorded" is already this site's wording for an absent fact.
 */
export const PREPRINT_SERVER_UNKNOWN = 'Server not recorded';

/** Lowercased pub_types, for the case-insensitive comparisons below. Two corpus records spell it
 *  "preprint" rather than "Preprint", and matching only the capitalised form loses them. */
function lowerPubTypes(record: AiMlRecord): string[] {
  return (record.content_filters?.pub_types ?? []).map((t) => t.toLowerCase());
}

/** Whether this record is a preprint at all. Prefers `source.epmc_source`, which is Europe PMC's
 *  authoritative record-source marker, and falls back to the pub_types proxy that is all the
 *  corpus carries until the capture pass runs. */
export function isPreprint(record: AiMlRecord): boolean {
  const epmcSource = record.source?.epmc_source;
  if (epmcSource) return epmcSource.toUpperCase() === 'PPR';
  return lowerPubTypes(record).includes('preprint');
}

/**
 * The preprint server this record was posted to, or null when neither the recorded field nor the
 * DOI resolves one. Not a preprint test -- ask `isPreprint` first.
 */
export function preprintServer(record: AiMlRecord): string | null {
  const recorded = record.publication_metadata.preprint_server?.trim();
  if (recorded) return recorded;

  const doi = record.identifiers.doi?.trim();
  if (!doi) return null;
  const separator = doi.indexOf('/');
  if (separator === -1) return null;
  const prefix = doi.slice(0, separator);
  const rest = doi.slice(separator + 1);

  const rule = PREPRINT_SERVERS.find(
    (candidate) => candidate.prefix === prefix && (!candidate.suffix || candidate.suffix.test(rest)),
  );
  return rule ? rule.name : null;
}

/** A withdrawn or removed preprint still exists and still has a server; saying so on the venue row
 *  is the one place a reader will actually see it. Both types always accompany "Preprint". */
function statusSuffix(record: AiMlRecord): string {
  const types = lowerPubTypes(record);
  if (types.includes('preprint-removal')) return ' (removed)';
  if (types.includes('preprint-withdrawal')) return ' (withdrawn)';
  return '';
}

/**
 * The one venue row, for the result card and the record page.
 *
 * A journal name always wins, verbatim. That is not just precedence: several preprint registrants
 * are also journal registrants, 8 records carry the journal name "bioRxiv : the preprint server
 * for biology", and 3 carry both a journal and a Preprint pub type. Checking journal first is what
 * makes every one of those render as the journal it is.
 *
 * Returns null when there is no venue to name -- 349 corpus records have neither a journal nor a
 * preprint type (216 reviews, 93 dissertations, 18 study guides, 22 with no type at all), and they
 * show no venue row rather than an empty one.
 */
export function publicationVenue(record: AiMlRecord): Venue | null {
  const journal = record.publication_metadata.journal?.trim();
  if (journal) return { label: 'Journal', value: journal, icon: 'icon-book' };

  if (!isPreprint(record)) return null;

  const server = preprintServer(record) ?? PREPRINT_SERVER_UNKNOWN;
  return { label: 'Preprint', value: `${server}${statusSuffix(record)}`, icon: 'icon-publication' };
}
