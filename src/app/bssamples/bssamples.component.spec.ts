import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { BssamplesComponent } from './bssamples.component';

describe('BssamplesComponent', () => {
  let component: BssamplesComponent;
  let fixture: ComponentFixture<BssamplesComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BssamplesComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BssamplesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
