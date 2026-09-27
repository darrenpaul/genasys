// Component tests for the add/edit quote form. See customers.spec.ts for the
// TestBed / HttpTestingController basics.
//
// Driving the form from a test:
//
//   `input.value = '10.01'; input.dispatchEvent(new Event('input'))` is how
//   you type. `[formField]` listens for the native `input` event, so setting
//   `.value` alone would not reach the model. (Vue Test Utils' `setValue()`
//   does both steps for you.)
//
//   `new Event('submit', { cancelable: true })` submits the form. `cancelable`
//   matters: without it `preventDefault()` is a no-op and jsdom would attempt
//   a real form navigation.
//
// Two ways to create the component are used, on purpose:
//
//   `TestBed.createComponent(QuoteForm)` after `router.navigateByUrl(...)`,
//   which is enough when only query params matter.
//
//   `RouterTestingHarness`, which creates the component THROUGH the router.
//   That is required for path params (`:quoteId`), and it is the only way to
//   test that the same instance is reused when the param changes.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { provideState, provideStore } from '@ngrx/store';
import { QuoteForm } from './quote-form';
import { quoteEffects, quoteFeature } from '../data-access/quote.store';
import { QuoteCustomersApi, QuotesApi } from '../data-access/quotes-api';

const customer = {
  id: 'c1',
  firstName: 'Amina',
  lastName: 'Okafor',
  email: 'a@example.test',
  nationality: null,
  addresses: [],
  universities: [],
  createdAt: '2025-01-01',
};

describe('Quote form', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuoteForm],
      providers: [
        provideRouter([
          { path: 'quotes/new', component: QuoteForm },
          { path: 'quotes/:quoteId/edit', component: QuoteForm },
        ]),
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

  it('places Cancel before Save in toolbar and submits through external button', async () => {
    await TestBed.inject(Router).navigateByUrl('/quotes/new?customerId=c1&status=approved');
    const fixture = TestBed.createComponent(QuoteForm);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const toolbar = root.querySelector('app-page-toolbar')!;
    expect(toolbar.querySelector('button[type="submit"]')).toBeNull();
    http.expectOne('/api/customers').flush([customer]);
    await fixture.whenStable();
    fixture.detectChanges();

    const cancel = toolbar.querySelector<HTMLAnchorElement>(
      'a[href="/quotes?customerId=c1&status=approved"]',
    )!;
    const save = toolbar.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect([...toolbar.querySelector('.toolbar-actions')!.children]).toEqual([cancel, save]);
    expect(save.form).toBe(root.querySelector('form#quote-form'));
    expect(getComputedStyle(save.form!).maxWidth).toBe('832px');
    expect(root.querySelector('form button[type="submit"]')).toBeNull();
    expect(save.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe('save');
    expect(save.querySelector('.mdc-button__label')?.textContent?.trim()).toBe('Save');
    expect(getComputedStyle(save).getPropertyValue('--mat-button-filled-container-color')).toBe(
      '#007f7e',
    );
    expect(getComputedStyle(cancel).getPropertyValue('--mat-button-text-label-text-color')).toBe(
      '#fff',
    );
    save.click();
    await fixture.whenStable();
    expect(root.textContent).toContain('Enter an amount above zero');
    const amount = root.querySelector('#quote-amount')!;
    expect(amount.getAttribute('aria-invalid')).toBe('true');
    expect(amount.getAttribute('aria-describedby')).toBe('quote-amount-error');
    const amountError = root.querySelector('.field-heading #quote-amount-error')!;
    expect(amountError.textContent).toContain('Enter an amount above zero');
    expect(amountError.classList.contains('field-feedback')).toBe(true);
    http.expectNone('/api/quotes');
    http.verify();
  });

  it('creates quote with preselected customer and exact euro cents', async () => {
    await TestBed.inject(Router).navigateByUrl('/quotes/new?customerId=c1');
    const fixture = TestBed.createComponent(QuoteForm);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush([customer]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const customerInput = root.querySelector<HTMLInputElement>('#quote-customer')!;
    expect(customerInput.value).toBe('Amina Okafor');
    expect(customerInput.labels?.[0]?.textContent).toBe('Customer');
    const input = root.querySelector<HTMLInputElement>('#quote-amount')!;
    expect(input.labels?.[0]?.textContent).toBe('Amount (EUR)');
    expect(input.placeholder).toBe('e.g. 100.00');
    input.value = '10.01';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // Submitted twice on purpose. The component's `saving` guard and the save
    // effect's `exhaustMap` should both refuse the duplicate; `expectOne`
    // below fails if more than one POST was made.
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    const request = http.expectOne('/api/quotes');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      customerId: 'c1',
      amountInMinorUnits: 1001,
      status: 'draft',
    });
    request.flush({ ...request.request.body, id: 'q1' });
    http.verify();
  });

  // The URL changes from c1 to c2 while the customers request is still
  // pending. The saved quote must use c2: the query-param subscription updates
  // the model on every emission, not just the first.
  it('tracks latest customer query parameter before references load', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/quotes/new?customerId=c1');
    const fixture = TestBed.createComponent(QuoteForm);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await router.navigateByUrl('/quotes/new?customerId=c2');
    http
      .expectOne('/api/customers')
      .flush([customer, { ...customer, id: 'c2', firstName: 'Maya' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector<HTMLInputElement>('#quote-customer')?.value).toBe('Maya Okafor');
    const input = root.querySelector<HTMLInputElement>('#quote-amount')!;
    input.value = '10';
    input.dispatchEvent(new Event('input'));
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    const request = http.expectOne('/api/quotes');
    expect(request.request.body.customerId).toBe('c2');
    request.flush({ ...request.request.body, id: 'q2' });
    http.verify();
  });

  // The searchable selects open their options in the CDK overlay, so
  // `mat-option` is looked up on `document`. Typing filters the list; only the
  // open panel's options exist in the DOM at any time.
  it('lets user search for customer and status when creating from unfiltered list', async () => {
    await TestBed.inject(Router).navigateByUrl('/quotes/new');
    const fixture = TestBed.createComponent(QuoteForm);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/customers')
      .flush([
        { ...customer, id: 'c3', firstName: 'Zara' },
        { ...customer, id: 'c2', firstName: 'Maya' },
        customer,
      ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const customerInput = root.querySelector<HTMLInputElement>('#quote-customer')!;
    // Options are listed by name regardless of the order the API returned them.
    customerInput.focus();
    fixture.detectChanges();
    expect(
      [...document.querySelectorAll<HTMLElement>('mat-option')].map((o) => o.textContent?.trim()),
    ).toEqual(['Amina Okafor', 'Maya Okafor', 'Zara Okafor']);
    customerInput.value = 'ami';
    customerInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const customerOptions = [...document.querySelectorAll<HTMLElement>('mat-option')];
    expect(customerOptions.map((option) => option.textContent?.trim())).toEqual(['Amina Okafor']);
    customerOptions[0].click();
    fixture.detectChanges();
    expect(customerInput.value).toBe('Amina Okafor');
    const input = root.querySelector<HTMLInputElement>('#quote-amount')!;
    input.value = '20';
    input.dispatchEvent(new Event('input'));
    const statusInput = root.querySelector<HTMLInputElement>('#quote-status')!;
    statusInput.focus();
    statusInput.value = 'appr';
    statusInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    [...document.querySelectorAll<HTMLElement>('mat-option')]
      .find((option) => option.textContent?.trim() === 'approved')!
      .click();
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    const request = http.expectOne('/api/quotes');
    expect(request.request.body).toMatchObject({
      customerId: 'c1',
      amountInMinorUnits: 2000,
      status: 'approved',
    });
    request.flush({ ...request.request.body, id: 'q2' });
    http.verify();
  });

  it('loads existing quote, preserves createdAt, and updates it', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/quotes/q1/edit', QuoteForm);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush([customer]);
    http.expectOne('/api/quotes/q1').flush({
      id: 'q1',
      customerId: 'c1',
      amountInMinorUnits: 1001,
      status: 'draft',
      createdAt: '2025-04-01T12:00:00.000Z',
    });
    harness.detectChanges();
    const root = harness.routeNativeElement as HTMLElement;
    expect(root.querySelector<HTMLInputElement>('#quote-amount')?.value).toBe('10.01');
    const input = root.querySelector<HTMLInputElement>('#quote-amount')!;
    input.value = '12.50';
    input.dispatchEvent(new Event('input'));
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const request = http.expectOne('/api/quotes/q1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({
      id: 'q1',
      customerId: 'c1',
      amountInMinorUnits: 1250,
      createdAt: '2025-04-01T12:00:00.000Z',
    });
    request.flush(request.request.body);
    http.verify();
  });

  // Navigating q1/edit -> q2/edit reuses the component instance (same route,
  // different param). The amount box must show q2's value, proving the
  // `paramMap` chain in the constructor reset and reloaded the form.
  it('resets edit form when quote ID changes on reused route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/quotes/q1/edit', QuoteForm);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush([customer]);
    http.expectOne('/api/quotes/q1').flush({
      id: 'q1',
      customerId: 'c1',
      amountInMinorUnits: 1001,
      status: 'draft',
      createdAt: '2025-04-01T12:00:00.000Z',
    });
    harness.detectChanges();
    expect(
      (harness.routeNativeElement as HTMLElement).querySelector<HTMLInputElement>('#quote-amount')
        ?.value,
    ).toBe('10.01');
    await harness.navigateByUrl('/quotes/q2/edit', QuoteForm);
    http.expectOne('/api/quotes/q2').flush({
      id: 'q2',
      customerId: 'c1',
      amountInMinorUnits: 3000,
      status: 'approved',
      createdAt: '2025-04-02T12:00:00.000Z',
    });
    harness.detectChanges();
    expect(
      (harness.routeNativeElement as HTMLElement).querySelector<HTMLInputElement>('#quote-amount')
        ?.value,
    ).toBe('30.00');
    http.verify();
  });

  it('clears invalid customer error when selecting an option without typing', async () => {
    await TestBed.inject(Router).navigateByUrl('/quotes/new?customerId=missing');
    const fixture = TestBed.createComponent(QuoteForm);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush([customer]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    const customerInput = root.querySelector<HTMLInputElement>('#quote-customer')!;
    expect(root.querySelector('#quote-customer-error')?.textContent).toContain(
      'Select an existing customer.',
    );
    customerInput.focus();
    fixture.detectChanges();
    [...document.querySelectorAll<HTMLElement>('mat-option')]
      .find((option) => option.textContent?.includes('Amina Okafor'))!
      .click();
    fixture.detectChanges();
    expect(customerInput.value).toBe('Amina Okafor');
    expect(root.querySelector('#quote-customer-error')).toBeNull();
    http.expectNone('/api/quotes');
  });

  it('clears amount error as soon as amount is corrected', async () => {
    await TestBed.inject(Router).navigateByUrl('/quotes/new?customerId=c1');
    const fixture = TestBed.createComponent(QuoteForm);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush([customer]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const amount = root.querySelector<HTMLInputElement>('#quote-amount')!;
    amount.value = '10.001';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(amount.getAttribute('aria-invalid')).toBe('true');

    amount.value = '10.01';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('#quote-amount-error')).toBeNull();
    expect(amount.getAttribute('aria-invalid')).not.toBe('true');
    http.expectNone('/api/quotes');
  });

  it('rejects extra decimal precision before making API request', async () => {
    await TestBed.inject(Router).navigateByUrl('/quotes/new?customerId=c1');
    const fixture = TestBed.createComponent(QuoteForm);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/customers').flush([customer]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('#quote-amount')!;
    input.value = '10.001';
    input.dispatchEvent(new Event('input'));
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('at most two decimals');
    http.expectNone('/api/quotes');
    http.verify();
  });
});
