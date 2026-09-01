import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SideNav, SideNavItem } from '../../shared/side-nav/side-nav';

@Component({
  selector: 'app-download-layout',
  imports: [RouterOutlet, SideNav],
  templateUrl: './download-layout.html',
  styleUrl: './download-layout.scss',
})
export class DownloadLayout {
  readonly navItems: SideNavItem[] = [
    { label: 'Overview', icon: 'icon-sitemap', route: '/download' },
    { label: 'Bulk Download', icon: 'icon-download', route: '/download/bulk' },
    { label: 'API', icon: 'icon-cogs', route: '/download/api' },
  ];
}
