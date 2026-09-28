import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app';

@Component({ template: '' })
class Stub {}

/** Held open until the test releases it, so a navigation is observably in flight. */
let releaseChunk!: () => void;
const chunkGate = new Promise<void>((resolve) => {
  releaseChunk = () => resolve();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: Stub },
          // Stands in for a lazy chunk that has not finished downloading.
          { path: 'slow', loadComponent: () => chunkGate.then(() => Stub) },
        ]),
        provideHttpClient(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('marks the shell busy while a navigation is in flight, and clears it when it lands', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const main = (fixture.nativeElement as HTMLElement).querySelector('main')!;
    const bar = (fixture.nativeElement as HTMLElement).querySelector('.nav-progress')!;

    const navigation = router.navigateByUrl('/slow');
    await sleep(0); // let NavigationStart fire
    fixture.detectChanges();

    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(bar.classList.contains('active')).toBe(true);

    releaseChunk();
    await navigation;
    fixture.detectChanges();

    expect(main.getAttribute('aria-busy')).toBeNull();
    expect(bar.classList.contains('active')).toBe(false);
  });
});
