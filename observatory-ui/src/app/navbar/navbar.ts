import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

/** The two pages under the "Data & Models" entry. */
const INSIGHTS_PATHS = ['/data', '/models'];

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  private readonly router = inject(Router);
  isCollapsed = true;

  readonly insightsActive = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        const path = this.router.url.split(/[?#]/)[0];
        return INSIGHTS_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
      }),
    ),
    { initialValue: false },
  );

  collapseNav(): void {
    this.isCollapsed = true;
  }
}
