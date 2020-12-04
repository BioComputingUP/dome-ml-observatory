import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule, Routes} from '@angular/router';

import {HomePageComponent} from './home-page/home-page.component';
import {AboutPageComponent} from './about-page/about-page.component';
import {NotFoundPageComponent} from './not-found-page/not-found-page.component';
import {NewsComponent} from './news/news.component';
import {GuidelinesComponent} from './guidelines/guidelines.component';

const appRoutes: Routes = [
  {path: '', component: HomePageComponent},
  {path: 'news', component: NewsComponent},
  {path: 'guidelines', component: GuidelinesComponent},
  {path: 'dome', component: AboutPageComponent},
  {path: 'cite', component: AboutPageComponent},
  {path: '**', component: NotFoundPageComponent}
];

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    RouterModule.forRoot(
      appRoutes,
      {enableTracing: false}
    )
  ],
  exports: [
    RouterModule
  ]
})
export class AppRoutingModule {
}
