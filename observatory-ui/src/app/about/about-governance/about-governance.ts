import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface AdvisoryMember {
  name: string;
  focus: string;
  affiliation: string;
  photo: string;
}

@Component({
  selector: 'app-about-governance',
  imports: [RouterLink],
  templateUrl: './about-governance.html',
  styleUrl: './about-governance.scss',
})
export class AboutGovernance {
  /**
   * The Board advises the DOME services as a whole (Recommendations, Registry, Observatory), not
   * this site specifically -- `focus` is worded to describe the perspective each member brings to
   * that remit rather than their day job, which is what `affiliation` carries.
   * Photos are 280x280 WebP, twice the 140px they display at, so they stay sharp on high-density
   * screens at under 10 KB each; the originals (two of them 250-350 KB PNGs) were what made the
   * page slow.
   */
  readonly advisory: AdvisoryMember[] = [
    {
      name: 'Sirarat Sarntivijai',
      focus: 'Advises on industry adoption & interoperability',
      affiliation: 'Boehringer Ingelheim',
      photo: 'assets/img/sira.webp',
    },
    {
      name: 'Daniel Garijo',
      focus: 'Advises on academia, AI & ontologies',
      affiliation: 'Universidad Politécnica de Madrid',
      photo: 'assets/img/daniel.webp',
    },
    {
      name: 'Chris Hunter',
      focus: 'Advises on scholarly publishing & open science',
      // Updated from 'GigaScience & GigaDB': the international GigaDB and editorial teams were
      // cut in September 2025. Affiliation only, no title -- no public source confirms one.
      affiliation: 'University of Exeter',
      photo: 'assets/img/christopher-hunter.webp',
    },
  ];
}
