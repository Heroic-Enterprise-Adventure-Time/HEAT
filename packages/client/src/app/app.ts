import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** The root component: the shell every page renders inside. */
@Component({
  imports: [RouterOutlet],
  selector: 'heat-root',
  template: '<router-outlet />',
})
export class App {}
