import { Component, inject } from '@angular/core';
import { Camp } from '../camp/camp';
import { Config } from '../config';
import { Session } from '../session';

/** The home page: the camp for a signed-in player; the name of the game and sign-in for anyone else. */
@Component({
  selector: 'heat-home',
  imports: [Camp],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly session = inject(Session);
  protected readonly config = inject(Config);
}
