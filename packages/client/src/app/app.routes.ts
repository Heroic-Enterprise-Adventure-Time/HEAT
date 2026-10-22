import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes } from '@angular/router';
import { Camp } from './camp/camp';
import { FacilityPanel } from './camp/panels/facility-panel';
import { HallPanel } from './camp/panels/hall-panel';
import { HeroCard } from './camp/panels/hero-card';
import { JobBoardPanel } from './camp/panels/job-board-panel';
import { JobPanel } from './camp/panels/job-panel';
import { SeenHeroCard } from './camp/panels/seen-hero-card';
import { Home } from './home/home';
import { Session } from './session';

/**
 * A camp is for a signed-in player; anyone else is sent to the home page and
 * its sign-in, and the session keeps the path refused, so that sign-in
 * returns to it (Issue-96).
 */
export const signedIn: CanActivateFn = (_route, state) => {
  const session = inject(Session);
  if (session.user()) return true;
  session.keep(state.url);
  return inject(Router).createUrlTree(['/']);
};

/**
 * The addresses (Issue-89): the home page, and a camp with its panel as a
 * path, `/camp/<location>/<facility>` or `/camp/<location>/heroes-hall/heroes/<id>`,
 * so a hero's card sits under the hall; another player's hero seen about the
 * camp is `/camp/<location>/seen/<id>`, under no facility. A job's detail
 * sits under the job board, `/camp/<location>/job-board/jobs/<id>`, and the
 * open adventure is `/adventure`, outside any camp (Issue-115). Anything else
 * goes home, which sends a signed-in player on to their camp.
 */
export const routes: Routes = [
  { path: '', component: Home, pathMatch: 'full' },
  {
    path: 'camp/:location',
    component: Camp,
    canActivate: [signedIn],
    children: [
      { path: '', redirectTo: 'heroes-hall', pathMatch: 'full' },
      { path: 'heroes-hall', component: HallPanel },
      { path: 'heroes-hall/heroes/:hero', component: HeroCard },
      { path: 'job-board', component: JobBoardPanel },
      { path: 'job-board/jobs/:job', component: JobPanel },
      { path: 'seen/:hero', component: SeenHeroCard },
      { path: ':facility', component: FacilityPanel },
    ],
  },
  // Loaded on first use, so the engine that plays it is a chunk of its own (Issue-15).
  { path: 'adventure', loadComponent: () => import('./adventure/adventure').then((m) => m.Adventure), canActivate: [signedIn] },
  { path: '**', redirectTo: '' },
];
