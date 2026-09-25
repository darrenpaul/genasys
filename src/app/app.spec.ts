import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { NotificationService } from './shell/notification.service';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
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
    expect(toolbar?.querySelector('span')?.textContent).toBe('Genesys');
    expect(toolbar?.querySelector('nav[aria-label="Primary navigation"]')).toBeTruthy();
    expect(toolbar?.querySelectorAll('mat-toolbar-row')).toHaveLength(0);
    expect(root.querySelector('main#main-content h1')?.textContent).toBe('Customers');
    expect(document.title).toBe('Customers — Genesys');
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
    expect(document.title).toBe('Page not found — Genesys');

    await router.navigateByUrl('/customers/missing');
    await fixture.whenStable();
    expect(root.querySelector('main h1')?.textContent).toBe('Page not found');
    expect(root.querySelector('nav a[href="/customers"]')?.hasAttribute('aria-current')).toBe(
      false,
    );
    expect(root.querySelector('nav a[href="/quotes"]')?.hasAttribute('aria-current')).toBe(false);
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
    expect(quotes.classList.contains('active-link')).toBe(true);
    expect(root.querySelector('main h1')?.textContent).toBe('Quotes');
    expect(document.title).toBe('Quotes — Genesys');
    expect(document.activeElement).toBe(root.querySelector('main h1'));

    const heading = root.querySelector<HTMLElement>('main h1')!;
    const focus = vi.spyOn(heading, 'focus');
    await router.navigateByUrl('/quotes?customerId=123');
    await fixture.whenStable();
    expect(quotes.getAttribute('aria-current')).toBe('page');
    expect(quotes.classList.contains('active-link')).toBe(true);
    expect(document.activeElement).toBe(heading);
    expect(focus).not.toHaveBeenCalled();
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
