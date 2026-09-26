import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PixelSprite } from '../../shared/pixel-sprite/pixel-sprite';
import { Point, arcPoints, bobPoints, keyframes, translate } from '../../shared/pixel-sprite/sprite-motion';
import { CROC_FRAME, FIRE_CROC, MECHA, MECHA_FRAME } from './team-sprites';

type Sprite = 'croc' | 'mecha';
/** A pixel-art character, or `holo`: a skin the card itself wears for a moment. */
type Surprise = Sprite | 'holo';

interface Member {
  name: string;
  role: string;
  affiliation: string;
  photo: string;
  orcid?: string;
  github?: string;
  /** Which surprise five consecutive clicks on this card set off, if any. */
  surprise?: Surprise;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

const CLICKS_TO_TRIGGER = 5;
/** CSS pixels per sprite cell. 0.6 puts the 41x49 crocodile at about 25x29 and the 28x48 robot at
 *  about 17x29: small enough to perch on a card's corner, and roughly a third of the 2 they were
 *  drawn at before. Deliberately fractional -- PixelSprite anti-aliases a fractional scale rather
 *  than snapping it, so the cost is crisp pixels, not missing rows. */
const SPRITE_SCALE = 0.6;
/** How long the sprite simply sits on the card when motion is reduced or unavailable. */
const STATIC_SHOW_MS = 2500;
/** How long the hologram skin holds. The stylesheet fades it in and out over half a second each
 *  way, so it is on screen about as long as the robot's scene. */
const SKIN_SHOW_MS = 2500;

/** Tucked behind the card's bottom-right corner, where the card hides it completely (the host
 *  paints under the cards). 10px in from both edges clears the card's 8px corner radius. */
function hiddenBehind(card: DOMRect, size: Size): Point {
  return { x: card.right - size.width - 10, y: card.bottom - size.height - 10 };
}

/** Perched just inside the card's bottom-right corner, over it. The links row is centred, so at
 *  these sizes the corner is empty. */
function onCorner(card: DOMRect, size: Size): Point {
  return { x: card.right - size.width - 6, y: card.bottom - size.height - 6 };
}

@Component({
  selector: 'app-about-team',
  imports: [RouterLink, PixelSprite],
  templateUrl: './about-team.html',
  styleUrl: './about-team.scss',
  // One delegated listener rather than a (click) on each <article>: the cards are not controls
  // (clicking one does nothing a visitor needs), so they get no key handler or tabindex, and the
  // template accessibility rules rightly refuse a bare click binding on a non-interactive element.
  host: { '(click)': 'onCardClick($event)' },
})
export class AboutTeam {
  /** Rendered in array order (the template does not sort), so this order IS the display order.
   *  Photos are 240x240 WebP, twice the 120px they display at, so they stay sharp on high-density
   *  screens at ~5 KB each; the 500px originals (one a 280 KB PNG) were what made the page slow. */
  readonly core: Member[] = [
    {
      name: 'Gavin Farrell',
      role: 'Lead Developer',
      affiliation: 'University of Padova',
      photo: 'assets/img/gavin.webp',
      orcid: '0000-0001-5166-8551',
      github: 'gavinf97',
      surprise: 'croc',
    },
    {
      name: 'Ivan Mičetić',
      role: 'Lab Services Manager',
      affiliation: 'University of Padova',
      photo: 'assets/img/ivan.webp',
      orcid: '0000-0003-1691-8425',
      github: 'ivanmicetic',
      surprise: 'holo',
    },
    {
      name: 'Silvio Tosatto',
      role: 'Lab Principal Investigator',
      affiliation: 'University of Padova',
      photo: 'assets/img/silvio-tosatto.webp',
      orcid: '0000-0003-4525-7793',
      surprise: 'mecha',
    },
  ];

  // ---- the surprises ------------------------------------------------------------------------
  // Five consecutive clicks on a card that has one play a short scene: a pixel-art character
  // peeks out from behind that card's bottom-right corner and leaves the page, or the card itself
  // wears a skin for a moment. Purely decorative -- the sprite host is aria-hidden and takes no
  // pointer events, the skin is one class the stylesheet fades, and nothing on the page depends on
  // either. Motion is the Web Animations API (element.animate) rather than CSS keyframes because
  // every waypoint is a card's measured position; the reduced-motion preference is honoured here
  // for the same reason (the skin's own animations are gated in the stylesheet).

  private readonly cards = viewChildren<ElementRef<HTMLElement>>('memberCard');
  private readonly spriteHost = viewChild.required<ElementRef<HTMLElement>>('spriteHost');

  readonly activeSurprise = signal<Surprise | null>(null);
  /** Index of the card wearing the hologram skin, while one does. */
  readonly skinnedCard = signal<number | null>(null);
  /** Whether the sprite host paints over the cards (true) or under them (false). */
  readonly inFront = signal(false);
  readonly frame = signal(0);
  readonly art = computed(() => {
    const surprise = this.activeSurprise();
    return surprise === 'croc' ? FIRE_CROC : surprise === 'mecha' ? MECHA : null;
  });
  readonly spriteScale = SPRITE_SCALE;

  private clickedCard: HTMLElement | null = null;
  private clicks = 0;
  private playing = false;
  private current: Animation | null = null;
  private staticTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.current?.cancel();
      clearTimeout(this.staticTimer);
    });
  }

  onCardClick(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest<HTMLElement>('article.member-card') ?? null;
    // A click on the ORCID/GitHub link is a link click, not a card click.
    if (!card || target?.closest('a') || this.playing) {
      return;
    }
    if (card !== this.clickedCard) {
      this.clickedCard = card;
      this.clicks = 0;
    }
    this.clicks++;
    if (this.clicks < CLICKS_TO_TRIGGER) {
      return;
    }
    this.clicks = 0;
    const index = this.cards().findIndex((c) => c.nativeElement === card);
    const surprise = this.core[index]?.surprise;
    if (!surprise) {
      return;
    }
    // Five quick clicks select the card's text; clear that so it isn't sitting under the sprite.
    document.getSelection?.()?.removeAllRanges();
    void this.play(surprise, index);
  }

  private async play(surprise: Surprise, index: number): Promise<void> {
    const host = this.spriteHost().nativeElement;
    const cards = this.cards().map((c) => c.nativeElement.getBoundingClientRect());
    this.playing = true;
    this.frame.set(0);
    this.inFront.set(false);
    this.activeSurprise.set(surprise);
    try {
      if (surprise === 'holo') {
        this.skinnedCard.set(index);
        await this.wait(SKIN_SHOW_MS);
      } else if (this.prefersReducedMotion() || typeof host.animate !== 'function') {
        await this.showStatic(host, cards[index]);
      } else if (surprise === 'croc') {
        await this.playCroc(host, cards, index);
      } else {
        await this.playMecha(host, cards[index]);
      }
    } catch (err) {
      // `finished` rejects with an AbortError when a phase is cancelled -- navigating away
      // mid-scene -- and that is the expected way out. Anything else is a real bug.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        throw err;
      }
    } finally {
      this.current = null;
      this.activeSurprise.set(null);
      // The class comes off here; the stylesheet's transition fades the skin out.
      this.skinnedCard.set(null);
      this.inFront.set(false);
      this.frame.set(0);
      host.style.transform = '';
      this.playing = false;
    }
  }

  /** The crocodile: peeks head-first out from behind its card's bottom-right corner, steps clear,
   *  hops onto the corner, hops corner to corner along every card after it, then leaps off the
   *  right of the screen. */
  private async playCroc(host: HTMLElement, cards: DOMRect[], index: number): Promise<void> {
    const size = this.spriteSize();
    const start = cards[index];
    const behind = hiddenBehind(start, size);
    // The grid has its head on the right, so sliding right shows the head first.
    const peek: Point = { x: start.right - size.width * 0.45, y: behind.y };
    const out: Point = { x: start.right + 2, y: behind.y };
    host.style.transform = translate(behind);

    // 1. Head out, a blink, a beat.
    await this.run(host, keyframes([behind, peek]), { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    await this.pause(host, 350);
    this.frame.set(CROC_FRAME.blink);
    await this.pause(host, 150);
    this.frame.set(CROC_FRAME.idle);
    await this.pause(host, 300);

    // 2. Clear of its own card while still painting under the cards, then over them: this is the
    //    one moment nothing of it is hidden, so the switch of layer shows nothing popping.
    await this.run(host, keyframes([peek, out]), { duration: 150, easing: 'ease-out' });
    this.inFront.set(true);

    // 3. Onto its own corner, then along the rest.
    let at = out;
    for (let i = index; i < cards.length; i++) {
      const first = i === index;
      const target = onCorner(cards[i], size);
      this.frame.set(CROC_FRAME.jump);
      await this.hop(host, at, target, first ? 24 : 36, first ? 420 : 600);
      this.frame.set(CROC_FRAME.idle);
      at = target;
      await this.pause(host, first ? 400 : 350);
    }

    // 4. The big one.
    this.frame.set(CROC_FRAME.jump);
    const exit: Point = { x: window.innerWidth + size.width + 40, y: at.y - 60 };
    await this.run(host, keyframes(arcPoints(at, exit, 60)), { duration: 750, easing: 'linear' });
  }

  /** The robot: slides out from behind its card's bottom-right corner, lights its thrusters,
   *  hovers over the corner and flies off to the right. */
  private async playMecha(host: HTMLElement, card: DOMRect): Promise<void> {
    const size = this.spriteSize();
    const behind = hiddenBehind(card, size);
    const out: Point = { x: card.right + 4, y: behind.y };
    const hover: Point = { x: card.right - size.width * 0.5, y: card.bottom - size.height - 12 };
    host.style.transform = translate(behind);

    await this.run(host, keyframes([behind, out]), { duration: 700, easing: 'ease-out' });
    this.inFront.set(true);
    this.frame.set(MECHA_FRAME.lit);
    await this.run(host, keyframes([out, hover]), { duration: 300, easing: 'ease-out' });
    await this.run(host, keyframes(bobPoints(hover, 3, 2)), { duration: 1400, easing: 'linear' });

    this.frame.set(MECHA_FRAME.flight);
    const shake = [-2, 2, -2, 2, -1, 1, 0].map((dx) => ({ x: hover.x + dx, y: hover.y }));
    await this.run(host, keyframes(shake), { duration: 300, easing: 'linear' });
    const exit: Point = { x: window.innerWidth + size.width + 40, y: hover.y - 90 };
    await this.run(host, [{ transform: translate(hover, 0) }, { transform: translate(exit, -14) }], {
      duration: 800,
      easing: 'cubic-bezier(0.5, 0, 1, 0.6)',
    });
  }

  /** Reduced motion, or no Web Animations API: the sprite just sits on the corner for a moment. */
  private showStatic(host: HTMLElement, card: DOMRect): Promise<void> {
    host.style.transform = translate(onCorner(card, this.spriteSize()));
    this.inFront.set(true);
    return this.wait(STATIC_SHOW_MS);
  }

  /** A plain timed hold, on the one timer that destroying the component clears. */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.staticTimer = setTimeout(resolve, ms);
    });
  }

  /** One arc, take-off to landing. */
  private hop(host: HTMLElement, from: Point, to: Point, lift: number, ms: number): Promise<void> {
    return this.run(host, keyframes(arcPoints(from, to, lift)), { duration: ms, easing: 'linear' });
  }

  /** Run one phase and leave the sprite where it ended, so the next phase starts from there.
   *  Committing the final transform and cancelling, rather than keeping `fill: forwards` alive,
   *  means only one animation ever exists -- the one `current` can cancel. */
  private async run(host: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
    const animation = host.animate(frames, { fill: 'forwards', ...options });
    this.current = animation;
    await animation.finished;
    const last = frames[frames.length - 1]?.['transform'];
    if (typeof last === 'string') {
      host.style.transform = last;
    }
    animation.cancel();
  }

  /** A beat between phases, as an animation so that cancelling `current` also cuts the wait. */
  private async pause(host: HTMLElement, ms: number): Promise<void> {
    const animation = host.animate(null, ms);
    this.current = animation;
    await animation.finished;
  }

  private spriteSize(): Size {
    const rows = this.art()?.frames[0] ?? [];
    return { width: (rows[0]?.length ?? 0) * this.spriteScale, height: rows.length * this.spriteScale };
  }

  private prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
