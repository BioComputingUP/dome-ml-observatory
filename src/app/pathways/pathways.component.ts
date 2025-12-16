import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-pathways',
  templateUrl: './pathways.component.html',
})
export class PathwaysComponent implements OnInit {

  openCards: { [key: number]: boolean } = {};

  constructor() { }

  ngOnInit(): void {
    // Initialize all cards to be closed
    for (let i = 1; i <= 12; i++) {
      this.openCards[i] = false;
    }
  }

  toggleCard(cardId: number): void {
    this.openCards[cardId] = !this.openCards[cardId];
  }

  isCardOpen(cardId: number): boolean {
    return this.openCards[cardId];
  }
}
