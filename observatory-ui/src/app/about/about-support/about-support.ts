import { Component, afterNextRender, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../../core/records.service';
import { FALLBACK_SCHEMA_VERSION, versionNumber, schemaReleaseUrl } from '../../core/schema-links';

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
  private readonly route = inject(ActivatedRoute);

  constructor() {
    // Deep link support for /about/support#faq (and anyone who bookmarked it). The router is
    // provided bare in app.config.ts -- no withInMemoryScrolling -- so nothing scrolls to a
    // fragment on its own, and afterNextRender is the earliest point the FAQ band exists in the
    // DOM. Read once from the snapshot rather than subscribing: the app is zoneless, and the
    // fragment cannot change without leaving the page. Same approach as news.ts.
    afterNextRender(() => {
      if (this.route.snapshot.fragment === 'faq') this.scrollToFaq();
    });
  }

  /**
   * Scrolls to the FAQ band.
   *
   * The template's `routerLink`/`fragment` pair is what puts a real, copyable /about/support#faq
   * in the address bar; this does the moving. A bare `href="#faq"` cannot be used here at all --
   * index.html declares `<base href="/">`, so a fragment-only URL resolves against the document
   * base rather than the current location, becoming `/#faq`, which the router matches as the
   * empty path and renders Home. The button navigated away from the page it was scrolling.
   */
  jumpToFaq(): void {
    this.scrollToFaq();
  }

  private scrollToFaq(): void {
    document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());

  // versionNumber, not the raw value: /api/stats reports the version WITH a `v` (it reads
  // schema/CURRENT verbatim), and templates here add their own, which rendered `vv1.1.0`.
  readonly schemaVersion = computed(() =>
    versionNumber(this.stats()?.schema_version ?? FALLBACK_SCHEMA_VERSION),
  );
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
