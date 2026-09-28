import { Component, inject } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Navbar } from './navbar/navbar';
import { Footer } from './footer/footer';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, Footer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);

  /**
   * True from NavigationStart until the navigation settles, driving the progress bar at the top
   * of the shell and aria-busy on <main>. Chunks are preloaded after the first navigation, so
   * this mostly never shows -- it exists for the first click landing before preload finishes,
   * for slow connections, and for any future resolver. The bar's own CSS delays its appearance
   * so an instant navigation never flickers it.
   */
  readonly navigating = toSignal(
    this.router.events.pipe(
      filter(
        (event) =>
          event instanceof NavigationStart ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError ||
          event instanceof NavigationSkipped,
      ),
      map((event) => event instanceof NavigationStart),
    ),
    { initialValue: false },
  );

  /**
   * Moves focus and the viewport to the main content, for the skip link.
   *
   * Done in code rather than by letting `href="#main-content"` do it, because it cannot: index.html
   * declares `<base href="/">`, so a fragment-only URL resolves against the document base instead
   * of the current location. `#main-content` became `/#main-content`, which the router matches as
   * the empty path -- the skip link navigated to the home page from every other page on the site.
   */
  skipToMain(event: Event): void {
    event.preventDefault();
    const main = document.getElementById('main-content');
    if (!main) return;
    // tabindex -1 so a <main> that is not natively focusable can take focus; without it the
    // viewport moves but the keyboard user's focus stays in the skip link, which is the half of
    // the behaviour that actually matters.
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: 'start' });
  }
}
