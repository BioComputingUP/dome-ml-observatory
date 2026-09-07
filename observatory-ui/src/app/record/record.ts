import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap, catchError, of } from 'rxjs';
import { RecordsService } from '../core/records.service';
import { AiMlRecord, isEnriched } from '../core/record.model';
import { modelTypeLabel } from '../core/facet-labels';
import { articleSources, crossLinkedAssets, CrossLinkedAsset } from '../core/outbound-links';
import { plainText, richAbstract, richTitle } from '../core/rich-text';
import { publicationVenue } from '../core/venue';
import { SearchStateService } from '../core/search-state.service';
import { toBibtex, toRis } from '../core/citation';
import { StatusBadge } from '../shared/status-badge/status-badge';
import { CopyButton } from '../shared/copy-button/copy-button';

/** Groups render in this order when present -- assets a reader is most likely to want first. */
const ASSET_GROUP_ORDER = ['Code', 'Data', 'Models', 'Annotation'] as const;

@Component({
  selector: 'app-record',
  imports: [DecimalPipe, RouterLink, StatusBadge, CopyButton],
  templateUrl: './record.html',
  styleUrl: './record.scss',
})
export class RecordPage {
  private readonly route = inject(ActivatedRoute);
  private readonly records = inject(RecordsService);
  private readonly searchState = inject(SearchStateService);

  readonly loading = signal(true);
  /** True when the last lookup failed for a reason other than "no such record" (a 503, a network
   *  error) -- RecordsService.getByPid() already resolves 404/400 to a plain `undefined`, so
   *  anything reaching this catchError is a genuine outage, not a missing pid. Kept distinct from
   *  `!found()` so the page can tell a reader "try again shortly" instead of "this doesn't exist"
   *  when the record might well exist and Mongo just isn't reachable right now. */
  readonly unavailable = signal(false);

  private readonly record = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('pid') ?? ''),
      switchMap((pid) => {
        this.loading.set(true);
        this.unavailable.set(false);
        return this.records.getByPid(pid).pipe(
          catchError(() => {
            this.unavailable.set(true);
            return of(undefined);
          }),
        );
      }),
      map((record) => {
        this.loading.set(false);
        return record;
      }),
    ),
    { initialValue: undefined },
  );

  readonly found = computed(() => this.record() !== undefined);
  readonly rec = computed(() => this.record() as AiMlRecord);

  /** Returns the reader to the results they came from -- filters, page and sort intact. Empty on a
   *  bookmarked or shared link, which correctly lands on a plain /search. */
  readonly backToSearch = this.searchState.lastSearch;

  /**
   * Corpus titles and abstracts carry markup -- inline emphasis in both, structured-abstract
   * headings and bare repository URLs in abstracts. rich-text.ts normalises that (JATS mapped to
   * HTML, attributes dropped, URLs linkified); binding the plain string with [innerHTML] then lets
   * Angular's own sanitizer run over the result.
   */
  readonly titleHtml = computed(() => richTitle(this.rec().publication_metadata.title));
  readonly titleText = computed(
    () => plainText(this.rec().publication_metadata.title) || 'Untitled record',
  );
  readonly abstractHtml = computed(() => richAbstract(this.rec()?.publication_metadata.abstract));

  // ---- Header metadata: one labelled fact per row, never fused into a single line. -----------
  readonly authors = computed(() => this.rec().publication_metadata.authors);
  /** Journal, or the preprint server for a preprint -- one labelled row either way. The
   *  journal-wins rule and the server lookup both live in core/venue.ts, shared with the result
   *  card so the two can't drift. */
  readonly venue = computed(() => publicationVenue(this.rec()));
  readonly year = computed(() => this.rec().publication_metadata.year);
  /** Europe PMC's citation count. Null means "not available" rather than zero -- no Europe PMC
   *  record answered for this paper's identifiers -- so the fact is omitted entirely in that case,
   *  while a genuine zero renders. Same rule as the result card's. */
  readonly citationCount = computed(() => {
    const count = this.rec().publication_metadata.citation_count;
    return typeof count === 'number' ? count : null;
  });
  /** The Observatory's own persistent identifier for this record -- its `_id`. Belongs at the top
   *  with the rest of the record's identity, not buried in a list of external identifiers. */
  readonly pid = computed(() => this.rec()._id);

  // ---- Article sources and assets ------------------------------------------------------------
  readonly sources = computed(() => articleSources(this.rec()));
  readonly assets = computed(() => crossLinkedAssets(this.rec()));

  /** Assets grouped for display. Empty when nothing is cross-linked, and the template renders no
   *  section at all in that case rather than a wall of "not yet linked" placeholders. */
  readonly assetGroups = computed(() => {
    const assets = this.assets();
    return ASSET_GROUP_ORDER.map((group) => ({
      group,
      items: assets.filter((a: CrossLinkedAsset) => a.group === group),
    })).filter((g) => g.items.length > 0);
  });

  // ---- Access. `null` means "not recorded", which is not the same as "no". -------------------
  readonly access = computed(() => {
    const a = this.rec().source.access;
    const yesNo = (value: boolean | null | undefined, yes: string, no: string) =>
      value == null ? { text: 'Not recorded', tone: 'unknown' } : value
        ? { text: yes, tone: 'positive' }
        : { text: no, tone: 'neutral' };
    return {
      openAccess: yesNo(a.open_access, 'Open access', 'Closed access'),
      fulltext: yesNo(a.fulltext_available, 'Available', 'Not available'),
      licence: a.license
        ? { text: a.license.toUpperCase(), tone: 'positive' }
        : { text: 'Not recorded', tone: 'unknown' },
    };
  });

  // ---- Screening + enrichment ----------------------------------------------------------------
  readonly enriched = computed(() => isEnriched(this.rec()));

  readonly verdict = computed(() => {
    switch (this.rec().llm_classification.classification) {
      case 'positive':
        return 'Classified as an AI/ML methods paper.';
      case 'negative':
        return 'Screened out — not an AI/ML methods paper.';
      default:
        return 'Undeterminable from the available metadata.';
    }
  });

  /** Provenance rows for the screening pass. Rendered inline rather than behind an expander --
   *  "which model decided this, on what criteria, when" is the substance of a machine-made
   *  judgement, not an appendix to it. */
  readonly screeningFacts = computed(() => {
    const c = this.rec().llm_classification;
    return [
      { label: 'Model', value: c.model_id, icon: 'icon-microchip' },
      { label: 'Prompt version', value: c.prompt_version, icon: 'icon-documentation' },
      { label: 'Run at', value: c.timestamp, icon: 'icon-calendar-check' },
      { label: 'Criteria hash', value: c.ruleset_sha256, icon: 'icon-hashtag', mono: true },
    ];
  });

  readonly enrichmentFacts = computed(() => {
    const e = this.rec().llm_enrichment;
    return [
      { label: 'Model', value: e.model_id, icon: 'icon-microchip' },
      { label: 'Prompt version', value: e.prompt_version, icon: 'icon-documentation' },
      { label: 'Run at', value: e.timestamp, icon: 'icon-calendar-check' },
    ];
  });

  readonly enrichmentTags = computed(() => {
    const cf = this.rec().content_filters;
    const tag = (value: string, display = value) => ({ value, display });
    return [
      {
        label: 'Domain (tier 1)',
        values: cf.domain_tier1 ? [tag(cf.domain_tier1)] : [],
        param: 'd1',
      },
      { label: 'Domain (tier 2)', values: cf.domain_tier2.map((v) => tag(v)), param: 'd2' },
      { label: 'Domain (tier 3)', values: cf.domain_tier3.map((v) => tag(v)), param: 'd3' },
      {
        label: 'Learning paradigm',
        values: cf.learning_paradigm.map((v) => tag(v)),
        param: 'para',
      },
      { label: 'Model family', values: cf.model_family.map((v) => tag(v)), param: 'fam' },
      // Display-only title-casing (facet-labels.ts) -- the query param below still routes on
      // the raw value, matching the search page's own Method chips and model_type facet.
      {
        label: 'Model type',
        values: cf.model_type.map((v) => tag(v, modelTypeLabel(v))),
        param: 'mt',
      },
    ].filter((g) => g.values.length);
  });

  /** The placeholder rows an un-enriched record shows, so the section keeps its shape instead of
   *  collapsing to a paragraph. This is the state of the entire corpus today (0 of 827,061 records
   *  are enriched), so it has to look deliberate rather than broken. */
  readonly enrichmentPlaceholders = [
    'Domain (tier 1)',
    'Domain (tier 2)',
    'Learning paradigm',
    'Model family',
    'Model type',
  ];

  readonly citationFormat = signal<'bibtex' | 'ris' | null>(null);

  readonly citationText = computed(() => {
    const format = this.citationFormat();
    if (!format || !this.found()) return '';
    return format === 'bibtex' ? toBibtex(this.rec()) : toRis(this.rec());
  });

  /**
   * Query params that take an enrichment tag back into a filtered search -- every record becomes a
   * way back into the corpus. Built here rather than inline because Angular templates don't
   * support computed object keys.
   *
   * `class: ''` explicitly clears the positive-only default: an enriched tag search should show
   * everything carrying that tag, not silently re-narrow to positives.
   */
  tagQueryParams(param: string, value: string): Record<string, string> {
    return { enriched: 'true', class: '', [param]: value };
  }

  showCitation(format: 'bibtex' | 'ris'): void {
    this.citationFormat.set(this.citationFormat() === format ? null : format);
  }
}
