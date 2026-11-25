import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * The shell shared by /data and /models: one header band and a two-tab switch, so the navbar
 * carries a single "Data & Models" entry. Tabs rather than the About-style side rail: two items do
 * not earn a rail's width, and the charts below need every pixel. The same strip at every width;
 * on a phone the two tabs share the row.
 */
@Component({
  selector: 'app-insights-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './insights-layout.html',
  styleUrl: './insights-layout.scss',
})
export class InsightsLayout {}
