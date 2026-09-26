import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AboutTeam } from './about-team';

/** jsdom has no Web Animations API, so every scene here runs the static fallback: the sprite is
 *  shown for a moment and hidden again. That is enough to pin down the trigger rules, which are
 *  the part a visitor can get wrong; the motion itself is checked in a real browser. */
describe('AboutTeam', () => {
  let fixture: ComponentFixture<AboutTeam>;
  let component: AboutTeam;
  let root: HTMLElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [AboutTeam], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(AboutTeam);
    fixture.detectChanges();
    component = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;
    // jsdom would otherwise try (and fail) to navigate when a link is clicked.
    root.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const cards = () => Array.from(root.querySelectorAll<HTMLElement>('article.member-card'));
  const click = (el: Element, times = 1) => {
    for (let i = 0; i < times; i++) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  };

  it('lists the core team', () => {
    expect(cards().map((c) => c.querySelector('h3')?.textContent?.trim())).toEqual([
      'Gavin Farrell',
      'Ivan Mičetić',
      'Silvio Tosatto',
    ]);
  });

  it('keeps the sprite host decorative and hidden until something is playing', () => {
    const host = root.querySelector<HTMLElement>('.sprite-host');
    expect(host?.getAttribute('aria-hidden')).toBe('true');
    expect(host?.hidden).toBe(true);
    expect(root.querySelector('app-pixel-sprite')).toBeNull();
  });

  it('needs five clicks on the first card, not four', () => {
    click(cards()[0], 4);
    expect(component.activeSurprise()).toBeNull();
    click(cards()[0]);
    expect(component.activeSurprise()).toBe('croc');
    fixture.detectChanges();
    expect(root.querySelector<HTMLElement>('.sprite-host')?.hidden).toBe(false);
    expect(root.querySelector('app-pixel-sprite svg rect')).not.toBeNull();
  });

  it('gives the third card a different surprise', () => {
    click(cards()[2], 5);
    expect(component.activeSurprise()).toBe('mecha');
  });

  it('does nothing for a card without one', () => {
    click(cards()[1], 5);
    expect(component.activeSurprise()).toBeNull();
  });

  it('only counts clicks on the card itself, not on its links', () => {
    const [card] = cards();
    const link = card.querySelector('a') as HTMLAnchorElement;
    click(link, 5);
    expect(component.activeSurprise()).toBeNull();
    click(card, 3);
    click(link);
    click(card, 2);
    expect(component.activeSurprise()).toBe('croc');
  });

  it('starts over when the visitor moves to another card', () => {
    click(cards()[0], 3);
    click(cards()[2]);
    click(cards()[0], 2);
    expect(component.activeSurprise()).toBeNull();
    click(cards()[0], 3);
    expect(component.activeSurprise()).toBe('croc');
  });

  it('ignores clicks while a scene is playing, then ends and can play again', async () => {
    click(cards()[0], 5);
    click(cards()[2], 5);
    expect(component.activeSurprise()).toBe('croc');

    await vi.advanceTimersByTimeAsync(2600);
    expect(component.activeSurprise()).toBeNull();
    fixture.detectChanges();
    expect(root.querySelector('app-pixel-sprite')).toBeNull();

    click(cards()[2], 5);
    expect(component.activeSurprise()).toBe('mecha');
  });

  it('survives being destroyed mid-scene', async () => {
    click(cards()[0], 5);
    fixture.destroy();
    // Passes by not throwing: the pending timer is cleared on destroy, nothing runs afterwards.
    await vi.advanceTimersByTimeAsync(3000);
    expect(component.activeSurprise()).toBe('croc');
  });
});
