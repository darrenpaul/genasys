// Component tests for the Quotes list page. See customers.spec.ts for the
// TestBed / HttpTestingController basics; only what is new here is commented.
//
// New in this file:
//
//   The router is given a real route so `router.navigateByUrl('/quotes?...')`
//   can set query params BEFORE the component is created. The component then
//   reads them through `ActivatedRoute` exactly as it would in the browser.
//
//   Material dialogs render into an overlay attached to <body>, outside the
//   component's element, so they are queried on `document`, not on
//   `fixture.nativeElement`.
//
//   The `setTimeout(..., 350)` waits let the dialog's close animation finish;
//   `afterClosed()` only emits once it has.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideState, provideStore } from '@ngrx/store';
import { Quotes } from './quotes';
import { quoteEffects, quoteFeature } from './data-access/quote.store';
import { QuoteCustomersApi, QuotesApi } from './data-access/quotes-api';

const customers = [
  {
    id: 'c1',
    firstName: 'Amina',
    lastName: 'Okafor',
    email: 'a@example.test',
    nationality: null,
    addresses: [],
    universities: [],
    createdAt: '2025-01-01',
  },
  {
    id: 'c2',
    firstName: 'Maya',
    lastName: 'Chen',
    email: 'm@example.test',
    nationality: null,
    addresses: [],
    universities: [],
    createdAt: '2025-01-01',
  },
];
const quotes = [
  {
    id: 'q1',
    customerId: 'c1',
    amountInMinorUnits: 1001,
    status: 'approved',
    createdAt: '2025-04-01T12:00:00.000Z',
  },
  {
    id: 'q2',
    customerId: 'c1',
    amountInMinorUnits: 5500,
    status: 'draft',
    createdAt: '2025-04-02T12:00:00.000Z',
  },
  {
    id: 'q3',
    customerId: 'c2',
    amountInMinorUnits: 2500,
    status: 'approved',
    createdAt: '2025-04-03T12:00:00.000Z',
  },
];

describe('Quotes page', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Quotes],
      providers: [
        provideRouter([{ path: 'quotes', component: Quotes }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore(),
        provideState(quoteFeature),
        provideEffects(quoteEffects),
        QuotesApi,
        QuoteCustomersApi,
      ],
    }).compileComponents();
  });

  // Both loads are answered in turn, then the second `navigateByUrl` changes
  // only the query string. The component instance is reused, so the assertion
  // that the table now shows Maya proves the `queryParamMap` subscription
  // reacts to URL changes rather than reading the URL once.
  it('joins customer names and combines shareable customer/status filters', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/quotes?customerId=c1&status=approved');
    const fixture = TestBed.createComponent(Quotes);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/quotes').flush(quotes);
    http.expectOne('/api/customers').flush(customers);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Amina Okafor');
    expect(root.textContent).toContain('€10.01');
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    expect(root.querySelector('a[href="/quotes/new?customerId=c1&status=approved"]')).toBeTruthy();
    expect(
      root.querySelector('a[href="/quotes/q1/edit?customerId=c1&status=approved"]'),
    ).toBeTruthy();
    expect(root.textContent).not.toContain('q2');
    await router.navigateByUrl('/quotes?customerId=c2&status=approved');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    expect(root.textContent).toContain('Maya Chen');
    http.verify();
  });

  // `http.expectNone('/api/quotes/q1')` after Cancel is the real assertion:
  // no DELETE was sent. The 503 on the confirmed attempt checks that the
  // reducer keeps the row when the API fails (no optimistic removal).
  it('requires confirmation before deleting and retains record after API failure', async () => {
    const fixture = TestBed.createComponent(Quotes);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/quotes').flush(quotes);
    http.expectOne('/api/customers').flush(customers);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Delete quote q1"]')!.click();
    fixture.detectChanges();
    http.expectNone('/api/quotes/q1');
    const dialog = document.querySelector('mat-dialog-container')!;
    expect(dialog.textContent).toContain('quote q1 for Amina Okafor');
    [...dialog.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Cancel')!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone('/api/quotes/q1');
    root.querySelector<HTMLButtonElement>('button[aria-label="Delete quote q1"]')!.click();
    fixture.detectChanges();
    const confirm = document.querySelector('mat-dialog-container')!;
    [...confirm.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Delete')!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectOne('/api/quotes/q1').flush('error', { status: 503, statusText: 'Offline' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('button[aria-label="Delete quote q1"]')).toBeTruthy();
    expect(root.textContent).toContain('Request failed');
    http.verify();
  });

  it('shows customer-reference failure even when quote load succeeds afterward', async () => {
    const fixture = TestBed.createComponent(Quotes);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush('offline', { status: 503, statusText: 'Unavailable' });
    http.expectOne('/api/quotes').flush(quotes);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Request failed. Check connection and retry.');
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(0);
    const retry = [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Retry',
    )!;
    retry.click();
    http.expectOne('/api/customers').flush(customers);
    http.verify();
  });

  // Fail-closed check: an unknown `?customerId=` shows zero rows, not all rows.
  it('does not reveal all quotes for an unknown customer', async () => {
    await TestBed.inject(Router).navigateByUrl('/quotes?customerId=missing');
    const fixture = TestBed.createComponent(Quotes);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/quotes').flush(quotes);
    http.expectOne('/api/customers').flush(customers);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Customer filter cannot be resolved');
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(0);
    http.verify();
  });
});
