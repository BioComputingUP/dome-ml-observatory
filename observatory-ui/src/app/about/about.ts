import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../core/records.service';

@Component({
  selector: 'app-about',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class About {
  private readonly records = inject(RecordsService);

  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());
}
