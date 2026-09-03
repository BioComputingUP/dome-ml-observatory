import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about-privacy',
  imports: [RouterLink],
  templateUrl: './about-privacy.html',
  styleUrl: './about-privacy.scss',
})
export class AboutPrivacy {
  readonly lastUpdated = '2026-09-01';
}
