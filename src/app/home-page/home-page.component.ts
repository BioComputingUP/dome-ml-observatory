import {Component, OnInit} from '@angular/core';
import {Logger} from '@nsalaun/ng-logger';

@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss']
})


export class HomePageComponent implements OnInit {

  defTheme = true;

  constructor(private logger: Logger) {
  }

  ngOnInit(): void {
    this.logger.log('log message');
    this.logger.debug('debug message');
    this.logger.info('info message');
    this.logger.warn('warn message');
    this.logger.error('error message');
  }

}

