import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule, Routes} from '@angular/router';

import {HomePageComponent} from './home-page/home-page.component';
import {NotFoundPageComponent} from './not-found-page/not-found-page.component';
import {NewsComponent} from './news/news.component';
import {GuidelinesComponent} from './guidelines/guidelines.component';
import {AboutComponent} from './about/about.component';
import {AiEcosystemComponent} from './ai_ecosystem/ai_ecosystem.component'; // Import the new component
import {PathwaysComponent} from './pathways/pathways.component';

const appRoutes: Routes = [
  {path: '', component: HomePageComponent, pathMatch: 'full'},
  {path: 'news', component: NewsComponent},
  {path: 'guidelines', component: GuidelinesComponent},
  {path: 'about', component: AboutComponent},
  {path: 'ai-ecosystem', component: AiEcosystemComponent}, // Add route for AI Ecosystem
  {path: 'pathways', component: PathwaysComponent},
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
