import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

export interface SideNavItem {
  label: string;
  icon: string;
  route: string;
}

/** Persistent left-hand section nav for a route with real sub-pages (Download, About) --
 *  routes between them, not scroll-anchors, so every item needs exact active-matching or the
 *  parent overview link would stay lit on every child route too. */
@Component({
  selector: 'app-side-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.scss',
})
export class SideNav {
  readonly items = input.required<SideNavItem[]>();
  readonly ariaLabel = input<string>('Section navigation');

  private readonly pillbar = viewChild<ElementRef<HTMLElement>>('pillbar');

  constructor() {
    // The pill strip (narrow-screen fallback) can overflow sideways with enough items -- e.g.
    // About's 5 entries including "Licensing & Citation". Without this, landing deep in a
    // section (or navigating within it) can leave the active pill scrolled out of view, so the
    // page looks like it's on a different section than it actually is. router-outlet stays put
    // across sub-page navigation within About/Download -- this component isn't recreated -- so
    // this has to watch NavigationEnd rather than only running once on init.
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        // Defer a tick: routerLinkActive re-evaluates off the same NavigationEnd event, so the
        // ".active" class isn't guaranteed to be on the DOM yet within this same callback.
        setTimeout(() => this.scrollActivePillIntoView());
      });
  }

  private scrollActivePillIntoView(): void {
    this.pillbar()
      ?.nativeElement.querySelector<HTMLElement>('.side-nav-pill-link.active')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
}
