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
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
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
    expect(root.querySelectorAll('.filters > div')).toHaveLength(3);
    for (const field of root.querySelectorAll('.filters mat-form-field')) {
      expect(getComputedStyle(field).width).toBe('100%');
    }
    expect(
      getComputedStyle(
        root.querySelector('.filters > div:not(.quote-id-filter):not(.status-filter)')!,
      ).flexGrow,
    ).toBe('1');
    for (const filter of root.querySelectorAll(
      '.filters > .quote-id-filter, .filters > .status-filter',
    )) {
      expect(getComputedStyle(filter).flexBasis).toBe('256px');
      expect(getComputedStyle(filter).flexGrow).toBe('0');
    }
    expect(root.textContent).toContain('Amina Okafor');
    expect(root.textContent).toContain('€10.01');
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    expect(
      root
        .querySelector('td.mat-column-status mat-chip-set[aria-label="Quote status"] mat-chip')
        ?.textContent?.trim(),
    ).toBe('Approved');
    expect(root.querySelector('a[href="/quotes/new?customerId=c1&status=approved"]')).toBeTruthy();
    const editLink = root.querySelector<HTMLAnchorElement>(
      'a[href="/quotes/q1/edit?customerId=c1&status=approved"]',
    )!;
    const actions = editLink.closest<HTMLElement>('.row-actions')!;
    expect(getComputedStyle(actions).justifyContent).toBe('flex-end');
    expect(editLink.classList.contains('mat-tonal-button')).toBe(true);
    expect(editLink.getAttribute('aria-label')).toBe('Edit quote q1');
    expect(editLink.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe(
      'edit',
    );
    expect(
      fixture.debugElement.query(By.css('.edit-button')).injector.get(MatTooltip).message,
    ).toBe('Edit quote q1');
    const deleteButton = actions.querySelector<HTMLButtonElement>('.delete-button')!;
    expect(deleteButton.hasAttribute('mat-flat-button')).toBe(true);
    expect(deleteButton.getAttribute('aria-label')).toBe('Delete quote q1');
    expect(deleteButton.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe(
      'delete',
    );
    expect(
      getComputedStyle(deleteButton).getPropertyValue('--mat-button-filled-container-color'),
    ).toBe('#b91c1c');
    expect(
      fixture.debugElement.query(By.css('.delete-button')).injector.get(MatTooltip).message,
    ).toBe('Delete quote q1');
    expect(root.textContent).not.toContain('q2');
    await router.navigateByUrl('/quotes?customerId=c2&status=approved');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    expect(root.textContent).toContain('Maya Chen');
    http.verify();
  });

  it('renders capitalized status chips with distinct accessible colors', async () => {
    const fixture = TestBed.createComponent(Quotes);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/quotes')
      .flush([
        ...quotes,
        { ...quotes[0], id: 'q4', status: 'submitted' },
        { ...quotes[1], id: 'q5', status: 'declined' },
      ]);
    http.expectOne('/api/customers').flush(customers);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    for (const [status, background, labelColor] of [
      ['draft', '#6b7280', '#fff'],
      ['submitted', '#eab308', '#1f2937'],
      ['approved', '#15803d', '#fff'],
      ['declined', '#b91c1c', '#fff'],
    ]) {
      const chip = root.querySelector(`td.mat-column-status mat-chip.status-${status}`)!;
      expect(chip.textContent?.trim()).toBe(status[0].toUpperCase() + status.slice(1));
      const style = getComputedStyle(chip);
      expect(style.getPropertyValue('--status-color')).toBe(background);
      expect(style.getPropertyValue('--mat-chip-elevated-container-color')).toBe(
        'var(--status-color)',
      );
      expect(style.getPropertyValue('--mat-chip-outline-width')).toBe('0px');
      expect(style.width).toBe('100px');
      expect(style.borderWidth).toBe('1px');
      expect(style.getPropertyValue('--mat-chip-label-text-color')).toBe(labelColor);
    }
    http.verify();
  });

  it('searches quote IDs case-insensitively alongside customer and status filters', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/quotes?customerId=c1');
    const fixture = TestBed.createComponent(Quotes);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/quotes').flush(quotes);
    http.expectOne('/api/customers').flush(customers);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('#quote-id-search')!;
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(2);
    expect(root.querySelector('.filter-results[role="status"]')?.textContent?.trim()).toBe(
      '2 quotes found.',
    );
    input.value = 'Q2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    expect(root.querySelector('tr.mat-mdc-row')?.textContent).toContain('q2');
    expect(root.querySelector('.filter-results[role="status"]')?.textContent?.trim()).toBe(
      '1 quote found.',
    );
    expect(router.url).toBe('/quotes?customerId=c1');

    await router.navigateByUrl('/quotes?customerId=c1&status=approved');
    await fixture.whenStable();
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(0);
    expect(root.querySelector('.filter-results[role="status"]')?.textContent?.trim()).toBe(
      'No quotes match the current filters.',
    );
    expect(root.querySelector('mat-paginator')).toBeNull();
    await router.navigateByUrl('/quotes?customerId=c1');
    await fixture.whenStable();
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);

    const clear = root.querySelector<HTMLButtonElement>(
      '.filters button[aria-label="Clear quote ID search"]',
    )!;
    expect(clear.querySelector('mat-icon[aria-hidden="true"]')?.textContent).toBe('close');
    clear.click();
    await fixture.whenStable();
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(root.querySelector('.filters button[aria-label="Clear quote ID search"]')).toBeNull();
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(2);
    http.verify();
  });

  it('searches customers by name and filters quotes only after a selection', async () => {
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
    const input = root.querySelector<HTMLInputElement>('#quote-customer-search')!;
    expect(input.value).toBe('Amina Okafor');
    input.focus();
    input.value = 'cHeN';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const options = [...document.querySelectorAll('mat-option')];
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Maya Chen']);
    expect(router.url).toBe('/quotes?customerId=c1&status=approved');
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    (options[0] as HTMLElement).click();
    await fixture.whenStable();
    expect(router.url).toBe('/quotes?customerId=c2&status=approved');
    expect(input.value).toBe('Maya Chen');
    expect(root.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    await router.navigateByUrl('/quotes?customerId=c1&status=approved');
    await fixture.whenStable();
    expect(input.value).toBe('Amina Okafor');
    http.verify();
  });

  it('clears each filter inside its field without clearing the other', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/quotes?customerId=c1&status=approved');
    const fixture = TestBed.createComponent(Quotes);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/quotes').flush(quotes);
    http.expectOne('/api/customers').flush(customers);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const customerInput = root.querySelector<HTMLInputElement>('#quote-customer-search')!;
    const statusSelect = root.querySelector('mat-select')!;
    expect(customerInput.value).toBe('Amina Okafor');
    const customerClear = root.querySelector<HTMLButtonElement>(
      '.filters button[aria-label="Clear customer filter"]',
    )!;
    expect(customerClear.querySelector('mat-icon[aria-hidden="true"]')?.textContent).toBe('close');
    customerClear.click();
    await fixture.whenStable();
    expect(router.url).toBe('/quotes?status=approved');
    expect(document.activeElement).toBe(customerInput);
    expect(customerInput.value).toBe('');
    expect(root.querySelector('.filters button[aria-label="Clear customer filter"]')).toBeNull();

    root
      .querySelector<HTMLButtonElement>('.filters button[aria-label="Clear status filter"]')!
      .click();
    await fixture.whenStable();
    expect(router.url).toBe('/quotes');
    expect(document.activeElement).toBe(statusSelect);
    expect(root.querySelector('.filters button[aria-label="Clear status filter"]')).toBeNull();
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
