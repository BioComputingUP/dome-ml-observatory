import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, shareReplay, throwError } from 'rxjs';
import { JournalDetailResult, JournalListResult, JournalSort } from './journal.model';

export interface JournalListOptions {
  q?: string;
  sort?: JournalSort;
  limit?: number;
  minScreened?: number;
}

/** Bound on remembered journal details -- enough for a whole browsing session, small enough
 *  that the cache can never grow meaningfully. Oldest-out past it, as observatory-ws's
 *  TtlCache does. */
const DETAIL_CACHE_MAX = 20;

/**
 * Per-journal corpus figures and trends.
 *
 * Both endpoints are served from an in-memory table on the backend (rebuilt at most once a
 * day), so the SERVER cost of a repeat is ~15ms -- but the round trip is 0.3-0.5s (measured
 * 2026-09-28; the network floor to /api/health is ~0.4s), and the journals page refetched both
 * calls on every navbar visit. So repeats are cached for the session, the same
 * shareReplay({refCount: false}) pattern as RecordsService.facetStats$: leaving the page and
 * coming back costs nothing, and a full reload picks up the server's daily rebuild.
 *
 * The typeahead's `q` lookups stay uncached -- they genuinely change per keystroke. An errored
 * request is evicted before it can be replayed, so a retry is a real request.
 */
@Injectable({ providedIn: 'root' })
export class JournalsService {
  private readonly http = inject(HttpClient);
  private readonly listCache = new Map<string, Observable<JournalListResult>>();
  private readonly detailCache = new Map<string, Observable<JournalDetailResult | undefined>>();

  list(options: JournalListOptions = {}): Observable<JournalListResult> {
    const params: Record<string, string> = {};
    if (options.q) params['q'] = options.q;
    if (options.sort) params['sort'] = options.sort;
    if (options.limit !== undefined) params['limit'] = String(options.limit);
    if (options.minScreened !== undefined) params['minScreened'] = String(options.minScreened);

    if (options.q) return this.http.get<JournalListResult>('/api/journals', { params });

    const key = `${options.sort ?? ''}|${options.limit ?? ''}|${options.minScreened ?? ''}`;
    let cached = this.listCache.get(key);
    if (!cached) {
      cached = this.http.get<JournalListResult>('/api/journals', { params }).pipe(
        // Before shareReplay on purpose: an error must never be replayed to a later
        // subscriber. Evicting here means the next call builds a fresh request.
        catchError((err: unknown) => {
          this.listCache.delete(key);
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.listCache.set(key, cached);
    }
    return cached;
  }

  /** A journal the table doesn't know (404) resolves to `undefined` rather than erroring -- the
   *  page treats "no such journal" as a normal state (a stale link, a hand-edited URL) and shows
   *  its own message, the same contract RecordsService.getByPid uses. Not-found is a stable
   *  answer within the session and is cached like a hit; real failures propagate and evict. */
  detail(journal: string): Observable<JournalDetailResult | undefined> {
    let cached = this.detailCache.get(journal);
    if (!cached) {
      cached = this.http
        .get<JournalDetailResult>('/api/journals/detail', { params: { journal } })
        .pipe(
          catchError((err: HttpErrorResponse) => {
            if (err.status === 404 || err.status === 400) return of(undefined);
            this.detailCache.delete(journal);
            return throwError(() => err);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
      if (this.detailCache.size >= DETAIL_CACHE_MAX) {
        // Map iterates in insertion order, so the first key is the oldest.
        const oldest = this.detailCache.keys().next().value;
        if (oldest !== undefined) this.detailCache.delete(oldest);
      }
      this.detailCache.set(journal, cached);
    }
    return cached;
  }
}
