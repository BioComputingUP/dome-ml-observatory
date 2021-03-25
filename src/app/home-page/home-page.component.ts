import {Component, HostBinding, OnInit} from '@angular/core';
import {Logger} from '@nsalaun/ng-logger';
import {
  state,
  style,
  trigger,
  animate,
  transition,
} from '@angular/animations';

@Component({
  selector: 'app-home-page',
  animations: [
    trigger('openClose', [
      state('open', style({
        'text-align': 'left',
      })),
      state('closed', style({
        'text-align': 'right'
      })),
    ]),
  ],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})

export class HomePageComponent implements OnInit {
  public dataCollapsed = true;
  public optimizationCollapsed = true;
  public modelCollapsed = true;
  public evaluationCollapsed = true;
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

  public expandAll(): void {
    this.dataCollapsed = false;
    this.optimizationCollapsed = false;
    this.modelCollapsed = false;
    this.evaluationCollapsed = false;
  }

  public collapseAll(): void {
    this.dataCollapsed = true;
    this.optimizationCollapsed = true;
    this.modelCollapsed = true;
    this.evaluationCollapsed = true;
  }
}
