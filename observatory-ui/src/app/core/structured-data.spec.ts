import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { RecordsService } from './records.service';
import { SITE_TITLE, StructuredData } from './structured-data';

describe('StructuredData', () => {
  let service: StructuredData;
  let doc: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StructuredData);
    doc = TestBed.inject(DOCUMENT);
    service.resetPage();
  });

  const scripts = () => doc.head.querySelectorAll('script[type="application/ld+json"]');

  it('describes a page: title, description, canonical link and robots directive', () => {
    service.describePage({
      title: 'A paper',
      description: 'What it is about.',
      canonicalPath: '/record/abc',
      noindex: true,
    });
    expect(doc.title).toBe(`A paper · ${SITE_TITLE}`);
    expect(doc.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'What it is about.',
    );
    expect(doc.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toMatch(
      /\/record\/abc$/,
    );

    service.describePage({ title: 'Another', canonicalPath: '/record/def' });
    expect(doc.head.querySelector('meta[name="robots"]')).toBeNull();
    expect(doc.head.querySelector('meta[name="description"]')).toBeNull();
    expect(doc.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });

  it('keeps one JSON-LD block per key, and escapes < so a value cannot close the script', () => {
    const hostile = { name: '</script><script>alert(1)</script>' };
    service.setJsonLd('record', { name: 'first' });
    service.setJsonLd('record', hostile);
    service.setJsonLd('catalog', { name: 'corpus' });

    expect(scripts()).toHaveLength(2);
    const record = Array.from(scripts()).find(
      (s) => (s as HTMLScriptElement).dataset['structuredData'] === 'record',
    );
    expect(record?.textContent).not.toContain('<');
    expect(JSON.parse(record?.textContent ?? '')).toEqual(hostile);
  });

  it('removes a block by key, and resets the page to the site defaults', () => {
    service.setJsonLd('record', { a: 1 });
    service.setJsonLd('catalog', { b: 2 });
    service.removeJsonLd('record');
    expect(scripts()).toHaveLength(1);

    service.describePage({ title: 'X', canonicalPath: '/x', noindex: true });
    service.resetPage();
    expect(doc.title).toBe(SITE_TITLE);
    expect(scripts()).toHaveLength(0);
    expect(doc.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

describe('RecordsService metadata requests', () => {
  let records: RecordsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    records = TestBed.inject(RecordsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches a record’s JSON-LD, and treats any failure as nothing to embed', async () => {
    const ok = firstValueFrom(records.getRecordJsonLd('a b'));
    http.expectOne('/api/records/a%20b/jsonld').flush({ '@graph': [] });
    expect(await ok).toEqual({ '@graph': [] });

    const failed = firstValueFrom(records.getRecordJsonLd('x'));
    http.expectOne('/api/records/x/jsonld').flush('down', { status: 503, statusText: 'Unavailable' });
    expect(await failed).toBeUndefined();
  });

  it('fetches the catalogue once per session', async () => {
    const first = firstValueFrom(records.getCatalog());
    http.expectOne('/api/catalog').flush({ '@graph': ['corpus'] });
    expect(await first).toEqual({ '@graph': ['corpus'] });
    expect(await firstValueFrom(records.getCatalog())).toEqual({ '@graph': ['corpus'] });
    http.expectNone('/api/catalog');
  });
});
