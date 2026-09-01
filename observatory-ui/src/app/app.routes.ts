import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
    pathMatch: 'full',
  },
  {
    path: 'search',
    loadComponent: () => import('./search/search').then((m) => m.Search),
  },
  {
    path: 'record/:pid',
    loadComponent: () => import('./record/record').then((m) => m.RecordPage),
  },
  {
    path: 'download',
    loadComponent: () => import('./download/download-layout/download-layout').then((m) => m.DownloadLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./download/download-overview/download-overview').then((m) => m.DownloadOverview),
      },
      {
        path: 'bulk',
        loadComponent: () => import('./download/download-bulk/download-bulk').then((m) => m.DownloadBulk),
      },
      {
        path: 'api',
        loadComponent: () => import('./download/download-api/download-api').then((m) => m.DownloadApi),
      },
    ],
  },
  { path: 'api', redirectTo: '/download/api', pathMatch: 'full' },
  {
    path: 'about',
    loadComponent: () => import('./about/about-layout/about-layout').then((m) => m.AboutLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./about/about-overview/about-overview').then((m) => m.AboutOverview),
      },
      {
        path: 'team',
        loadComponent: () => import('./about/about-team/about-team').then((m) => m.AboutTeam),
      },
      {
        path: 'integrations',
        loadComponent: () =>
          import('./about/about-integrations/about-integrations').then((m) => m.AboutIntegrations),
      },
      {
        path: 'licensing',
        loadComponent: () => import('./about/about-licensing/about-licensing').then((m) => m.AboutLicensing),
      },
      {
        path: 'privacy',
        loadComponent: () => import('./about/about-privacy/about-privacy').then((m) => m.AboutPrivacy),
      },
    ],
  },
  { path: 'team', redirectTo: '/about/team', pathMatch: 'full' },
  { path: 'integrations', redirectTo: '/about/integrations', pathMatch: 'full' },
  { path: 'licensing', redirectTo: '/about/licensing', pathMatch: 'full' },
  { path: 'privacy', redirectTo: '/about/privacy', pathMatch: 'full' },
  {
    path: 'news',
    loadComponent: () => import('./news/news').then((m) => m.News),
  },
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound),
  },
];
