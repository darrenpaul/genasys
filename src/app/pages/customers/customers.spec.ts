// Unit tests for the Customers list page.
//
// Coming from Vue Test Utils: `TestBed` is Angular's `mount()` plus the
// `global.plugins` config rolled into one. `configureTestingModule` sets up
// the DI providers the component needs (router, store, HTTP), and
// `createComponent` mounts it into a real DOM (jsdom under Vitest).
//
// No HTTP is mocked with msw or axios-mock-adapter. Instead
// `provideHttpClientTesting()` swaps the HTTP backend for an in-memory one,
// and `HttpTestingController` lets each test assert which requests were made
// and hand back a fake response with `.flush(...)`. `http.verify()` at the end
// fails the test if any request was made that the test did not expect.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { provideRouter } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideState, provideStore, Store } from '@ngrx/store';
import { customerActions } from './data-access/customer.store';
import { Customers } from './customers';
import { Customer } from './data-access/customer.model';
import { customerEffects, customerFeature } from './data-access/customer.store';
import { CustomerQuotesApi, CustomersApi } from './data-access/customers-api';

const rows: Customer[] = [
  {
    id: 'c1',
    firstName: 'Amina',
    lastName: 'Okafor',
    email: 'amina@example.test',
    nationality: { code: 'NG', name: 'Nigeria' },
    createdAt: '2025-01-01',
    addresses: [
      {
        id: 'a1',
        street: 'Maple Lane',
        city: 'Lagos',
        suburb: 'Yaba',
        postalCode: '100001',
      },
    ],
    universities: [{ id: 'u1', name: 'University of Lagos', website: null }],
  },
  {
    id: 'c2',
    firstName: 'Maya',
    lastName: 'Chen',
    email: 'maya@example.test',
    nationality: null,
    createdAt: '2025-01-02',
    addresses: [
      {
        id: 'a2',
        street: 'River Road',
        city: 'Melbourne',
        suburb: 'Richmond',
        postalCode: '3121',
      },
    ],
    universities: [],
  },
];

// Raw `/api/quotes` rows for the "Quotes" column: Maya (c2) has one quote,
// Amina (c1) has none, so her quotes link renders disabled.
const quotes = [{ id: 'q1', customerId: 'c2', amountInMinorUnits: 1000, status: 'draft' }];

describe('Customers page', () => {
  beforeEach(async () => {
    // Mirrors the real `providers` in customer.routes.ts, plus the testing
    // HTTP backend. `provideStore()` creates the root store; `provideState`
    // adds the customers slice to it.
    await TestBed.configureTestingModule({
      imports: [Customers],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore(),
        provideState(customerFeature),
        provideEffects(customerEffects),
        CustomersApi,
        CustomerQuotesApi,
      ],
    }).compileComponents();
  });

  it('filters intended text, ignores hidden IDs, and sorts by name', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    // `detectChanges()` runs change detection, which triggers the constructor's
    // `loadRequested` dispatch and renders. Then we answer the GET the effect
    // made, wait for async work to settle, and render again.
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const names = () =>
      [...root.querySelectorAll('tr.mat-mdc-row td:first-child')].map((cell) =>
        cell.textContent?.trim(),
      );
    expect(names()).toEqual(['Maya Chen', 'Amina Okafor']);
    expect(root.querySelector('.filter-results[role="status"]')?.textContent?.trim()).toBe(
      '2 customers found.',
    );
    const input = root.querySelector<HTMLInputElement>('input[matinput]')!;
    expect(getComputedStyle(input.closest('mat-form-field')!).width).toBe('100%');
    input.value = 'lagos';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(names()).toEqual(['Amina Okafor']);
    expect(root.querySelector('.filter-results[role="status"]')?.textContent?.trim()).toBe(
      '1 customer found.',
    );
    input.value = 'c1';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(names()).toEqual([]);
    expect(root.querySelector('.filter-results[role="status"]')?.textContent?.trim()).toBe(
      'No customers match your search.',
    );
    const clear = root.querySelector<HTMLButtonElement>(
      'mat-form-field button[aria-label="Clear customer search"]',
    )!;
    expect(clear.querySelector('mat-icon[aria-hidden="true"]')?.textContent).toBe('close');
    clear.click();
    await fixture.whenStable();
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(root.querySelector('button[aria-label="Clear customer search"]')).toBeNull();
    expect(names()).toEqual(['Maya Chen', 'Amina Okafor']);
    http.verify();
  });

  it('treats IDs matching object properties as having zero quotes when absent', async () => {
    const fixture = TestBed.createComponent(Customers);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('td.mat-column-quotes')?.textContent?.trim()).toBe('0');
    expect(root.querySelector('.quotes-button')?.getAttribute('aria-disabled')).toBe('true');
    // NgRx's entity adapter does not support these IDs as entity keys, so
    // exercise the counts lookup itself without inserting them into the store.
    const component = fixture.componentInstance as unknown as {
      quoteCount(customer: Customer): number | null;
    };
    for (const id of ['toString', 'constructor', '__proto__']) {
      expect(component.quoteCount({ ...rows[0], id })).toBe(0);
    }
    http.verify();
  });

  it('right-aligns row actions in Quotes, Edit, Delete order', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    fixture.detectChanges();

    const actions = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      'tr.mat-mdc-row .row-actions',
    )!;
    expect(getComputedStyle(actions).justifyContent).toBe('flex-end');
    expect([...actions.children].map((button) => button.textContent?.trim())).toEqual([
      'request_quote',
      'edit',
      'delete',
    ]);
    const quotesLink = actions.querySelector<HTMLAnchorElement>('.quotes-button')!;
    expect(quotesLink.getAttribute('href')).toBe('/quotes?customerId=c2');
    expect(quotesLink.getAttribute('aria-label')).toBe('View quotes for Maya Chen');
    expect(quotesLink.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe(
      'request_quote',
    );
    expect(
      fixture.debugElement.query(By.css('.quotes-button')).injector.get(MatTooltip).message,
    ).toBe('View quotes for Maya Chen');
    const editLink = actions.querySelector<HTMLAnchorElement>('.edit-button')!;
    expect(editLink.getAttribute('matButton')).toBe('tonal');
    expect(editLink.classList.contains('mat-tonal-button')).toBe(true);
    expect(editLink.getAttribute('aria-label')).toBe('Edit Maya Chen');
    expect(
      fixture.debugElement.query(By.css('.edit-button')).injector.get(MatTooltip).message,
    ).toBe('Edit Maya Chen');
    expect(editLink.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe(
      'edit',
    );
    const deleteButton = actions.querySelector<HTMLButtonElement>('.delete-button')!;
    expect(deleteButton.getAttribute('aria-label')).toBe('Delete Maya Chen');
    expect(
      fixture.debugElement.query(By.css('.delete-button')).injector.get(MatTooltip).message,
    ).toBe('Delete Maya Chen');
    expect(deleteButton.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe(
      'delete',
    );
    expect(
      getComputedStyle(deleteButton).getPropertyValue('--mat-button-filled-container-color'),
    ).toBe('#b91c1c');
    http.verify();
  });

  it('confirms deletion, rechecks quotes, and removes customer after API success', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Delete Amina Okafor"]')!.click();
    http
      .expectOne(
        (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
      )
      .flush([]);
    await fixture.whenStable();
    const dialog = document.querySelector('mat-dialog-container')!;
    expect(dialog.textContent).toContain('Delete Amina Okafor?');
    http.expectNone('/api/customers/c1');
    [...dialog.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Delete')!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 200)); // Material dialog close animation
    http
      .expectOne(
        (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
      )
      .flush([]);
    const deletion = http.expectOne('/api/customers/c1');
    expect(deletion.request.method).toBe('DELETE');
    deletion.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('button[aria-label="Delete Amina Okafor"]')).toBeNull();
    http.verify();
  });

  it('blocks customer delete when quote appears after confirmation', async () => {
    const fixture = TestBed.createComponent(Customers);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Delete Amina Okafor"]')!.click();
    http
      .expectOne(
        (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
      )
      .flush([]);
    await fixture.whenStable();
    const dialog = document.querySelector('mat-dialog-container')!;
    [...dialog.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Delete')!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    http
      .expectOne(
        (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
      )
      .flush([{ id: 'q1' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('Customer has quotes. Delete quotes first.');
    expect(root.querySelector('button[aria-label="Delete Amina Okafor"]')).toBeTruthy();
    http.expectNone('/api/customers/c1');
    http.verify();
  });

  it('offers Retry after a failed refresh with previously loaded rows', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    const store = TestBed.inject(Store);
    store.dispatch(customerActions.loadRequested());
    http.expectOne('/api/customers').flush('offline', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Amina Okafor');
    const retry = [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Retry',
    );
    expect(retry).toBeTruthy();
    retry!.click();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    http.verify();
  });

  // `fixture.destroy()` unmounts the page, which dispatches `deleteCheckDismissed`
  // from its `onDestroy` hook. `pending.cancelled` is HttpTestingController's
  // way of confirming the effect unsubscribed and the request was aborted. A
  // fresh page instance must then start with an enabled Delete button.
  it('cancels pending dependency lookup when list page is destroyed', async () => {
    const fixture = TestBed.createComponent(Customers);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Delete Amina Okafor"]')!.click();
    const pending = http.expectOne(
      (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
    );
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    const next = TestBed.createComponent(Customers);
    next.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await next.whenStable();
    next.detectChanges();
    const freshButton = (next.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Delete Amina Okafor"]',
    )!;
    expect(freshButton.disabled).toBe(false);
    freshButton.click();
    http
      .expectOne(
        (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
      )
      .flush([{ id: 'q1' }]);
    http.verify();
  });

  // Dispatching `deleteCheckAllowed` with a made-up token simulates a result
  // from a previous page instance arriving late. No dialog may open.
  it('ignores a dependency result from an earlier page instance', async () => {
    const fixture = TestBed.createComponent(Customers);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    TestBed.inject(Store).dispatch(
      customerActions.deleteCheckAllowed({ id: 'c1', token: 'old-page' }),
    );
    fixture.detectChanges();
    expect(document.querySelector('mat-dialog-container')).toBeNull();
    http.verify();
  });

  it('fails closed on malformed quote lookup and allows retry', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete Amina Okafor"]',
    )!;
    button.click();
    http
      .expectOne(
        (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
      )
      .flush({ bad: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('Could not check related quotes. Retry deletion.');
    http.expectNone('/api/customers/c1');
    button.click();
    http
      .expectOne(
        (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
      )
      .flush([{ id: 'q1' }]);
    http.verify();
  });

  // The blocked state now also renders a "View quotes" link pre-filtered to
  // this customer; the href assertion covers `[queryParams]` serialisation.
  it('blocks deletion when customer has related quotes', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Delete Amina Okafor"]')!.click();
    http
      .expectOne(
        (request) => request.url === '/api/quotes' && request.params.get('customerId') === 'c1',
      )
      .flush([{ id: 'q1', customerId: 'c1' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('delete related quotes first');
    expect(root.querySelector('a[href="/quotes?customerId=c1"]')).toBeTruthy();
    http.expectNone('/api/customers/c1');
    http.verify();
  });

  it('shows sortable quote counts and disables the quotes link when a customer has none', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    // Before the counts answer, the column shows a placeholder and the link stays usable.
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const cells = () =>
      [...root.querySelectorAll('tr.mat-mdc-row td.quotes-cell')].map((cell) =>
        cell.textContent?.trim(),
      );
    expect(cells()).toEqual(['—', '—']);
    expect(root.querySelectorAll('a.quotes-button[aria-disabled="true"]').length).toBe(0);
    http.expectOne('/api/quotes').flush([...quotes, { id: 'q2', customerId: 'c2' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    // Default sort is by name: Maya (2 quotes) then Amina (0).
    expect(cells()).toEqual(['2', '0']);
    const aminaLink = root.querySelector<HTMLAnchorElement>(
      'a.quotes-button[aria-label="No quotes for Amina Okafor"]',
    )!;
    expect(aminaLink.getAttribute('aria-disabled')).toBe('true');
    // Without an href the anchor is out of the tab order by itself, like a
    // disabled button, and there is nothing for a click or Enter to navigate to.
    expect(aminaLink.hasAttribute('href')).toBe(false);
    expect(aminaLink.hasAttribute('tabindex')).toBe(false);
    expect(
      fixture.debugElement
        .query(By.css('a.quotes-button[aria-disabled="true"]'))
        .injector.get(MatTooltip).message,
    ).toBe('No quotes for Amina Okafor');
    const mayaLink = root.querySelector<HTMLAnchorElement>(
      'a.quotes-button[aria-label="View quotes for Maya Chen"]',
    )!;
    expect(mayaLink.getAttribute('aria-disabled')).toBeNull();
    expect(mayaLink.getAttribute('href')).toBe('/quotes?customerId=c2');
    // Sort by the Quotes column: ascending puts Amina (0) first.
    const header = [...root.querySelectorAll<HTMLElement>('th')].find((th) =>
      th.textContent?.includes('Quotes'),
    )!;
    header.querySelector<HTMLElement>('.mat-sort-header-container')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cells()).toEqual(['0', '2']);
    header.querySelector<HTMLElement>('.mat-sort-header-container')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cells()).toEqual(['2', '0']);
    http.verify();
  });

  it('keeps the quotes link usable when quote counts fail to load', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
    http.expectOne('/api/quotes').flush('offline', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(
      [...root.querySelectorAll('tr.mat-mdc-row td.quotes-cell')].map((cell) =>
        cell.textContent?.trim(),
      ),
    ).toEqual(['—', '—']);
    // No error banner: the customers themselves loaded fine.
    expect(root.querySelector('[role="alert"]')).toBeNull();
    const links = [...root.querySelectorAll<HTMLAnchorElement>('a.quotes-button')];
    expect(links.map((link) => link.getAttribute('aria-disabled'))).toEqual([null, null]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/quotes?customerId=c2',
      '/quotes?customerId=c1',
    ]);
    http.verify();
  });
});
