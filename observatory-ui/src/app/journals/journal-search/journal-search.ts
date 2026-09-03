import { Component, computed, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { JournalsService } from '../../core/journals.service';
import { JournalListRow } from '../../core/journal.model';

/**
 * Single-select journal picker.
 *
 * Modelled on the search page's FacetTypeahead (250ms debounce, switchMap so a slow response can
 * never overwrite a newer one, blur deferred so a click on an option still registers) but
 * deliberately a separate component: FacetTypeahead is a multi-select the facet panel depends on,
 * and this page picks exactly one journal.
 *
 * Backed by /api/journals rather than /api/facets/journal, which returns bare strings -- the
 * ranking rules are the same on both (the endpoint reuses rankFacetMatches), but this one carries
 * each journal's AI/ML paper count, so the reader can tell "Bioinformatics (Oxford, England)" from
 * "Bioinformatics advances" by size rather than by guessing.
 */
@Component({
  selector: 'app-journal-search',
  imports: [DecimalPipe],
  templateUrl: './journal-search.html',
  styleUrl: './journal-search.scss',
})
export class JournalSearch {
  private readonly journals = inject(JournalsService);

  readonly placeholder = input<string>('Search journals by name…');
  readonly selectionChange = output<string>();

  readonly query = signal('');
  readonly open = signal(false);
  readonly loading = signal(false);
  readonly matches = signal<JournalListRow[]>([]);
  /** Keyboard cursor within `matches`; -1 means nothing highlighted. */
  readonly activeIndex = signal(-1);

  private readonly query$ = new Subject<string>();

  readonly hasQuery = computed(() => this.query().trim().length > 0);

  constructor() {
    this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          this.loading.set(true);
          return this.journals
            .list({ q: q.trim() || undefined, limit: 10 })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.loading.set(false);
        this.matches.set(result?.rows ?? []);
        this.activeIndex.set(-1);
      });
  }

  onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.query$.next(value);
  }

  onFocus(): void {
    this.open.set(true);
    // Nothing to show until the first response, so fire one for the current (possibly empty)
    // query -- opening the list on an empty field then offers the largest journals.
    this.query$.next(this.query());
  }

  /** Deferred so a click on an option lands before the list closes. */
  onBlur(): void {
    setTimeout(() => this.open.set(false), 150);
  }

  onKeydown(event: KeyboardEvent): void {
    const matches = this.matches();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!matches.length) return;
      event.preventDefault();
      this.open.set(true);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = (this.activeIndex() + delta + matches.length + 1) % (matches.length + 1);
      this.activeIndex.set(next === matches.length ? -1 : next);
      return;
    }
    if (event.key === 'Enter') {
      const active = matches[this.activeIndex()];
      if (active) {
        event.preventDefault();
        this.select(active.journal);
      }
      return;
    }
    if (event.key === 'Escape') {
      this.open.set(false);
      this.activeIndex.set(-1);
    }
  }

  select(journal: string): void {
    this.query.set('');
    this.open.set(false);
    this.activeIndex.set(-1);
    this.matches.set([]);
    this.selectionChange.emit(journal);
  }
}
