import { Injectable, signal } from '@angular/core';
import { Params } from '@angular/router';

/**
 * Remembers the query string of the last search, so a record page can send the reader back to the
 * results they came from rather than to an empty search.
 *
 * The search page keeps its whole state in the URL (see search-params.ts), so one `Params` object
 * is the entire thing -- free text, every filter, the page number and the sort. Previously "Back to
 * search" was a bare routerLink="/search", which threw all of it away: a reader who had filtered to
 * 2020+ open-access papers, paged to 4 and opened a record landed back at an unfiltered page 1.
 *
 * Deliberately in-memory and not persisted. It exists to make in-app navigation feel right; a
 * bookmarked or shared record URL has no search behind it, and the back link correctly falls back
 * to a plain /search there.
 */
@Injectable({ providedIn: 'root' })
export class SearchStateService {
  private readonly params = signal<Params>({});

  /** Called by the search page whenever the results it is showing change. */
  remember(params: Params): void {
    this.params.set(params);
  }

  /** Query params for the "back to search" link -- empty when this session has not searched yet. */
  readonly lastSearch = this.params.asReadonly();
}
