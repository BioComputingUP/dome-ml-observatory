import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SideNav, SideNavItem } from '../../shared/side-nav/side-nav';

@Component({
  selector: 'app-about-layout',
  imports: [RouterOutlet, SideNav],
  templateUrl: './about-layout.html',
})
export class AboutLayout {
  readonly navItems: SideNavItem[] = [
    { label: 'Overview', icon: 'icon-bullseye', route: '/about' },
    { label: 'Team', icon: 'icon-user', route: '/about/team' },
    { label: 'Integrations', icon: 'icon-sitemap', route: '/about/integrations' },
    { label: 'Licensing & Citation', icon: 'icon-copy', route: '/about/licensing' },
    { label: 'Privacy Policy', icon: 'icon-lock', route: '/about/privacy' },
  ];
}
