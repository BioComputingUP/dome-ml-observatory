import { Component } from '@angular/core';

interface Member {
  name: string;
  role: string;
  affiliation: string;
  photo: string;
  orcid?: string;
  github?: string;
}

interface AdvisoryMember {
  name: string;
  focus: string;
  affiliation: string;
  photo: string;
}

@Component({
  selector: 'app-about-team',
  imports: [],
  templateUrl: './about-team.html',
  styleUrl: './about-team.scss',
})
export class AboutTeam {
  readonly core: Member[] = [
    {
      name: 'Gavin Farrell',
      role: 'Lead developer — OSAI & DOME Observatory; Data curator — DOME Registry',
      affiliation: 'University of Padova',
      photo: 'assets/img/gavin.jpeg',
      orcid: '0000-0001-5166-8551',
      github: 'gavinf97',
    },
    {
      name: 'Silvio Tosatto',
      role: 'DOME PI',
      affiliation: 'University of Padova',
      photo: 'assets/img/Silvio-Tosatto.png',
      orcid: '0000-0003-4525-7793',
    },
    {
      name: 'Omar A Attafi',
      role: 'Lead developer — DOME Registry',
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
  ];

  /** Verbatim from dome-ml.org's Scientific Advisory Board section. */
  readonly advisory: AdvisoryMember[] = [
    {
      name: 'Sirarat Sarntivijai',
      focus: 'Industry & Interoperability',
      affiliation: 'Boehringer Ingelheim',
      photo: 'assets/img/sira_0.jpg',
    },
    {
      name: 'Daniel Garijo',
      focus: 'Academia, AI & Ontologies',
      affiliation: 'Universidad Politécnica de Madrid',
      photo: 'assets/img/daniel.png',
    },
    {
      name: 'Chris Hunter',
      focus: 'Publishing & Open Science',
      affiliation: 'GigaScience & GigaDB',
      photo: 'assets/img/Christopher-Hunter-10.png',
    },
  ];
}
