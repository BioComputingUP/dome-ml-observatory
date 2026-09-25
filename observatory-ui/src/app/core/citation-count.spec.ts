import { citationCountDate, citationCountNote } from './citation-count';
import { AiMlRecord } from './record.model';

function record(meta: Partial<AiMlRecord['publication_metadata']>): AiMlRecord {
  return {
    publication_metadata: { title: 't', abstract: null, authors: null, year: 2021, journal: 'Nature', citation_count: 105, ...meta },
  } as AiMlRecord;
}

describe('citation count freshness', () => {
  it('dates the count in the site format', () => {
    const rec = record({ citation_count_updated: '2026-09-03T13:49:11.247182+00:00', citation_source: 'europepmc' });
    expect(citationCountDate(rec)).toBe('3 Sep 2026');
    expect(citationCountNote(rec)).toBe(
      'Citation count from Europe PMC, fetched 3 Sep 2026. A snapshot refreshed periodically with the corpus, not a live figure.',
    );
  });

  it('still says the count is a snapshot when it carries no date', () => {
    const rec = record({});
    expect(citationCountDate(rec)).toBeNull();
    expect(citationCountNote(rec)).toBe(
      'Citation count from Europe PMC. A snapshot refreshed periodically with the corpus, not a live figure.',
    );
  });

  it('ignores an unparseable date rather than printing it', () => {
    expect(citationCountDate(record({ citation_count_updated: 'not a date' }))).toBeNull();
  });

  it('names an unfamiliar source as stored', () => {
    expect(citationCountNote(record({ citation_source: 'openalex' }))).toContain('from openalex.');
  });
});
