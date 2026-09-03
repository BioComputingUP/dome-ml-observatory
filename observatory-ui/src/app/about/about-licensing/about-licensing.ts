import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { schemaReleaseUrl, schemaVocabUrl } from '../../core/schema-links';

@Component({
  selector: 'app-about-licensing',
  imports: [RouterLink],
  templateUrl: './about-licensing.html',
  styleUrl: './about-licensing.scss',
})
export class AboutLicensing {
  // No /api/stats call on this page -- it quotes no corpus figures, and adding a request just
  // to version a link would be the only reason it touched the API at all. The fallback is the
  // current release either way.
  readonly schemaUrl = schemaReleaseUrl();
  readonly vocabUrl = schemaVocabUrl();
}
