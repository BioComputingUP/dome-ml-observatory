import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { FALLBACK_SCHEMA_VERSION, schemaReleaseUrl } from '../../core/schema-links';

/** Where issues are filed. `?template=` opens the form directly rather than the chooser, so a
 *  card that says "report a wrong record" lands on the record-correction form and not a menu. */
const ISSUES = 'https://github.com/BioComputingUP/dome-ml-observatory/issues';

/**
 * The one page that answers "how do I get help, and who reads it".
 *
 * Two halves, deliberately: the support channels themselves, and an FAQ covering the behaviours
 * that surprise people. The FAQ is not decoration -- search here is genuinely non-obvious (authors
 * indexed as surname plus initials, the default search space being the positives rather than the
 * whole corpus) and nothing else on the site explains it, so a reader who does not find this page
 * concludes the search is broken rather than that it works differently than they assumed.
 *
 * Corpus figures come from GET /api/stats, never hardcoded -- the same split about-overview.ts and
 * about-processing.ts use, so the numbers quoted in an answer cannot drift from the database.
 */
@Component({
  selector: 'app-about-support',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './about-support.html',
  styleUrl: './about-support.scss',
})
export class AboutSupport {
  private readonly records = inject(RecordsService);

  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());

  readonly schemaVersion = computed(() => this.stats()?.schema_version ?? FALLBACK_SCHEMA_VERSION);
  readonly schemaUrl = computed(() => schemaReleaseUrl(this.schemaVersion()));

  readonly issuesUrl = ISSUES;
  readonly recordIssueUrl = `${ISSUES}/new?template=record-correction.yml`;
  readonly searchIssueUrl = `${ISSUES}/new?template=search-help.yml`;
  readonly bugIssueUrl = `${ISSUES}/new?template=site-bug.yml`;
  readonly questionIssueUrl = `${ISSUES}/new?template=question.yml`;

  /** Reviewed by hand whenever an answer below changes -- there is nothing to derive it from. */
  readonly lastUpdated = '2026-09-03';
  readonly maintainer = 'BioComputing UP, University of Padua';
}
