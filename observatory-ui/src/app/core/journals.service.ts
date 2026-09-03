import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { JournalDetailResult, JournalListResult, JournalSort } from './journal.model';

export interface JournalListOptions {
  q?: string;
  sort?: JournalSort;
  limit?: number;
  minScreened?: number;
}

/**
 * Per-journal corpus figures and trends.
 *
 * Both endpoints are served from an in-memory table on the backend (rebuilt at most once a day),
 * so these are cheap calls -- no caching or shareReplay here, unlike vocab/stats: the journal
 * selection genuinely changes per request, and a repeat is ~15ms.
 */
@Injectable({ providedIn: 'root' })
export class JournalsService {
  private readonly http = inject(HttpClient);

  list(options: JournalListOptions = {}): Observable<JournalListResult> {
    const params: Record<string, string> = {};
    if (options.q) params['q'] = options.q;
    if (options.sort) params['sort'] = options.sort;
    if (options.limit !== undefined) params['limit'] = String(options.limit);
    if (options.minScreened !== undefined) params['minScreened'] = String(options.minScreened);
    return this.http.get<JournalListResult>('/api/journals', { params });
  }

  /** A journal the table doesn't know (404) resolves to `undefined` rather than erroring -- the
   *  page treats "no such journal" as a normal state (a stale link, a hand-edited URL) and shows
   *  its own message, the same contract RecordsService.getByPid uses. Real failures propagate. */
  detail(journal: string): Observable<JournalDetailResult | undefined> {
    return this.http
      .get<JournalDetailResult>('/api/journals/detail', { params: { journal } })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404 || err.status === 400) return of(undefined);
          return throwError(() => err);
        }),
      );
  }
}
