import { Component, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ContentItem } from './content-item.model';

@Component({
  selector: 'app-news',
  templateUrl: './news.html',
  styleUrl: './news.scss',
})
export class News implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  activeSection = 'news-section';
  contentItems: ContentItem[] = [];
  loading = true;
  error = '';

  ngOnInit(): void {
    this.route.fragment.subscribe((fragment) => {
      if (fragment === 'events') {
        this.activeSection = 'events-section';
      } else if (fragment === 'news') {
        this.activeSection = 'news-section';
      }
    });

    this.loadContentData();
  }

  loadContentData(): void {
    this.http.get<ContentItem[]>('assets/data/content-items.json').subscribe({
      next: (data) => {
        this.contentItems = data;
        this.loading = false;
      },
      error: (error) => {
        this.error = 'Failed to load content data';
        this.loading = false;
        console.error('Error loading content data', error);
      },
    });
  }

  get newsItems(): ContentItem[] {
    return this.contentItems.filter((item) => item.type === 'news');
  }

  get eventItems(): ContentItem[] {
    return this.contentItems.filter((item) => item.type === 'event');
  }

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
