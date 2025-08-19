import { Component, OnInit } from '@angular/core';
import { ShimmerDirective } from '../directives/shimmer.directive';

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
  imports: [
    ShimmerDirective
  ]
})
export class AboutComponent implements OnInit {
  showAuthors = false;

  constructor() { }

  ngOnInit(): void {
  }

  toggleAuthors() {
    this.showAuthors = !this.showAuthors;
  }
}
