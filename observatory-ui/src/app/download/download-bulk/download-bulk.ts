import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { CopyButton } from '../../shared/copy-button/copy-button';

/** The permanent identifier for the current corpus release, all-versions record. Kept as a
 *  literal here rather than fetched -- Zenodo DOIs for a dataset deposit are stable once minted
 *  and don't change per app deploy, so there is nothing to fetch this from. */
const ZENODO_DOI = '10.5281/zenodo.22259905';

@Component({
  selector: 'app-download-bulk',
  imports: [RouterLink, DecimalPipe, CopyButton],
  templateUrl: './download-bulk.html',
  styleUrl: './download-bulk.scss',
})
export class DownloadBulk {
  private readonly records = inject(RecordsService);

  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());
  readonly schemaVersion = computed(() => this.stats()?.schema_version ?? '1.1.0');

  readonly zenodoDoi = ZENODO_DOI;
  readonly zenodoUrl = `https://doi.org/${ZENODO_DOI}`;
}
