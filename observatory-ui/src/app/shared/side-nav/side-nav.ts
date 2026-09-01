import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

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
}
