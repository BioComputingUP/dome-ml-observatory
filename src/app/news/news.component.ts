import { Component, OnInit, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ContentItem } from './content-item.model';

@Component({
  selector: 'app-news',
  templateUrl: './news.component.html',
  styleUrls: ['./news.component.scss']
})
export class NewsComponent implements OnInit, AfterViewInit {
  activeSection: string = 'news-section';
  contentItems: ContentItem[] = [];
  loading: boolean = true;
  error: string = '';

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    // Check for hash in URL to set initial active section
    this.route.fragment.subscribe(fragment => {
      if (fragment === 'events') {
        this.activeSection = 'events-section';
      } else if (fragment === 'news') {
        this.activeSection = 'news-section';
      }
    });

    // Load content data
    this.loadContentData();
  }

  ngAfterViewInit() {
    if ((window as any).twttr && (window as any).twttr.widgets) {
      (window as any).twttr.widgets.load();
    }
  }

  loadContentData(): void {
    this.http.get<ContentItem[]>('assets/data/content-items.json')
      .subscribe({
        next: (data) => {
          this.contentItems = data;
          this.loading = false;
        },
        error: (error) => {
          this.error = 'Failed to load content data';
          this.loading = false;
          console.error('Error loading content data', error);
        }
      });
  }

  get newsItems(): ContentItem[] {
    return this.contentItems.filter(item => item.type === 'news');
  }

  get eventItems(): ContentItem[] {
    return this.contentItems.filter(item => item.type === 'event');
  }

  showContent(event: Event, contentId: string): void {
    event.preventDefault();
    this.activeSection = contentId;
    
    // Update URL fragment without causing full page reload
    const fragment = contentId === 'events-section' ? 'events' : 'news';
    window.history.replaceState({}, '', `/news#${fragment}`);
  }

  isActive(sectionId: string): boolean {
    return this.activeSection === sectionId;
  }
}
