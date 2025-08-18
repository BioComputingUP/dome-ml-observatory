import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {environment} from '../environments/environment';
import {AppComponent} from './app.component';
import {BssamplesComponent} from './bssamples/bssamples.component';
import {HeaderComponent} from './header/header.component';
import {FooterComponent} from './footer/footer.component';
import {HomePageComponent} from './home-page/home-page.component';
import {AppRoutingModule} from './app-routing.module';
import {NotFoundPageComponent} from './not-found-page/not-found-page.component';
import {NavbarComponent} from './navbar/navbar.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {AlertModule} from 'ngx-bootstrap/alert';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import {NgLoggerModule, Level} from '@nsalaun/ng-logger';
import {ButtonsModule} from 'ngx-bootstrap/buttons';
import {FormsModule} from '@angular/forms';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { NewsComponent } from './news/news.component';
import { GuidelinesComponent } from './guidelines/guidelines.component';
import { AboutComponent } from './about/about.component';
import { AiEcosystemComponent } from './ai_ecosystem/ai_ecosystem.component';
import { PathwaysComponent } from './pathways/pathways.component';
import { HttpClientModule } from '@angular/common/http';

let LOG_LEVEL = Level.OFF;
if (environment.enableLogger) {
  LOG_LEVEL = Level.LOG;
}

@NgModule({
  declarations: [
    AppComponent,
    BssamplesComponent,
    HeaderComponent,
    FooterComponent,
    HomePageComponent,
    NotFoundPageComponent,
    NavbarComponent,
    NewsComponent,
    GuidelinesComponent,
    AboutComponent,
    AiEcosystemComponent,
    PathwaysComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    TooltipModule.forRoot(),
    AlertModule.forRoot(),
    ButtonsModule.forRoot(),
    NgLoggerModule.forRoot(LOG_LEVEL),
    CollapseModule.forRoot(),
    FormsModule,
    HttpClientModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
