import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { RecordsService } from './records.service';

export const SITE_TITLE = 'DOME Observatory';

/** The JSON string escape for "<". Built from its code point so no tool along the way can turn the
 *  escape back into the character it stands for. */
const ESCAPED_LESS_THAN = `${String.fromCharCode(92)}u003c`;

export interface PageDescription {
  /** The page's own title; the site name is appended. */
  title: string;
  description?: string;
  /** Path of the page's canonical URL on this origin, e.g. /record/<pid>. */
  canonicalPath?: string;
  /** Ask search engines not to index the page. */
  noindex?: boolean;
}

/**
 * The document-head metadata crawlers and link previews read: title, description, canonical link,
 * robots directive, and JSON-LD blocks keyed by what they describe.
 *
 * The site is client-rendered, so all of this exists only once the app has run. Google renders
 * JavaScript and reads it; clients that do not are served the same metadata by nginx (Signposting
 * Link headers, JSON-LD on `Accept: application/ld+json`) and the sitemap.
 *
 * A JSON-LD `<script>` is a data block, not a script: the CSP's script-src does not apply to it.
 */
@Injectable({ providedIn: 'root' })
export class StructuredData {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  describePage(page: PageDescription): void {
    this.title.setTitle(page.title ? `${page.title} · ${SITE_TITLE}` : SITE_TITLE);
    if (page.description) {
      this.meta.updateTag({ name: 'description', content: page.description });
    } else {
      this.meta.removeTag('name="description"');
    }
    if (page.noindex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    } else {
      this.meta.removeTag('name="robots"');
    }
    this.setCanonical(page.canonicalPath);
  }

  /** Back to the site defaults: the static title, no description, canonical link or robots tag, and
   *  no JSON-LD. */
  resetPage(): void {
    this.describePage({ title: '' });
    for (const script of Array.from(this.jsonLdScripts())) script.remove();
  }

  /** Adds or replaces the JSON-LD block for `key`. */
  setJsonLd(key: string, data: object): void {
    let script = Array.from(this.jsonLdScripts()).find((s) => s.dataset['structuredData'] === key);
    if (!script) {
      script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset['structuredData'] = key;
      this.document.head.appendChild(script);
    }
    // A "</script" inside a string value would end the element early; escaped, it stays JSON.
    script.textContent = JSON.stringify(data).replace(/</g, ESCAPED_LESS_THAN);
  }

  removeJsonLd(key: string): void {
    for (const script of Array.from(this.jsonLdScripts())) {
      if (script.dataset['structuredData'] === key) script.remove();
    }
  }

  private jsonLdScripts(): NodeListOf<HTMLScriptElement> {
    return this.document.head.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"][data-structured-data]',
    );
  }

  private setCanonical(path: string | undefined): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!path) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = new URL(path, this.document.location.origin).href;
  }
}

/**
 * Embeds the corpus catalogue (GET /api/catalog, DCAT / schema.org) for as long as the calling
 * component lives -- the home and bulk-download pages. Call from a constructor. Nothing happens
 * when no release metadata is published.
 */
export function embedCorpusCatalog(): void {
  const structuredData = inject(StructuredData);
  inject(RecordsService)
    .getCatalog()
    .pipe(takeUntilDestroyed())
    .subscribe((catalog) => {
      if (catalog) structuredData.setJsonLd('catalog', catalog);
    });
  inject(DestroyRef).onDestroy(() => structuredData.removeJsonLd('catalog'));
}
