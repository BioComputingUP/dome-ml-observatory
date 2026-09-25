import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Search } from './search';

/** The box's 500ms debounce is real time here (no fake zone): a pause is a pause. */
const PAUSE_MS = 650;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Search box', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Search],
      providers: [provideRouter([{ path: '', component: Search }]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  function setup() {
    const fixture = TestBed.createComponent(Search);
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input#q') as HTMLInputElement;
    const router = TestBed.inject(Router);
    const urlQ = () => router.parseUrl(router.url).queryParams['q'] as string | undefined;
    return { fixture, input, router, urlQ };
  }

  function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }): Promise<void> {
    await sleep(PAUSE_MS);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('keeps a trailing space through the debounce, so the next word does not run on', async () => {
    const { fixture, input, urlQ } = setup();

    type(input, 'random ');
    await settle(fixture);

    expect(urlQ()).toBe('random');
    // The URL trims; the box must not, or "forest" lands as "randomforest".
    expect(input.value).toBe('random ');

    type(input, 'random forest');
    await settle(fixture);

    expect(urlQ()).toBe('random forest');
    expect(input.value).toBe('random forest');
  });

  it('does not navigate when a pause leaves the trimmed text equal to the URL', async () => {
    const { fixture, input, router, urlQ } = setup();
    type(input, 'dome');
    await settle(fixture);
    expect(urlQ()).toBe('dome');
    const spy = vi.spyOn(router, 'navigate');

    type(input, 'dome ');
    await settle(fixture);

    expect(spy).not.toHaveBeenCalled();
    expect(input.value).toBe('dome ');
  });

  it('rewrites the box when the URL changes behind it (back/forward, a shared link)', async () => {
    const { fixture, input, router } = setup();

    await router.navigate([], { queryParams: { q: 'alphafold' } });
    await settle(fixture);

    expect(input.value).toBe('alphafold');
  });

  it('empties the box on "Clear all" and does not re-run the cleared search afterwards', async () => {
    const { fixture, input, urlQ } = setup();
    type(input, 'dome');
    await settle(fixture);
    expect(urlQ()).toBe('dome');

    // Typed but not yet debounced when Clear all is pressed.
    type(input, 'dome copilot');
    fixture.componentInstance.clearAll();
    await settle(fixture);

    expect(urlQ()).toBeUndefined();
    expect(input.value).toBe('');
    await settle(fixture);
    expect(urlQ()).toBeUndefined();
  });

  it('searches the same text again after it was cleared', async () => {
    const { fixture, input, urlQ } = setup();
    type(input, 'dome');
    await settle(fixture);
    fixture.componentInstance.clearAll();
    await settle(fixture);
    expect(urlQ()).toBeUndefined();

    type(input, 'dome');
    await settle(fixture);

    expect(urlQ()).toBe('dome');
  });
});

describe('Search tips', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Search],
      providers: [provideRouter([{ path: '', component: Search }]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  function tips(): HTMLDetailsElement {
    const fixture = TestBed.createComponent(Search);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('details.search-tips') as HTMLDetailsElement;
  }

  it('starts closed, so the rules do not take over the header on every visit', () => {
    const details = tips();
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
  });

  it('links to the searching group of the Support FAQ', () => {
    const link = Array.from(tips().querySelectorAll('a')).find((a) => a.textContent?.includes('FAQ'));
    expect(link?.getAttribute('href')).toBe('/about/support#faq-searching');
  });
});
