import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { InsightsLayout } from './insights-layout/insights-layout';
import { DataPage } from './data-page/data-page';
import { ModelsPage } from './models-page/models-page';
import { InsightsService } from '../core/insights.service';
import { Navbar } from '../navbar/navbar';
import { dataFixture, modelsFixture, resourceRow } from './insights-fixtures.spec-helper';
import { liftColor } from '../shared/viz';

function setup(): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          component: InsightsLayout,
          children: [
            { path: 'data', component: DataPage },
            { path: 'models', component: ModelsPage },
          ],
        },
        { path: 'search', children: [] },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('InsightsService', () => {
  let http: HttpTestingController;
  beforeEach(() => (http = setup()));
  afterEach(() => http.verify());

  it('fetches the overview once per session', async () => {
    const service = TestBed.inject(InsightsService);
    const a = firstValueFrom(service.models());
    http.expectOne('/api/insights/models').flush(modelsFixture());
    await a;
    await firstValueFrom(service.models());
    http.expectNone('/api/insights/models');
  });

  it('evicts a failed overview so a retry is a real request', async () => {
    const service = TestBed.inject(InsightsService);
    const failed = firstValueFrom(service.data());
    http.expectOne('/api/insights/data').flush('', { status: 503, statusText: 'down' });
    await expect(failed).rejects.toBeTruthy();
    const retry = firstValueFrom(service.data());
    http.expectOne('/api/insights/data').flush(dataFixture());
    expect((await retry).scope.linking).toBe(120);
  });

  it('turns an unknown journal or resource into undefined', async () => {
    const service = TestBed.inject(InsightsService);
    const j = firstValueFrom(service.journal('Nope'));
    http.expectOne((r) => r.url === '/api/insights/models' && r.params.get('journal') === 'Nope').flush('', { status: 404, statusText: 'nf' });
    expect(await j).toBeUndefined();
    const r = firstValueFrom(service.resource('nope'));
    http.expectOne((req) => req.params.get('resource') === 'nope').flush('', { status: 404, statusText: 'nf' });
    expect(await r).toBeUndefined();
  });
});

describe('Models page', () => {
  let http: HttpTestingController;
  beforeEach(() => (http = setup()));
  afterEach(() => http.verify());

  it("shows '—' until the API answers, then every section", async () => {
    const harness = await RouterTestingHarness.create('/models');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.stat-pill-value')?.textContent?.trim()).toBe('—');

    http.expectOne('/api/insights/models').flush(modelsFixture());
    harness.detectChanges();
    expect(el.querySelector('.stat-pill-value')?.textContent?.trim()).toBe('400');
    expect(el.textContent).toContain('40%');
    for (const id of ['families-h', 'use-h', 'para-h', 'types-h', 'journals-h', 'domains-h']) {
      expect(el.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(el.querySelectorAll('app-small-multiples .panel').length).toBe(3);
    expect(el.textContent).toContain('Gaining ground');
  });

  it('links a family panel to enriched papers in that family', async () => {
    const harness = await RouterTestingHarness.create('/models');
    http.expectOne('/api/insights/models').flush(modelsFixture());
    harness.detectChanges();
    const link = (harness.routeNativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.panel-title');
    expect(link?.getAttribute('href')).toBe('/search?fam=deep%20learning&enriched=true');
  });

  it('links a journal cell with the journal and family as separate repeated-safe params', async () => {
    const harness = await RouterTestingHarness.create('/models');
    http.expectOne('/api/insights/models').flush(modelsFixture());
    harness.detectChanges();
    const cell = (harness.routeNativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.heat-cell');
    const href = cell?.getAttribute('href') ?? '';
    expect(href).toContain('jrnl=Bioinformatics%20(Oxford,%20England)');
    expect(href).toContain('fam=deep%20learning');
    expect(href).toContain('enriched=true');
  });

  it('looks up a journal named in ?j= and says when it has no model details', async () => {
    const harness = await RouterTestingHarness.create('/models?j=Nope');
    http.expectOne('/api/insights/models').flush(modelsFixture());
    http.expectOne((r) => r.params.get('journal') === 'Nope').flush('', { status: 404, statusText: 'nf' });
    harness.detectChanges();
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('No paper from Nope has model details yet');
  });

  it('offers a retry when the API is down', async () => {
    const harness = await RouterTestingHarness.create('/models');
    http.expectOne('/api/insights/models').flush('', { status: 503, statusText: 'down' });
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('could not be loaded');
    (el.querySelector('.ins-state button') as HTMLButtonElement).click();
    http.expectOne('/api/insights/models').flush(modelsFixture());
    harness.detectChanges();
    expect(el.querySelector('#families-h')).not.toBeNull();
  });
});

describe('Data page', () => {
  let http: HttpTestingController;
  beforeEach(() => (http = setup()));
  afterEach(() => http.verify());

  async function loaded(url = '/data') {
    const harness = await RouterTestingHarness.create(url);
    http.expectOne('/api/insights/data').flush(dataFixture());
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  it('states the scope with the live figures', async () => {
    const { el } = await loaded();
    expect(el.querySelector('.stat-pill-value')?.textContent?.trim()).toBe('120');
    expect(el.textContent).toContain('12%');
    expect(el.textContent).toContain('code hosts and software registries are left out');
    expect(el.textContent).toContain('300 AI/ML methods');
  });

  it('disables a designation whose list is pending', async () => {
    const { el } = await loaded();
    const chips = [...el.querySelectorAll<HTMLButtonElement>('.ins-chip')];
    const cdr = chips.find((c) => c.textContent?.includes('Core Data Resource'))!;
    expect(cdr.disabled).toBe(true);
    expect(cdr.textContent).toContain('list pending');
    expect(chips.find((c) => c.textContent?.includes('EMBL-EBI'))!.disabled).toBe(false);
  });

  it('filters every chart through the URL', async () => {
    const { harness, el } = await loaded();
    const router = TestBed.inject(Router);
    const chips = [...el.querySelectorAll<HTMLButtonElement>('.ins-chip')];
    chips.find((c) => c.textContent?.trim() === 'EMBL-EBI')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(router.url).toBe('/data?tag=embl_ebi');
    expect([...el.querySelectorAll('.ranked-label a')].map((a) => a.textContent?.trim())).toEqual(['PDB']);
    expect(el.textContent).toContain('50 papers link at least one of them');
  });

  it('links each bar to its papers in Search by resource slug', async () => {
    const { el } = await loaded();
    const search = el.querySelector<HTMLAnchorElement>('.ranked-search');
    expect(search?.getAttribute('href')).toBe('/search?dl=geo');
  });

  it('opens a resource named in ?r=', async () => {
    const harness = await RouterTestingHarness.create('/data?r=pdb');
    http.expectOne('/api/insights/data').flush(dataFixture());
    http.expectOne((r) => r.params.get('resource') === 'pdb').flush({
      generated: '2026-11-25T12:00:00Z',
      years: [2023, 2024, 2025, 2026],
      lastYearPartial: true,
      resource: resourceRow('pdb', { label: 'Protein Data Bank in Europe', embl_ebi: true, gcbr: 'Protein Data Bank' }),
      topJournals: [{ journal: 'Nature communications', papers: 4 }],
      families: [{ value: 'deep learning', count: 6, share: 0.75, lift: 1.2 }],
    });
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('#detail-h')?.textContent).toContain('Protein Data Bank in Europe');
    expect(el.textContent).toContain('Hosted at EMBL-EBI');
    expect(el.textContent).toContain('Nature communications');
    expect(el.textContent).toContain('2026 is still filling');
  });
});

describe('Navbar', () => {
  beforeEach(() => setup());

  it('lights "Data & Models" on both /data and /models', async () => {
    const harness = await RouterTestingHarness.create('/data');
    const fixture = TestBed.createComponent(Navbar);
    TestBed.inject(HttpTestingController).match(() => true);
    fixture.detectChanges();
    const entry = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].find((a) => a.textContent?.includes('Data & Models'))!;
    expect(entry().classList).toContain('active');
    await harness.navigateByUrl('/models');
    TestBed.inject(HttpTestingController).match(() => true);
    fixture.detectChanges();
    expect(entry().classList).toContain('active');
    await harness.navigateByUrl('/search');
    fixture.detectChanges();
    expect(entry().classList).not.toContain('active');
  });
});

describe('liftColor', () => {
  it('is grey near 1 and symmetric on a log scale', () => {
    expect(liftColor(1)).toBe('var(--viz-even)');
    expect(liftColor(1.1)).toBe('var(--viz-even)');
    expect(liftColor(2)).toBe('var(--viz-more-3)');
    expect(liftColor(0.5)).toBe('var(--viz-less-3)');
    expect(liftColor(null)).toBe('var(--viz-even)');
  });
});
