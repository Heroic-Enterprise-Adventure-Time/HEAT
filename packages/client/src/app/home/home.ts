import { Component, inject } from '@angular/core';
import { Config } from '../config';
import { Session } from '../session';

/** The home page: the name of the game, and sign-in or the signed-in player. */
@Component({
  selector: 'heat-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly session = inject(Session);
  protected readonly config = inject(Config);
}
