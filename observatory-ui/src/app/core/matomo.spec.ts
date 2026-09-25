import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Matomo, pageTitle } from './matomo';

const PID = '0b6f3c2e-8a1d-4f5e-9c7b-2d4e6f8a0b1c';

@Component({ template: '' })
class Blank {}

describe('pageTitle', () => {
  it('names a page by its route path, without the query or fragment', () => {
    expect(pageTitle('/search?q=protein&jrnl=Nature#results')).toBe('search');
    expect(pageTitle('/about/privacy')).toBe('about/privacy');
  });

  it("calls the root 'home'", () => {
    expect(pageTitle('/')).toBe('home');
    expect(pageTitle('/?utm_source=newsletter')).toBe('home');
  });

  it('gives every record page one title -- the PID stays in the custom URL instead', () => {
    expect(pageTitle(`/record/${PID}`)).toBe('record');
    expect(pageTitle(`/record/${PID}?tab=metadata`)).toBe('record');
  });
});

describe('Matomo', () => {
  let router: Router;

  beforeEach(() => {
    delete window._paq;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'record/:pid', component: Blank },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    delete window._paq;
    document.querySelectorAll('script[src$="matomo.js"]').forEach((script) => script.remove());
  });

  it('does nothing at all while switched off', async () => {
    TestBed.inject(Matomo).init(false);
    await router.navigateByUrl('/');
    expect(window._paq).toBeUndefined();
    expect(document.querySelector('script[src$="matomo.js"]')).toBeNull();
  });

  it('keeps reporting page views after matomo.js replaces window._paq with its proxy', async () => {
    TestBed.inject(Matomo).init(true);
    const queued = window._paq as unknown[][];
    // Cookies must be off before the tracker ever runs.
    expect(queued[0]).toEqual(['disableCookies']);

    // What matomo.js does on load. Anything still pushed to `queued` after this is lost.
    const proxy = { push: vi.fn() };
    window._paq = proxy;
    await router.navigateByUrl(`/record/${PID}`);

    expect(proxy.push).toHaveBeenCalledWith(['setCustomUrl', `${document.location.origin}/record/${PID}`]);
    expect(proxy.push).toHaveBeenCalledWith(['setDocumentTitle', 'record']);
    expect(proxy.push).toHaveBeenCalledWith(['trackPageView']);
    expect(queued).not.toContainEqual(['trackPageView']);
  });
});
