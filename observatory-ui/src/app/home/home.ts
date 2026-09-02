import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { RecordsService } from '../core/records.service';

interface ConstellationNode {
  x: number;
  y: number;
  r: number;
  accent?: boolean;
}

interface ConstellationEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Purely decorative hero backdrop -- a hand-placed, deterministic node/edge field (no runtime
 *  randomness, so server-rendered and client-rendered markup always match). Weighted into the
 *  outer thirds of a 1600x520 viewBox so the centre stays clear for the headline/search; a CSS
 *  radial mask in home.scss fades it out further. Two roughly mirrored clusters, left and right. */
const CONSTELLATION_NODES: ConstellationNode[] = [
  // Left cluster
  { x: 70, y: 120, r: 3 },
  { x: 130, y: 80, r: 2.5 },
  { x: 150, y: 180, r: 4, accent: true },
  { x: 90, y: 230, r: 2.5 },
  { x: 200, y: 60, r: 3 },
  { x: 220, y: 150, r: 2.5 },
  { x: 180, y: 260, r: 3 },
  { x: 260, y: 220, r: 2.5 },
  { x: 40, y: 300, r: 2.5 },
  { x: 120, y: 340, r: 3, accent: true },
  { x: 250, y: 320, r: 2.5 },
  { x: 300, y: 100, r: 2.5 },
  { x: 330, y: 200, r: 3 },
  { x: 60, y: 400, r: 2.5 },
  { x: 160, y: 420, r: 2.5 },
  { x: 280, y: 400, r: 2.5 },
  { x: 350, y: 320, r: 2.5 },
  { x: 20, y: 180, r: 2 },
  { x: 380, y: 80, r: 2 },
  { x: 400, y: 260, r: 2.5, accent: true },
  { x: 420, y: 420, r: 2 },
  { x: 100, y: 60, r: 2 },
  { x: 320, y: 440, r: 2 },
  { x: 10, y: 380, r: 2 },
  { x: 440, y: 160, r: 2 },
  { x: 460, y: 340, r: 2 },
  // Right cluster (mirrored around x=1600)
  { x: 1530, y: 120, r: 3 },
  { x: 1470, y: 80, r: 2.5 },
  { x: 1450, y: 180, r: 4, accent: true },
  { x: 1510, y: 230, r: 2.5 },
  { x: 1400, y: 60, r: 3 },
  { x: 1380, y: 150, r: 2.5 },
  { x: 1420, y: 260, r: 3 },
  { x: 1340, y: 220, r: 2.5 },
  { x: 1560, y: 300, r: 2.5 },
  { x: 1480, y: 340, r: 3, accent: true },
  { x: 1350, y: 320, r: 2.5 },
  { x: 1300, y: 100, r: 2.5 },
  { x: 1270, y: 200, r: 3 },
  { x: 1540, y: 400, r: 2.5 },
  { x: 1440, y: 420, r: 2.5 },
  { x: 1320, y: 400, r: 2.5 },
  { x: 1250, y: 320, r: 2.5 },
  { x: 1580, y: 180, r: 2 },
  { x: 1220, y: 80, r: 2 },
  { x: 1200, y: 260, r: 2.5, accent: true },
  { x: 1180, y: 420, r: 2 },
  { x: 1500, y: 60, r: 2 },
  { x: 1280, y: 440, r: 2 },
  { x: 1590, y: 380, r: 2 },
  { x: 1160, y: 160, r: 2 },
  { x: 1140, y: 340, r: 2 },
];

const CONSTELLATION_EDGES: ConstellationEdge[] = [
  // Left cluster
  { x1: 70, y1: 120, x2: 130, y2: 80 },
  { x1: 130, y1: 80, x2: 200, y2: 60 },
  { x1: 130, y1: 80, x2: 150, y2: 180 },
  { x1: 70, y1: 120, x2: 150, y2: 180 },
  { x1: 150, y1: 180, x2: 90, y2: 230 },
  { x1: 150, y1: 180, x2: 220, y2: 150 },
  { x1: 200, y1: 60, x2: 220, y2: 150 },
  { x1: 220, y1: 150, x2: 260, y2: 220 },
  { x1: 90, y1: 230, x2: 180, y2: 260 },
  { x1: 180, y1: 260, x2: 260, y2: 220 },
  { x1: 90, y1: 230, x2: 40, y2: 300 },
  { x1: 40, y1: 300, x2: 120, y2: 340 },
  { x1: 120, y1: 340, x2: 180, y2: 260 },
  { x1: 180, y1: 260, x2: 250, y2: 320 },
  { x1: 260, y1: 220, x2: 300, y2: 100 },
  { x1: 260, y1: 220, x2: 330, y2: 200 },
  { x1: 300, y1: 100, x2: 330, y2: 200 },
  { x1: 250, y1: 320, x2: 330, y2: 200 },
  { x1: 120, y1: 340, x2: 60, y2: 400 },
  { x1: 120, y1: 340, x2: 160, y2: 420 },
  { x1: 250, y1: 320, x2: 280, y2: 400 },
  { x1: 280, y1: 400, x2: 350, y2: 320 },
  { x1: 330, y1: 200, x2: 350, y2: 320 },
  { x1: 20, y1: 180, x2: 70, y2: 120 },
  { x1: 20, y1: 180, x2: 90, y2: 230 },
  { x1: 380, y1: 80, x2: 300, y2: 100 },
  { x1: 400, y1: 260, x2: 330, y2: 200 },
  { x1: 400, y1: 260, x2: 350, y2: 320 },
  { x1: 420, y1: 420, x2: 320, y2: 440 },
  { x1: 320, y1: 440, x2: 280, y2: 400 },
  { x1: 100, y1: 60, x2: 130, y2: 80 },
  { x1: 10, y1: 380, x2: 60, y2: 400 },
  { x1: 440, y1: 160, x2: 400, y2: 260 },
  { x1: 460, y1: 340, x2: 400, y2: 260 },
  // Right cluster (mirrored)
  { x1: 1530, y1: 120, x2: 1470, y2: 80 },
  { x1: 1470, y1: 80, x2: 1400, y2: 60 },
  { x1: 1470, y1: 80, x2: 1450, y2: 180 },
  { x1: 1530, y1: 120, x2: 1450, y2: 180 },
  { x1: 1450, y1: 180, x2: 1510, y2: 230 },
  { x1: 1450, y1: 180, x2: 1380, y2: 150 },
  { x1: 1400, y1: 60, x2: 1380, y2: 150 },
  { x1: 1380, y1: 150, x2: 1340, y2: 220 },
  { x1: 1510, y1: 230, x2: 1420, y2: 260 },
  { x1: 1420, y1: 260, x2: 1340, y2: 220 },
  { x1: 1510, y1: 230, x2: 1560, y2: 300 },
  { x1: 1560, y1: 300, x2: 1480, y2: 340 },
  { x1: 1480, y1: 340, x2: 1420, y2: 260 },
  { x1: 1420, y1: 260, x2: 1350, y2: 320 },
  { x1: 1340, y1: 220, x2: 1300, y2: 100 },
  { x1: 1340, y1: 220, x2: 1270, y2: 200 },
  { x1: 1300, y1: 100, x2: 1270, y2: 200 },
  { x1: 1350, y1: 320, x2: 1270, y2: 200 },
  { x1: 1480, y1: 340, x2: 1540, y2: 400 },
  { x1: 1480, y1: 340, x2: 1440, y2: 420 },
  { x1: 1350, y1: 320, x2: 1320, y2: 400 },
  { x1: 1320, y1: 400, x2: 1250, y2: 320 },
  { x1: 1270, y1: 200, x2: 1250, y2: 320 },
  { x1: 1580, y1: 180, x2: 1530, y2: 120 },
  { x1: 1580, y1: 180, x2: 1510, y2: 230 },
  { x1: 1220, y1: 80, x2: 1300, y2: 100 },
  { x1: 1200, y1: 260, x2: 1270, y2: 200 },
  { x1: 1200, y1: 260, x2: 1250, y2: 320 },
  { x1: 1180, y1: 420, x2: 1280, y2: 440 },
  { x1: 1280, y1: 440, x2: 1320, y2: 400 },
  { x1: 1500, y1: 60, x2: 1470, y2: 80 },
  { x1: 1590, y1: 380, x2: 1540, y2: 400 },
  { x1: 1160, y1: 160, x2: 1200, y2: 260 },
  { x1: 1140, y1: 340, x2: 1200, y2: 260 },
];

@Component({
  selector: 'app-home',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly records = inject(RecordsService);
  private readonly router = inject(Router);

  /** Decorative constellation backdrop geometry -- see the module-level comment above. */
  readonly constellationNodes = CONSTELLATION_NODES;
  readonly constellationEdges = CONSTELLATION_EDGES;

  private readonly stats = toSignal(
    this.records.getFacetStats().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  /** Real corpus figures, not fixture-derived -- see schema/generate_facet_stats.py. */
  readonly corpus = computed(() => this.stats()?.corpus ?? this.records.getStats());

  /** Positives-scoped figures (classification: positive) -- used for metrics that should describe
   *  the actual AI/ML methods set rather than the whole screened corpus, e.g. "with full text". */
  readonly searchSpace = computed(() => this.stats()?.search_space ?? this.records.getSearchSpaceStats());

  readonly query = signal('');

  search(): void {
    const q = this.query().trim();
    this.router.navigate(['/search'], { queryParams: q ? { q } : {} });
  }
}
