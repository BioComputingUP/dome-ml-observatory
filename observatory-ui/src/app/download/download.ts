import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../core/records.service';

@Component({
  selector: 'app-download',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './download.html',
  styleUrl: './download.scss',
})
export class Download {
  private readonly records = inject(RecordsService);

  private readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());
  readonly schemaVersion = computed(() => this.stats()?.schema_version ?? '1.1.0');
}
