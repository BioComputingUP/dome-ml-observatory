import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { FALLBACK_SCHEMA_VERSION, schemaReleaseUrl } from '../../core/schema-links';

/**
 * Hand-maintained processing-round log, following the same "corpus figures live, narrative
 * hand-written" split as about-overview.ts -- the headline date and counts below come straight
 * from GET /api/stats (never hardcoded, so they can't drift from the database), but there is no
 * runs/batches collection anywhere in this stack to build the per-round cards themselves from,
 * so a new card is added by hand each time a processing round completes.
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
