import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, shareReplay, throwError } from 'rxjs';
import {
  DataOverview,
  JournalModelProfile,
  ModelsOverview,
  ResourceDetail,
} from './insights.model';

/** Bound on remembered lookups (a journal's profile, a resource's detail), oldest out. */
const LOOKUP_CACHE_MAX = 20;

/**
 * The Data and Models pages' figures. Both are served from in-memory tables on the backend, so
 * the cost of a repeat is the round trip; each answer is cached for the session with the same
 * evict-on-error shareReplay JournalsService uses, so switching between the two tabs and back
 * costs nothing and a full reload picks up the server's daily rebuild.
 *
 * A lookup the backend does not know (404) resolves to `undefined`, as JournalsService.detail
 * does: a stale link to a journal or resource is a normal state the page explains.
 */
@Injectable({ providedIn: 'root' })
export class InsightsService {
  private readonly http = inject(HttpClient);
  private models$?: Observable<ModelsOverview>;
  private data$?: Observable<DataOverview>;
  private readonly journals = new Map<string, Observable<JournalModelProfile | undefined>>();
  private readonly resources = new Map<string, Observable<ResourceDetail | undefined>>();

  models(): Observable<ModelsOverview> {
    this.models$ ??= this.http.get<ModelsOverview>('/api/insights/models').pipe(
      catchError((err: unknown) => {
        this.models$ = undefined;
        return throwError(() => err);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.models$;
  }

  data(): Observable<DataOverview> {
    this.data$ ??= this.http.get<DataOverview>('/api/insights/data').pipe(
      catchError((err: unknown) => {
        this.data$ = undefined;
        return throwError(() => err);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.data$;
  }

  journal(name: string): Observable<JournalModelProfile | undefined> {
    return this.lookup(this.journals, name, () =>
      this.http.get<JournalModelProfile>('/api/insights/models', { params: { journal: name } }),
    );
  }

  resource(slug: string): Observable<ResourceDetail | undefined> {
    return this.lookup(this.resources, slug, () =>
      this.http.get<ResourceDetail>('/api/insights/data', { params: { resource: slug } }),
    );
  }

  private lookup<T>(
    cache: Map<string, Observable<T | undefined>>,
    key: string,
    fetch: () => Observable<T>,
  ): Observable<T | undefined> {
    let cached = cache.get(key);
    if (!cached) {
      cached = fetch().pipe(
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) return of(undefined);
          cache.delete(key);
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      if (cache.size >= LOOKUP_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, cached);
    }
    return cached;
  }
}
