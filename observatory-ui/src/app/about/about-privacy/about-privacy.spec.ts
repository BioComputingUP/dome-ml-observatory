import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AboutPrivacy } from './about-privacy';
import { MATOMO_ENABLED } from '../../core/analytics.config';

/**
 * The privacy notice is a legal statement, so these assert on what a visitor actually reads rather
 * than on the component's internals. The point of most of them is to fail loudly if someone
 * reintroduces a claim the site can no longer make.
 */
describe('AboutPrivacy', () => {
  let text: string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutPrivacy],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(AboutPrivacy);
    fixture.detectChanges();
    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
  });

  it('names no third-party analytics provider', () => {
    // Google Analytics was dropped, not deferred: it would set non-essential cookies and transfer
    // data outside the EU/EEA, both of which this page now denies outright.
    expect(text).not.toMatch(/google/i);
  });

  it('states unconditionally that no data leaves the EU/EEA', () => {
    expect(text).toContain('No data is transferred outside the EU/EEA');
    // No "once X is active..." carve-out may creep back in.
    expect(text).not.toMatch(/United States|Google LLC/);
  });

  it('says no cookies are set, and asks for no consent', () => {
    expect(text).toMatch(/sets no cookies/i);
    expect(text).not.toMatch(/you (actively )?consent|accept cookies/i);
  });

  it('carries both the lab and the project contact for the data controller', () => {
    expect(text).toContain('management@biocomputingup.it');
    expect(text).toContain('contact@dome-ml.org');
    expect(text).toContain('privacy@unipd.it');
  });

  it('describes analytics honestly for whichever state the site ships in', () => {
    expect(text).toMatch(/Matomo/);
    if (MATOMO_ENABLED) {
      expect(text).not.toContain('Not yet active');
    } else {
      // While the switch is off the badge must be present -- claiming active analytics that are
      // not running is the same category of error as the reverse.
      expect(text).toContain('Not yet active');
    }
  });
});
