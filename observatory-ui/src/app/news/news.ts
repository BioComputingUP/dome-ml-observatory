import { Component, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { ContentItem } from './content-item.model';

interface ContentState {
  items: ContentItem[];
  error: string;
}

@Component({
  selector: 'app-news',
  templateUrl: './news.html',
  styleUrl: './news.scss',
})
export class News {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  // Read once, synchronously, rather than subscribing to route.fragment -- this app is zoneless
  // (no zone.js polyfill), so mutating a plain property from an RxJS subscribe callback never
  // triggers a re-render (the exact bug that made contentItems/loading below silently freeze the
  // page on "Loading content..." forever, fixed below via toSignal). showContent() already
  // manages activeSection for every click after this initial read via window.history directly,
  // not through the router, so there's nothing to react to past first paint.
  activeSection = this.route.snapshot.fragment === 'events' ? 'events-section' : 'news-section';

  private readonly contentState = toSignal(
    this.http.get<ContentItem[]>('assets/data/content-items.json').pipe(
      map((items): ContentState => ({ items, error: '' })),
      catchError(() => of<ContentState>({ items: [], error: 'Failed to load content data' })),
    ),
    { initialValue: null },
  );

  readonly loading = computed(() => this.contentState() === null);
  readonly error = computed(() => this.contentState()?.error ?? '');
  readonly newsItems = computed(() =>
    (this.contentState()?.items ?? []).filter((item) => item.type === 'news'),
  );
  readonly eventItems = computed(() =>
    (this.contentState()?.items ?? []).filter((item) => item.type === 'event'),
  );

  showContent(event: Event, contentId: string): void {
    event.preventDefault();
    this.activeSection = contentId;

    const fragment = contentId === 'events-section' ? 'events' : 'news';
    window.history.replaceState({}, '', `/news#${fragment}`);
  }

  isActive(sectionId: string): boolean {
    return this.activeSection === sectionId;
  }
}
