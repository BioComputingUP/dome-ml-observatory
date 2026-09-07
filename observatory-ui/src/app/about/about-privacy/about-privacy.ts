import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MATOMO_ENABLED } from '../../core/analytics.config';

@Component({
  selector: 'app-about-privacy',
  imports: [RouterLink],
  templateUrl: './about-privacy.html',
  styleUrl: './about-privacy.scss',
})
export class AboutPrivacy {
  readonly lastUpdated = '2026-09-07';

  /**
   * Read from the same constant the tracker itself reads, so this page cannot claim analytics are
   * running when they are not, or the reverse. Turning Matomo on is one edit to
   * core/analytics.config.ts and this page updates with it -- a privacy notice drifting out of
   * date is exactly the failure worth designing against.
   */
  readonly analyticsActive = MATOMO_ENABLED;
}
