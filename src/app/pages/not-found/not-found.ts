import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <h1>Page not found</h1>
    <p>This page does not exist.</p>
    <a routerLink="/customers">Go to Customers</a>
  `,
})
export class NotFound {}
