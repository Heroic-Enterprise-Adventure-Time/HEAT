import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './header/header';

/** The root component: the header bar, then the page the route shows. */
@Component({
  imports: [Header, RouterOutlet],
  selector: 'heat-root',
  template: '<heat-header /><router-outlet />',
})
export class App {}
