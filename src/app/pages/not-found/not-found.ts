import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageToolbar } from '@app/shared/page-toolbar/page-toolbar';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, PageToolbar],
  template: `
    <app-page-toolbar title="Page not found" />
    <div class="page-content">
      <p>This page does not exist.</p>
      <a routerLink="/customers">Go to Customers</a>
    </div>
  `,
})
export class NotFound {}
