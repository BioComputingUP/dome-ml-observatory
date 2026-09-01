import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../core/records.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly records = inject(RecordsService);
  private readonly router = inject(Router);

  private readonly stats = toSignal(
    this.records.getFacetStats().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  /** Real corpus figures, not fixture-derived -- see schema/generate_facet_stats.py. */
  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());
  readonly enriched = computed(() => this.corpus().enriched);

  readonly query = signal('');

  search(): void {
    const q = this.query().trim();
    this.router.navigate(['/search'], { queryParams: q ? { q } : {} });
  }
}
