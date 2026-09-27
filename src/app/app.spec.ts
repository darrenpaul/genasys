import { TestBed } from '@angular/core/testing';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { NotificationService } from './shell/notification.service';
import { Subject } from 'rxjs';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // The customer routes register their own NgRx slice with `provideState`
      // and `provideEffects`, which require a root store and root effects to
      // already exist. The app config provides those in production; the test
      // has to provide them too, along with a fake HTTP backend.
      providers: [
        provideRouter(routes),
        provideStore(),
        provideEffects(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('provides skip, navigation and main landmarks', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/customers');
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const skipLink = root.querySelector<HTMLAnchorElement>('a');
    expect(skipLink?.textContent).toContain('Skip to main content');
    expect(skipLink?.getAttribute('href')).toBe('#main-content');
    const toolbar = root.querySelector('header mat-toolbar');
    const logo = toolbar?.querySelector<HTMLImageElement>('img.brand-logo');
    expect(logo?.getAttribute('src')).toContain('/genasys-logo.webp');
    expect(logo?.alt).toBe('Genasys');
    expect(toolbar?.querySelector('nav')).toBeNull();
    expect(
      root.querySelector('mat-sidenav mat-nav-list[aria-label="Primary navigation"]'),
    ).toBeTruthy();
    expect(root.querySelector('mat-sidenav.mat-drawer-opened')).toBeTruthy();
    expect(
      getComputedStyle(toolbar!).getPropertyValue('--mat-toolbar-container-background-color'),
    ).toMatch(/linear-gradient\(to right,\s*#2e3351,\s*#024da9\)/);
    expect(getComputedStyle(toolbar!).getPropertyValue('--mat-toolbar-container-text-color')).toBe(
      '#fff',
    );
    const sidebar = root.querySelector('mat-sidenav')!;
    expect(getComputedStyle(sidebar).backgroundImage).toBe('none');
    expect(
      getComputedStyle(sidebar).getPropertyValue('--mat-sidenav-container-background-color'),
    ).toBe('#2f3351');
    expect(getComputedStyle(sidebar).getPropertyValue('--mat-sidenav-container-shape')).toBe('0');
    const activeLink = root.querySelector('mat-nav-list a[aria-current="page"]')!;
    expect(activeLink.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe(
      'group',
    );
    expect(
      getComputedStyle(activeLink).getPropertyValue('--mat-list-list-item-leading-icon-color'),
    ).toBe('#fff');
    expect(
      getComputedStyle(activeLink).getPropertyValue('--mat-list-list-item-label-text-color'),
    ).toBe('#fff');
    expect(getComputedStyle(activeLink).getPropertyValue('--mat-list-active-indicator-color')).toBe(
      '#4c76b7',
    );
    expect(getComputedStyle(activeLink).getPropertyValue('--mat-list-active-indicator-shape')).toBe(
      '0',
    );
    const inactiveLink = root.querySelector('mat-nav-list a[href="/quotes"]')!;
    expect(inactiveLink.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe(
      'request_quote',
    );
    expect(
      getComputedStyle(inactiveLink).getPropertyValue('--mat-list-list-item-leading-icon-color'),
    ).toBe('#b7b8c3');
    expect(
      getComputedStyle(inactiveLink).getPropertyValue('--mat-list-list-item-label-text-color'),
    ).toBe('#b7b8c3');
    for (const token of [
      '--mat-list-list-item-label-text-size',
      '--mat-list-list-item-label-text-weight',
    ]) {
      expect(getComputedStyle(activeLink).getPropertyValue(token)).toBe(
        getComputedStyle(inactiveLink).getPropertyValue(token),
      );
    }
    const menu = root.querySelector<HTMLButtonElement>('header button.menu-toggle')!;
    expect(getComputedStyle(menu).getPropertyValue('--mat-button-text-label-text-color')).toBe(
      '#fff',
    );
    expect(toolbar?.querySelectorAll('mat-toolbar-row')).toHaveLength(0);
    expect(root.querySelector('main#main-content h1')?.textContent).toBe('Customers');
    expect(document.title).toBe('Customers — Genasys');
  });

  it('redirects root to Customers', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/');
    await fixture.whenStable();
    expect(router.url).toBe('/customers');
  });

  it('shows a useful page for unknown URLs', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/missing');
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('main h1')?.textContent).toBe('Page not found');
    expect(root.querySelector('main a[href="/customers"]')?.textContent).toContain('Customers');
    expect(document.title).toBe('Page not found — Genasys');

    await router.navigateByUrl('/customers/missing');
    await fixture.whenStable();
    expect(root.querySelector('main h1')?.textContent).toBe('Page not found');
    expect(
      root.querySelector('mat-nav-list a[href="/customers"]')?.hasAttribute('aria-current'),
    ).toBe(false);
    expect(root.querySelector('mat-nav-list a[href="/quotes"]')?.hasAttribute('aria-current')).toBe(
      false,
    );
  });

  it('updates active link, page title and heading focus on navigation', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/customers');
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const customers = root.querySelector<HTMLAnchorElement>('a[href="/customers"]')!;
    const quotes = root.querySelector<HTMLAnchorElement>('a[href="/quotes"]')!;
    expect(customers.getAttribute('aria-current')).toBe('page');
    expect(quotes.hasAttribute('aria-current')).toBe(false);

    quotes.click();
    await fixture.whenStable();
    expect(router.url).toBe('/quotes');
    expect(customers.hasAttribute('aria-current')).toBe(false);
    expect(quotes.getAttribute('aria-current')).toBe('page');
    expect(quotes.classList.contains('mdc-list-item--activated')).toBe(true);
    expect(root.querySelector('main h1')?.textContent).toBe('Quotes');
    expect(document.title).toBe('Quotes — Genasys');
    expect(document.activeElement).toBe(root.querySelector('main h1'));

    const heading = root.querySelector<HTMLElement>('main h1')!;
    const focus = vi.spyOn(heading, 'focus');
    await router.navigateByUrl('/quotes?customerId=123');
    await fixture.whenStable();
    expect(quotes.getAttribute('aria-current')).toBe('page');
    expect(quotes.classList.contains('mdc-list-item--activated')).toBe(true);
    expect(document.activeElement).toBe(heading);
    expect(focus).not.toHaveBeenCalled();
  });

  it('opens mobile navigation and closes it after choosing a route', async () => {
    const viewport = new Subject<BreakpointState>();
    TestBed.overrideProvider(BreakpointObserver, { useValue: { observe: () => viewport } });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    viewport.next({ matches: true, breakpoints: { '(max-width: 767px)': true } });
    fixture.detectChanges();
    await router.navigateByUrl('/customers');
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const drawer = root.querySelector('mat-sidenav')!;
    const toggle = root.querySelector<HTMLButtonElement>('button.menu-toggle')!;
    expect(drawer.classList.contains('mat-drawer-opened')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    await fixture.whenStable();
    expect(drawer.classList.contains('mat-drawer-opened')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    root.querySelector<HTMLAnchorElement>('mat-nav-list a[href="/quotes"]')!.click();
    await fixture.whenStable();
    expect(router.url).toBe('/quotes');
    expect(drawer.classList.contains('mat-drawer-opened')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('main h1')?.textContent).toBe('Quotes');
    expect(document.activeElement).toBe(root.querySelector('main h1'));

    viewport.next({ matches: false, breakpoints: { '(max-width: 767px)': false } });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(drawer.classList.contains('mat-drawer-opened')).toBe(true);
  });

  it('shows global feedback through Material snack bar', () => {
    const snackBar = TestBed.inject(MatSnackBar);
    TestBed.inject(NotificationService).announce('Saved successfully');
    expect(document.querySelector('mat-snack-bar-container')?.textContent).toContain(
      'Saved successfully',
    );
    snackBar.dismiss();
  });
});
