import { TestBed } from '@angular/core/testing';
import { SearchStateService } from './search-state.service';

describe('SearchStateService', () => {
  let service: SearchStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SearchStateService);
  });

  it('starts empty, so a deep link falls back to a plain /search', () => {
    expect(service.lastSearch()).toEqual({});
  });

  it('remembers the whole results URL, not just the query text', () => {
    // The search page keeps all of its state in query params, so one object is the entire thing --
    // free text, filters, page and sort. "Back to search" was previously a bare routerLink that
    // discarded every one of them.
    const params = { q: 'random forest', oa: 'true', year: '2020-', page: '4', sort: 'year_desc' };
    service.remember(params);
    expect(service.lastSearch()).toEqual(params);
  });

  it('replaces rather than merges, so a cleared filter does not linger', () => {
    service.remember({ q: 'random forest', oa: 'true' });
    service.remember({ q: 'random forest' });
    expect(service.lastSearch()).toEqual({ q: 'random forest' });
  });

  it('is a singleton, so the search page and the record page see the same value', () => {
    service.remember({ q: 'transformer' });
    expect(TestBed.inject(SearchStateService).lastSearch()).toEqual({ q: 'transformer' });
  });
});
