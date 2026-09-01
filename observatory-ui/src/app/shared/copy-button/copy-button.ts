import { Component, input, signal } from '@angular/core';

/** Copy-to-clipboard with visible confirmation -- identifiers are meant to be pasted elsewhere,
 *  which is the entire point of a discovery hub surfacing them. */
@Component({
  selector: 'app-copy-button',
  imports: [],
  templateUrl: './copy-button.html',
  styleUrl: './copy-button.scss',
})
export class CopyButton {
  readonly value = input.required<string>();
  /** Describes what is being copied, for screen readers: "Copy DOI". */
  readonly label = input<string>('value');

  readonly copied = signal(false);
  readonly failed = signal(false);

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.value());
      this.failed.set(false);
      this.copied.set(true);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) -- say so rather than
      // silently appearing to succeed.
      this.copied.set(false);
      this.failed.set(true);
    }
    setTimeout(() => {
      this.copied.set(false);
      this.failed.set(false);
    }, 2000);
  }
}
