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
    nationality: 'Nigerian',
    createdAt: '2025-01-01',
    addresses: [
      {
        id: 'a1',
        street: 'Maple Lane',
        city: 'Lagos',
        suburb: 'Yaba',
        postalCode: '100001',
        countryCode: 'NG',
      },
    ],
    universities: [{ id: 'u1', name: 'University of Lagos' }],
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
        countryCode: 'AU',
      },
    ],
    universities: [],
  },
];

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
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const names = () =>
      [...root.querySelectorAll('tr.mat-mdc-row td:first-child')].map((cell) =>
        cell.textContent?.trim(),
      );
    expect(names()).toEqual(['Maya Chen', 'Amina Okafor']);
    const input = root.querySelector<HTMLInputElement>('input[matinput]')!;
    input.value = 'lagos';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(names()).toEqual(['Amina Okafor']);
    input.value = 'c1';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(names()).toEqual([]);
    http.verify();
  });

  it('confirms deletion, rechecks quotes, and removes customer after API success', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
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

  it('offers Retry after a failed refresh with previously loaded rows', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
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
    http.verify();
  });

  it('blocks deletion when customer has related quotes', async () => {
    const fixture = TestBed.createComponent(Customers);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/customers').flush(rows);
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
    http.expectNone('/api/customers/c1');
    http.verify();
  });
});
