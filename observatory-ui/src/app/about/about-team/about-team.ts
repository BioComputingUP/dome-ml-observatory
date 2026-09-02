import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Member {
  name: string;
  role: string;
  affiliation: string;
  photo: string;
  orcid?: string;
  github?: string;
}

@Component({
  selector: 'app-about-team',
  imports: [RouterLink],
  templateUrl: './about-team.html',
  styleUrl: './about-team.scss',
})
export class AboutTeam {
  /** Rendered in array order (the template does not sort), so this order IS the display order. */
  readonly core: Member[] = [
    {
      name: 'Gavin Farrell',
      role: 'PhD Candidate',
      affiliation: 'University of Padova',
      photo: 'assets/img/gavin.jpeg',
      orcid: '0000-0001-5166-8551',
      github: 'gavinf97',
    },
    {
      name: 'Omar A Attafi',
      role: 'PhD Candidate',
      affiliation: 'University of Padova',
      photo: 'assets/img/omar.jpg',
      orcid: '0009-0002-2327-9430',
      github: 'Abdelghaniomar',
    },
    {
      name: 'Ivan Mičetić',
      role: 'Lab Services Manager',
      affiliation: 'University of Padova',
      photo: 'assets/img/ivan.jpeg',
      orcid: '0000-0003-1691-8425',
      github: 'ivanmicetic',
    },
    {
      name: 'Silvio Tosatto',
      role: 'Lab Principal Investigator',
      affiliation: 'University of Padova',
      photo: 'assets/img/Silvio-Tosatto.png',
      orcid: '0000-0003-4525-7793',
    },
  ];
}
