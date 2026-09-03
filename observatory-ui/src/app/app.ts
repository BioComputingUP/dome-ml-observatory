import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './navbar/navbar';
import { Footer } from './footer/footer';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, Footer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
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
