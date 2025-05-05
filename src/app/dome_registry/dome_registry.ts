import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, OnInit } from '@angular/core';

import { AboutComponent } from './about.component';

@Component({
  selector: 'app-dome-registry',
  templateUrl: './dome_registry.html', // Matches your HTML file name
  styleUrls: ['./dome_registry.scss'] // Matches your SCSS/CSS file name
})
export class DomeRegistryComponent implements OnInit { // Class name should ideally be PascalCase

  constructor() { }

  ngOnInit(): void {
  }

}

