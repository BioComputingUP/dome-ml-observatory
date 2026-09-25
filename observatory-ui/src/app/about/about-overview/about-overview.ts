import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { FALLBACK_SCHEMA_VERSION, schemaReleaseUrl } from '../../core/schema-links';
import { CURRENT_CRITERIA_SHA256, criteriaUrl, promptUrl } from '../../core/curation-criteria';

@Component({
  selector: 'app-about-overview',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './about-overview.html',
  styleUrl: './about-overview.scss',
})
export class AboutOverview {
  private readonly records = inject(RecordsService);

  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());

  readonly schemaUrl = computed(() =>
    schemaReleaseUrl(this.stats()?.schema_version ?? FALLBACK_SCHEMA_VERSION),
  );

  /** The criteria and prompt the corpus is screened with, pinned to the version in use. */
  readonly criteriaUrl = criteriaUrl(CURRENT_CRITERIA_SHA256);
  readonly promptUrl = promptUrl('classification', 'v1');
}
