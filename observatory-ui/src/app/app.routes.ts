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
    loadComponent: () => import('./download/download').then((m) => m.Download),
  },
  {
    path: 'api',
    loadComponent: () => import('./api-docs/api-docs').then((m) => m.ApiDocs),
  },
  {
    path: 'integrations',
    loadComponent: () => import('./integrations/integrations').then((m) => m.Integrations),
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about').then((m) => m.About),
  },
  {
    path: 'team',
    loadComponent: () => import('./team/team').then((m) => m.Team),
  },
  {
    path: 'licensing',
    loadComponent: () => import('./licensing/licensing').then((m) => m.Licensing),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy').then((m) => m.Privacy),
  },
  {
    path: 'news',
    loadComponent: () => import('./news/news').then((m) => m.News),
  },
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound),
  },
];
