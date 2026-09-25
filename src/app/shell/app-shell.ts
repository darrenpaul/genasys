import { DOCUMENT } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-shell',
  imports: [MatButton, MatToolbar, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.html',
  styles: `
    .skip-link:not(:focus) {
      position: absolute;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .active-link {
      text-decoration: underline;
      text-underline-offset: 0.3em;
    }

    nav {
      display: flex;
      margin-inline-start: auto;
    }

    main {
      padding: 1rem;
    }
  `,
})
export class AppShell {
  private readonly document = inject(DOCUMENT);
  private hasActivatedPage = false;

  protected focusPageHeading(): void {
    // Preserve browser focus on initial load. Subsequent outlet activations are page changes,
    // unlike query-parameter updates, which reuse the routed component.
    if (!this.hasActivatedPage) {
      this.hasActivatedPage = true;
      return;
    }

    const heading = this.document.querySelector<HTMLElement>('#main-content h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  }
}
