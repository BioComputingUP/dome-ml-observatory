import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { FALLBACK_SCHEMA_VERSION, schemaReleaseUrl } from '../../core/schema-links';
import { CURRENT_CRITERIA_SHA256, criteriaUrl, promptUrl } from '../../core/curation-criteria';
import { CLASSIFICATION_ROUNDS, CORRECTIONS, ENRICHMENT_ROUNDS, roundTotal } from './processing-rounds';

/**
 * Hand-maintained processing-round log, following the same "corpus figures live, narrative
 * hand-written" split as about-overview.ts -- the headline dates and the enrichment coverage come
 * straight from GET /api/stats (never hardcoded, so they can't drift from the database). There is
 * no runs/batches collection anywhere in this stack to build the per-round cards from, so each
 * round is an entry in processing-rounds.ts, appended when the round completes and carrying that
 * round's own figures: a card never shows the live corpus total, which would count every later
 * round into it.
 */
@Component({
  selector: 'app-about-processing',
  imports: [DecimalPipe, DatePipe, RouterLink],
  templateUrl: './about-processing.html',
  styleUrl: './about-processing.scss',
})
export class AboutProcessing {
  private readonly records = inject(RecordsService);

  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  // Newest first: the log is kept oldest-first (processing-rounds.ts appends), but a reader wants
  // the latest round, which is also the only one the template opens by default.
  readonly classificationRounds = [...CLASSIFICATION_ROUNDS].reverse();
  readonly enrichmentRounds = [...ENRICHMENT_ROUNDS].reverse();
  readonly corrections = [...CORRECTIONS].reverse();
  readonly roundTotal = roundTotal;
  /** Each round links the prompt version it ran to that prompt file, pinned (core/curation-criteria.ts). */
  readonly promptUrl = promptUrl;
  readonly criteriaUrl = criteriaUrl(CURRENT_CRITERIA_SHA256);

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());
  readonly lastClassifiedAt = computed(() => this.stats()?.last_classification?.timestamp ?? null);
  readonly lastEnrichedAt = computed(() => this.stats()?.last_classification?.enriched_timestamp ?? null);

  readonly schemaUrl = computed(() =>
    schemaReleaseUrl(this.stats()?.schema_version ?? FALLBACK_SCHEMA_VERSION),
  );

  readonly enrichedPercent = computed(() => {
    const { enriched, positive } = this.corpus();
    return positive > 0 ? Math.round((enriched / positive) * 100) : 0;
  });
}
