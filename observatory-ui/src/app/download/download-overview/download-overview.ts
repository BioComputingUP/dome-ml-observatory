import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { FALLBACK_SCHEMA_VERSION, schemaReleaseUrl } from '../../core/schema-links';

@Component({
  selector: 'app-download-overview',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './download-overview.html',
  styleUrl: './download-overview.scss',
})
export class DownloadOverview {
  private readonly records = inject(RecordsService);

  // Same toSignal + catchError(() => of(null)) fallback pattern as download-bulk.ts -- keeps a
  // Mongo hiccup from breaking the page, just showing the last-known/fixture figures instead.
  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());
  readonly schemaVersion = computed(() => this.stats()?.schema_version ?? FALLBACK_SCHEMA_VERSION);
  readonly schemaUrl = computed(() => schemaReleaseUrl(this.schemaVersion()));
}
