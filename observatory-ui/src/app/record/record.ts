import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap, catchError, of } from 'rxjs';
import { RecordsService } from '../core/records.service';
import { AiMlRecord, isEnriched } from '../core/record.model';
import { modelTypeLabel } from '../core/facet-labels';
import { outboundLinks, plannedLinks } from '../core/outbound-links';
import { toBibtex, toRis } from '../core/citation';
import { StatusBadge } from '../shared/status-badge/status-badge';
import { OutboundLinkItem } from '../shared/outbound-link/outbound-link';
import { CopyButton } from '../shared/copy-button/copy-button';

@Component({
  selector: 'app-record',
  imports: [RouterLink, StatusBadge, OutboundLinkItem, CopyButton],
  templateUrl: './record.html',
  styleUrl: './record.scss',
})
export class RecordPage {
  private readonly route = inject(ActivatedRoute);
  private readonly records = inject(RecordsService);
  private readonly sanitizer = inject(DomSanitizer);

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

  readonly meta = computed(() => {
    const pm = this.rec().publication_metadata;
    return [pm.journal, pm.year?.toString()].filter(Boolean).join(' · ');
  });

  /**
   * Corpus abstracts carry structural markup ("<h4>Background</h4>"), so rendering it keeps the
   * structure the authors wrote. Angular's sanitizer strips anything executable first -- this is
   * curated corpus text, not user input, but sanitising costs nothing and removes the question.
   */
  readonly abstractHtml = computed<SafeHtml | null>(() => {
    const abstract = this.rec()?.publication_metadata.abstract;
    return abstract ? this.sanitizer.bypassSecurityTrustHtml(abstract) : null;
  });

  readonly links = computed(() => outboundLinks(this.rec()));
  readonly planned = computed(() => plannedLinks(this.rec()));
  readonly enriched = computed(() => isEnriched(this.rec()));

  readonly identifiers = computed(() => {
    const ids = this.rec().identifiers;
    return [
      { label: 'PID', value: this.rec()._id },
      { label: 'DOI', value: ids.doi },
      { label: 'PMID', value: ids.pmid },
      { label: 'PMCID', value: ids.pmcid },
    ].filter((i): i is { label: string; value: string } => !!i.value);
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

  readonly showProvenance = signal(false);
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
