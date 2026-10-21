import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Config } from '../config';
import { Game } from '../game';
import { Session } from '../session';

/** The home page: the name of the game and sign-in; a signed-in player goes on to their camp. */
@Component({
  selector: 'heat-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly session = inject(Session);
  protected readonly config = inject(Config);

  constructor() {
    const router = inject(Router);
    const game = inject(Game);
    effect(() => {
      if (this.session.user()) void router.navigate(['/camp', game.location()], { replaceUrl: true });
    });
  }
}
