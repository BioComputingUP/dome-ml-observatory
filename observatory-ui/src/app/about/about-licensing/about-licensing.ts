import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { FALLBACK_SCHEMA_VERSION, schemaReleaseUrl, schemaVocabUrl } from '../../core/schema-links';

@Component({
  selector: 'app-about-licensing',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './about-licensing.html',
  styleUrl: './about-licensing.scss',
})
export class AboutLicensing {
  private readonly stats = toSignal(
    inject(RecordsService).getFacetStats().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  readonly schemaUrl = computed(() =>
    schemaReleaseUrl(this.stats()?.schema_version ?? FALLBACK_SCHEMA_VERSION),
  );
  readonly vocabUrl = computed(() =>
    schemaVocabUrl(this.stats()?.schema_version ?? FALLBACK_SCHEMA_VERSION),
  );

  /** Share of the corpus whose abstract came from Europe PMC, 0-100, measured live by GET
   *  /api/stats rather than quoted: the page asks readers to cite Europe PMC on the strength of it,
   *  and a remembered figure drifts with every load. Null until the stats answer. */
  readonly europePmcAbstractShare = computed(() => {
    const corpus = this.stats()?.corpus;
    if (!corpus || !corpus.total) return null;
    return (corpus.abstractEuropePmc / corpus.total) * 100;
  });
}
