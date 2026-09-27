import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatListItem, MatListItemIcon, MatNavList } from '@angular/material/list';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-shell',
  imports: [
    MatButton,
    MatIcon,
    MatListItem,
    MatListItemIcon,
    MatNavList,
    MatSidenav,
    MatSidenavContainer,
    MatSidenavContent,
    MatToolbar,
    NgOptimizedImage,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './app-shell.html',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100dvh;
    }

    header {
      flex: none;
    }

    mat-sidenav-content main {
      height: 100%;
    }

    mat-sidenav-content main:has(app-customer-form, app-quote-form, app-not-found) {
      height: auto;
      min-height: 100%;
    }

    .skip-link:not(:focus) {
      position: absolute;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .app-toolbar {
      --mat-toolbar-container-background-color: linear-gradient(to right, #2e3351, #024da9);
      --mat-toolbar-container-text-color: #fff;
    }

    .brand-logo {
      width: clamp(7.5rem, 35vw, 9.375rem);
      height: auto;
    }

    .menu-toggle {
      display: none;
      margin-inline-start: auto;
    }

    mat-toolbar.app-toolbar .menu-toggle {
      --mat-button-text-label-text-color: #fff;
      --mat-button-text-state-layer-color: #fff;
    }

    .shell-container {
      flex: 1;
      min-height: 0;
    }

    .sidebar {
      width: 15rem;
      max-width: calc(100vw - 3rem);
      --mat-sidenav-container-background-color: #2f3351;
      --mat-sidenav-container-text-color: #fff;
      --mat-sidenav-container-shape: 0;
      --mat-list-list-item-label-text-color: #b7b8c3;
      --mat-list-list-item-hover-label-text-color: #b7b8c3;
      --mat-list-list-item-focus-label-text-color: #b7b8c3;
      --mat-list-list-item-leading-icon-color: #b7b8c3;
      --mat-list-list-item-one-line-container-height: 64px;
      --mat-list-list-item-hover-leading-icon-color: #b7b8c3;
      --mat-list-active-indicator-color: #4c76b7;
      --mat-list-active-indicator-shape: 0;
    }

    .sidebar mat-nav-list {
      padding: 0;
    }

    .sidebar a[aria-current='page'] {
      --mat-list-list-item-label-text-color: #fff;
      --mat-list-list-item-hover-label-text-color: #fff;
      --mat-list-list-item-focus-label-text-color: #fff;
      --mat-list-list-item-leading-icon-color: #fff;
      --mat-list-list-item-hover-leading-icon-color: #fff;
    }

    @media (max-width: 767px) {
      .menu-toggle {
        display: inline-flex;
      }
    }

    @media (max-width: 599px) {
      .sidebar {
        --mat-list-list-item-one-line-container-height: 56px;
      }
    }
  `,
})
export class AppShell {
  private readonly document = inject(DOCUMENT);
  private readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 767px)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  protected readonly navLinkMatchOptions: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };
  private hasActivatedPage = false;

  protected closeMobileNavigation(drawer: MatSidenav): void {
    if (this.isMobile()) {
      void drawer.close();
    }
  }

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
