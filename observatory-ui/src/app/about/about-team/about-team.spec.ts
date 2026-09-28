import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AboutTeam } from './about-team';

/** jsdom has no Web Animations API, so every sprite scene here runs the static fallback: the sprite
 *  is shown for a moment and hidden again. That is enough to pin down the trigger rules, which are
 *  the part a visitor can get wrong; the motion and the look are checked in a real browser. */
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

  it('plays the surprise on a single click of the first card', () => {
    click(cards()[0]);
    expect(component.activeSurprise()).toBe('croc');
    fixture.detectChanges();
    expect(root.querySelector<HTMLElement>('.sprite-host')?.hidden).toBe(false);
    expect(root.querySelector('app-pixel-sprite svg path')).not.toBeNull();
  });

  it('gives the second card the starship', () => {
    click(cards()[1]);
    expect(component.activeSurprise()).toBe('starship');
    fixture.detectChanges();
    expect(root.querySelector<HTMLElement>('.sprite-host')?.hidden).toBe(false);
    expect(root.querySelector('app-pixel-sprite svg path')).not.toBeNull();
  });

  it('gives the third card the robot', () => {
    click(cards()[2]);
    expect(component.activeSurprise()).toBe('mecha');
  });

  it('treats a click on a link inside the card as a link click, not a card click', () => {
    const [card] = cards();
    const link = card.querySelector('a') as HTMLAnchorElement;
    click(link, 2);
    expect(component.activeSurprise()).toBeNull();
    click(card);
    expect(component.activeSurprise()).toBe('croc');
  });

  it('ignores clicks while a scene is playing, then ends and can play again', async () => {
    click(cards()[0]);
    click(cards()[2]);
    expect(component.activeSurprise()).toBe('croc');

    await vi.advanceTimersByTimeAsync(2600);
    expect(component.activeSurprise()).toBeNull();
    fixture.detectChanges();
    expect(root.querySelector('app-pixel-sprite')).toBeNull();

    click(cards()[2]);
    expect(component.activeSurprise()).toBe('mecha');
  });

  it('survives being destroyed mid-scene', async () => {
    click(cards()[0]);
    fixture.destroy();
    // Passes by not throwing: the pending timer is cleared on destroy, nothing runs afterwards.
    await vi.advanceTimersByTimeAsync(3000);
    expect(component.activeSurprise()).toBe('croc');
  });
});
