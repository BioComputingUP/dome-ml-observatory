import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CiteusComponent } from './citeus.component';

describe('CiteusComponent', () => {
  let component: CiteusComponent;
  let fixture: ComponentFixture<CiteusComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CiteusComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CiteusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
