import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AboutProcessing } from './about-processing';
import { RecordsService } from '../../core/records.service';
import type { CorpusStats, FacetStats } from '../../core/facet-stats.model';
import {
  CLASSIFICATION_ROUNDS,
  ENRICHMENT_ROUNDS,
  type ClassificationRound,
  type EnrichmentRound,
  roundTotal,
} from './processing-rounds';

/**
 * The processing history is provenance, so these assert on what a visitor reads: each card carries
 * its own round's figures, never the live corpus total (which would count every later round into
 * round 1), and the round log itself is well-formed.
 */
const LIVE: CorpusStats = {
  total: 999_999,
  positive: 400_000,
  negative: 590_000,
  undeterminable: 9_999,
  openAccess: 0,
  fulltextAvailable: 0,
  enriched: 4_000,
};

describe('AboutProcessing', () => {
  let root: HTMLElement;

  beforeEach(async () => {
    const stats = {
      corpus: LIVE,
      last_classification: { timestamp: '2026-09-15T21:00:00Z', enriched_timestamp: null },
      schema_version: '1.6.0',
    } as unknown as FacetStats;

    await TestBed.configureTestingModule({
      imports: [AboutProcessing],
      providers: [
        provideRouter([]),
        { provide: RecordsService, useValue: { getFacetStats: () => of(stats), getStats: () => LIVE } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AboutProcessing);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders one card per classification round, each with its own total', () => {
    const cards = root.querySelectorAll('.band-tint .round-card');
    expect(cards.length).toBe(CLASSIFICATION_ROUNDS.length);
    CLASSIFICATION_ROUNDS.forEach((round, i) => {
      const text = cards[i].textContent ?? '';
      expect(text).toContain(round.title);
      expect(text).toContain(roundTotal(round.outcome).toLocaleString('en-US'));
      expect(text).not.toContain(LIVE.total.toLocaleString('en-US'));
    });
  });

  it('shows the live enrichment coverage whether or not a batch is logged', () => {
    expect(root.textContent).toContain(`${LIVE.enriched.toLocaleString('en-US')} of`);
  });

  it('logs each enrichment round, and says so only while none has run', () => {
    // Scoped to the enrichment section: the "Last enriched" pill above it also reads "Not yet run"
    // whenever the API has no enrichment date, which is a different statement.
    const band = [...root.querySelectorAll('.band')].find(
      (b) => b.querySelector('h2')?.textContent?.includes('Enrichment'),
    );
    const text = band?.textContent ?? '';
    expect(text.includes('Not yet run')).toBe(ENRICHMENT_ROUNDS.length === 0);
    ENRICHMENT_ROUNDS.forEach((round) => {
      expect(text).toContain(round.title);
      expect(text).toContain(round.records.toLocaleString('en-US'));
    });
  });
});

describe('processing rounds log', () => {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const wellFormed = (rounds: readonly (ClassificationRound | EnrichmentRound)[]) => {
    rounds.forEach((round, i) => {
      expect(round.number).toBe(i + 1);
      expect(round.started).toMatch(iso);
      expect(round.finished).toMatch(iso);
      expect(round.finished >= round.started).toBe(true);
      expect(round.model.trim().length).toBeGreaterThan(0);
      if (i > 0) {
        expect(round.started >= rounds[i - 1].started).toBe(true);
      }
    });
  };

  it('numbers classification rounds in the order they ran, with dates and a model', () => {
    wellFormed(CLASSIFICATION_ROUNDS);
    CLASSIFICATION_ROUNDS.forEach((round) => expect(roundTotal(round.outcome)).toBeGreaterThan(0));
  });

  it('numbers enrichment rounds in the order they ran, with dates, a model and a size', () => {
    wellFormed(ENRICHMENT_ROUNDS);
    ENRICHMENT_ROUNDS.forEach((round) => expect(round.records).toBeGreaterThan(0));
  });
});
