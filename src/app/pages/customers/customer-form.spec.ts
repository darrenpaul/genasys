// Unit tests for the create/edit customer form.
//
// See customers.spec.ts for how TestBed and HttpTestingController compare to
// Vue Test Utils. Two extra things here:
//   - `vi.fn()` is Vitest's mock function (this project runs Angular's test
//     runner on Vitest), used to spy on `scrollIntoView`.
//   - Inputs are found by their <mat-label> text, not by id or test attribute,
//     which keeps the tests close to what a user actually sees.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { provideState, provideStore, Store } from '@ngrx/store';
import { CustomerForm } from './customer-form';
import { customerActions, customerEffects, customerFeature } from './data-access/customer.store';
import { CustomersApi, CustomerQuotesApi } from './data-access/customers-api';

// Find the <input> that belongs to the <mat-label> containing `label`.
function input(root: HTMLElement, label: string): HTMLInputElement {
  const labels = [...root.querySelectorAll('mat-label')];
  const text = labels.find((node) => node.textContent?.includes(label));
  const field = text?.closest('mat-form-field');
  const result = field?.querySelector('input');
  if (!result) throw new Error(`Missing ${label} field`);
  return result;
}

// Simulate typing: set the value and fire the `input` event the `[formField]`
// directive listens to. `bubbles: true` matters because Angular may attach
// the listener above the input.
function type(root: HTMLElement, label: string, value: string): void {
  const field = input(root, label);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Customer form', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerForm],
      providers: [
        provideRouter([
          { path: 'customers/new', component: CustomerForm },
          { path: 'customers/:customerId/edit', component: CustomerForm },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore(),
        provideState(customerFeature),
        provideEffects(customerEffects),
        CustomersApi,
        CustomerQuotesApi,
      ],
    }).compileComponents();
    // The form reads its mode from the route, so navigate before each test.
    await TestBed.inject(Router).navigateByUrl('/customers/new');
  });

  it('scrolls and focuses the first invalid field after failed submit', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const firstName = input(root, 'First name');
    const firstScroll = vi.fn();
    firstName.scrollIntoView = firstScroll;

    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(firstName.outerHTML).toContain('aria-invalid="true"');
    expect(firstScroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    expect(document.activeElement).toBe(firstName);

    type(root, 'First name', 'Amina');
    type(root, 'Last name', 'Okafor');
    type(root, 'Email', 'amina@example.test');
    const street = input(root, 'Street');
    const streetScroll = vi.fn();
    street.scrollIntoView = streetScroll;
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(streetScroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    expect(document.activeElement).toBe(street);
    expect(firstScroll).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(streetScroll).toHaveBeenCalledTimes(2);
    TestBed.inject(HttpTestingController).expectNone('/api/customers');
  });

  it('scrolls to first invalid field in a second address', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    type(root, 'First name', 'Amina');
    type(root, 'Last name', 'Okafor');
    type(root, 'Email', 'amina@example.test');
    type(root, 'Street', 'Maple Lane');
    type(root, 'City', 'Lagos');
    type(root, 'Postal code', '100001');
    [...root.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Add address'))!
      .click();
    fixture.detectChanges();
    const second = [...root.querySelectorAll('fieldset')].find((field) =>
      field.querySelector('legend')?.textContent?.includes('Address 2'),
    )!;
    const street = input(second, 'Street');
    const city = input(second, 'City');
    const streetScroll = vi.fn();
    const cityScroll = vi.fn();
    street.scrollIntoView = streetScroll;
    city.scrollIntoView = cityScroll;

    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(streetScroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    expect(document.activeElement).toBe(street);
    expect(cityScroll).not.toHaveBeenCalled();

    type(second, 'Street', 'River Road');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(cityScroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    expect(document.activeElement).toBe(city);
    TestBed.inject(HttpTestingController).expectNone('/api/customers');
  });

  it('does not submit invalid customer; sends one university on valid create', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    for (const field of root.querySelectorAll('input')) field.scrollIntoView = vi.fn();
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    http.expectNone('/api/customers');
    expect(root.textContent).toContain('First name is required.');

    type(root, 'First name', '   ');
    type(root, 'Last name', 'Okafor');
    type(root, 'Email', 'amina@example.test');
    type(root, 'Street', 'Maple Lane');
    type(root, 'City', 'Lagos');
    type(root, 'Postal code', '100001');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    http.expectNone('/api/customers');
    type(root, 'First name', 'Amina');
    type(root, 'University name', '   ');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    http.expectNone('/api/customers');
    expect(root.textContent).toContain('University name cannot be blank.');
    type(root, 'University name', ' University of Lagos ');
    expect(root.textContent).not.toContain('Add university');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    const request = http.expectOne('/api/customers');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.universities).toEqual([
      { id: expect.any(String), name: 'University of Lagos' },
    ]);
    expect(request.request.body.addresses).toEqual([
      {
        id: expect.any(String),
        street: 'Maple Lane',
        city: 'Lagos',
        suburb: '',
        postalCode: '100001',
      },
    ]);
    expect(root.textContent).not.toContain('Country code');
    expect(request.request.body.createdAt).toMatch(/^\d{4}-/);
    request.flush({ ...request.request.body, id: 'new-id' });
    http.verify();
  });

  it('saves no university when optional field is empty', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    type(root, 'First name', 'Amina');
    type(root, 'Last name', 'Okafor');
    type(root, 'Email', 'amina@example.test');
    type(root, 'Street', 'Maple Lane');
    type(root, 'City', 'Lagos');
    type(root, 'Postal code', '100001');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne('/api/customers');
    expect(request.request.body.universities).toEqual([]);
    request.flush({ ...request.request.body, id: 'new-id' });
    http.verify();
  });

  it('drops legacy country and extra universities when editing', async () => {
    const store = TestBed.inject(Store);
    const legacyCustomer = {
      id: 'c1',
      createdAt: '2025-01-01',
      firstName: 'Amina',
      lastName: 'Okafor',
      email: 'amina@example.test',
      nationality: null,
      addresses: [
        {
          id: 'a1',
          street: 'Maple Lane',
          city: 'Lagos',
          suburb: '',
          postalCode: '100001',
          countryCode: 'NG',
        },
      ],
      universities: [
        { id: 'u1', name: 'University of Lagos' },
        { id: 'u2', name: 'University of Ibadan' },
      ],
    };
    store.dispatch(customerActions.getSucceeded({ customer: legacyCustomer }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/customers/c1/edit', CustomerForm);
    const root = harness.routeNativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Country code');
    expect(input(root, 'University name').value).toBe('University of Lagos');
    expect(root.textContent).not.toContain('Add university');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await harness.fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne('/api/customers/c1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.addresses).toEqual([
      { id: 'a1', street: 'Maple Lane', city: 'Lagos', suburb: '', postalCode: '100001' },
    ]);
    expect(request.request.body.universities).toEqual([{ id: 'u1', name: 'University of Lagos' }]);
    request.flush(request.request.body);
    http.verify();
  });
});
