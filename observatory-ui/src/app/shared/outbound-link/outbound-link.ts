import { Component, input } from '@angular/core';
import { OutboundLink } from '../../core/outbound-links';

/** One "find this elsewhere" destination. Renders as a live link when the record has the
 *  identifier, and as an honest pending row when the destination is reserved but not yet linked --
 *  hiding it would make the roadmap invisible. */
@Component({
  selector: 'app-outbound-link',
  imports: [],
  templateUrl: './outbound-link.html',
  styleUrl: './outbound-link.scss',
})
export class OutboundLinkItem {
  readonly link = input.required<OutboundLink>();
  /** Compact mode drops the explainer -- used on result cards, where space is tight. */
  readonly compact = input<boolean>(false);
}
