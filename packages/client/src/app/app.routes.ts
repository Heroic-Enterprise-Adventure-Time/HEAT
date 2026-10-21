import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes } from '@angular/router';
import { Camp } from './camp/camp';
import { FacilityPanel } from './camp/panels/facility-panel';
import { HallPanel } from './camp/panels/hall-panel';
import { HeroCard } from './camp/panels/hero-card';
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
 * so a hero's card sits under the hall. Anything else goes home, which sends
 * a signed-in player on to their camp.
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
      { path: ':facility', component: FacilityPanel },
    ],
  },
  { path: '**', redirectTo: '' },
];
