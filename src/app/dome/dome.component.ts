import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-dome',
  templateUrl: './dome.component.html',
  styleUrls: ['./dome.component.scss']
})
export class DomeComponent implements OnInit {
  public dataCollapsed = true;
  public optimizationCollapsed = true;
  public modelCollapsed = true;
  public evaluationCollapsed = true;

  constructor() { }

  ngOnInit(): void {
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
