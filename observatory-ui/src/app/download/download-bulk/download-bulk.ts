import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { embedCorpusCatalog } from '../../core/structured-data';
import { CopyButton } from '../../shared/copy-button/copy-button';
import {
  FALLBACK_SCHEMA_VERSION,
  SCHEMA_CHANGELOG_URL,
  schemaExampleUrl,
  schemaFileUrl,
  schemaReleaseUrl,
  schemaVocabUrl,
  versionNumber,
} from '../../core/schema-links';

/** The permanent identifier for the current corpus release, all-versions record. Kept as a
 *  literal here rather than fetched -- Zenodo DOIs for a dataset deposit are stable once minted
 *  and don't change per app deploy, so there is nothing to fetch this from. */
const ZENODO_DOI = '10.5281/zenodo.22259905';

/** The day the first release's files open on Zenodo. Until then its record and DOI are public and
 *  the page says the files are embargoed; from that day the note disappears by itself. Change it
 *  only if the embargo on Zenodo is changed. */
const ZENODO_EMBARGO_UNTIL = '2026-10-25';

@Component({
  selector: 'app-download-bulk',
  imports: [RouterLink, DecimalPipe, DatePipe, CopyButton],
  templateUrl: './download-bulk.html',
  styleUrl: './download-bulk.scss',
})
export class DownloadBulk {
  private readonly records = inject(RecordsService);

  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());
  // versionNumber, not the raw value: /api/stats reports the version WITH a `v` (it reads
  // schema/CURRENT verbatim), and templates here add their own, which rendered `vv1.1.0`.
  readonly schemaVersion = computed(() =>
    versionNumber(this.stats()?.schema_version ?? FALLBACK_SCHEMA_VERSION),
  );

  // Built from the version the API just reported, not hardcoded, so these links follow a
  // schema bump on their own -- release folders are immutable and cut before CURRENT moves.
  readonly schemaUrl = computed(() => schemaReleaseUrl(this.schemaVersion()));
  readonly schemaFile = computed(() => schemaFileUrl(this.schemaVersion()));
  readonly schemaExample = computed(() => schemaExampleUrl(this.schemaVersion()));
  readonly schemaVocab = computed(() => schemaVocabUrl(this.schemaVersion()));
  readonly schemaChangelog = SCHEMA_CHANGELOG_URL;

  readonly zenodoDoi = ZENODO_DOI;
  readonly zenodoUrl = `https://doi.org/${ZENODO_DOI}`;
  readonly embargoUntil = ZENODO_EMBARGO_UNTIL;
  /** ISO dates compare correctly as strings; UTC, like Zenodo's embargo. (The template formats the
   *  date without a timezone: DatePipe reads a bare date as local midnight, and formatting that in
   *  UTC would show the day before.) */
  readonly embargoed = new Date().toISOString().slice(0, 10) < ZENODO_EMBARGO_UNTIL;

  constructor() {
    // The corpus catalogue does not name ZENODO_DOI yet: the sister repository's
    // build_release_metadata.py adds the Zenodo version as a distribution in a later release.
    embedCorpusCatalog();
  }
}
