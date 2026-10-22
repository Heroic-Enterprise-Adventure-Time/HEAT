import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './header/header';
import { Updates } from './updates';

/** The root component: the header bar, then the page the route shows; and the watch for a newer deploy. */
@Component({
  imports: [Header, RouterOutlet],
  selector: 'heat-root',
  template: '<heat-header /><router-outlet />',
})
export class App {
  constructor() {
    inject(Updates);
  }
}
