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

// Confirm a country through the UI the way a user would: type into the
// search box, then click the matching option. Two Angular-specific details:
//   - The live country refresh is answered with a 503 first, so the test
//     runs against the bundled snapshot and never depends on the network.
//   - Material renders autocomplete options in an overlay attached to
//     <body>, outside the component's element. That is why the option is
//     looked up on `document` rather than `root`.
// `fixture.detectChanges()` is the equivalent of `await nextTick()`: it
// flushes pending updates into the DOM so the next query sees them.
function chooseCountry(
  root: HTMLElement,
  fixture: { detectChanges(): void },
  http: HttpTestingController,
  name = 'Nigeria',
): void {
  http
    .match((request) => request.url === 'https://countries.dev/countries')
    .forEach((request) => request.flush('Unavailable', { status: 503, statusText: 'Unavailable' }));
  const field = input(root, 'Search all countries');
  field.focus();
  type(root, 'Search all countries', name);
  fixture.detectChanges();
  const option = [...document.querySelectorAll('mat-option')].find((node) =>
    node.textContent?.includes(name),
  ) as HTMLElement | undefined;
  expect(option).toBeDefined();
  option!.click();
  fixture.detectChanges();
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

  it('focuses required nationality before later address errors', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Choose a country first to search universities.');
    expect(input(root, 'University name').disabled).toBe(true);
    type(root, 'First name', 'Amina');
    type(root, 'Last name', 'Okafor');
    type(root, 'Email', 'amina@example.test');
    const country = input(root, 'Search all countries');
    country.scrollIntoView = vi.fn();
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(country);
    expect(country.scrollIntoView).toHaveBeenCalled();
    TestBed.inject(HttpTestingController).expectNone('/api/customers');
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
    chooseCountry(root, fixture, TestBed.inject(HttpTestingController));
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
    chooseCountry(root, fixture, TestBed.inject(HttpTestingController));
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
    chooseCountry(root, fixture, http);
    expect(root.textContent).not.toContain('Add university');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    const request = http.expectOne('/api/customers');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.universities).toEqual([]);
    expect(request.request.body.nationality).toEqual({ code: 'NG', name: 'Nigeria' });
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
    http.expectNone('/api/customers');
    expect(root.textContent).toContain('Choose a country.');
    // Nationality must be explicitly confirmed, not inferred from surname.
    chooseCountry(root, fixture, http);
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    const request = http.expectOne('/api/customers');
    expect(request.request.body.universities).toEqual([]);
    request.flush({ ...request.request.body, id: 'new-id' });
    http.verify();
  });

  it('offers surname predictions inside searchable country dropdown and confirms selected option', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    http
      .match((r) => r.url === 'https://countries.dev/countries')
      .forEach((r) => r.flush('Unavailable', { status: 503, statusText: 'Unavailable' }));
    type(root, 'Last name', 'Smith');
    fixture.detectChanges();
    expect(
      input(root, 'Search all countries').closest('mat-form-field')?.querySelector('mat-hint')
        ?.textContent,
    ).toContain('Waiting for surname…');
    await new Promise((resolve) => setTimeout(resolve, 700));
    http
      .expectOne((r) => r.url === 'https://api.nationalize.io' && r.params.get('name') === 'Smith')
      .flush({
        country: [
          { country_id: 'NG', probability: 0.74 },
          { country_id: 'AU', probability: 0.22 },
        ],
      });
    fixture.detectChanges();
    expect(root.querySelector('input[type="radio"]')).toBeNull();
    expect(root.textContent).not.toContain('Country and university');
    expect(root.textContent).not.toContain('Enter at least two surname characters');
    expect(root.textContent).not.toContain('Nationality — choose a country');
    const countryInput = input(root, 'Search all countries');
    countryInput.focus();
    type(root, 'Search all countries', '');
    fixture.detectChanges();
    const options = [...document.querySelectorAll('mat-option')];
    const groups = [...document.querySelectorAll('.mat-mdc-optgroup-label')].map((group) =>
      group.textContent?.trim(),
    );
    expect(groups).toContain('Suggested countries');
    expect(groups).not.toContain('Suggested countries based on surname');
    expect(options.filter((option) => option.textContent?.includes('Nigeria'))).toHaveLength(1);
    const prediction = options.find((option) => option.textContent?.includes('Nigeria')) as
      HTMLElement | undefined;
    expect(prediction?.textContent?.trim()).toBe('🇳🇬 Nigeria');
    expect(options.some((option) => option.textContent?.includes('Afghanistan'))).toBe(true);
    prediction!.click();
    fixture.detectChanges();
    expect(root.textContent).toContain('Confirmed: Nigeria');
    countryInput.blur();
    countryInput.focus();
    fixture.detectChanges();
    expect(
      [...document.querySelectorAll('mat-option')].some(
        (option) => option.textContent?.trim() === '🇦🇺 Australia',
      ),
    ).toBe(true);
  });

  it('shows prediction errors and retry inside country input hint', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    http
      .match((r) => r.url === 'https://countries.dev/countries')
      .forEach((r) => r.flush('Unavailable', { status: 503, statusText: 'Unavailable' }));
    type(root, 'Last name', 'Smith');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 700));
    http
      .expectOne((r) => r.url === 'https://api.nationalize.io')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    const hint = input(root, 'Search all countries')
      .closest('mat-form-field')
      ?.querySelector('mat-hint');
    expect(hint?.querySelector('[role="alert"]')?.textContent).toContain(
      'Suggestions unavailable.',
    );
    expect(
      input(root, 'Search all countries').getAttribute('aria-describedby')?.split(' '),
    ).toContain(hint?.id);
    const retry = [...(hint?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Retry suggestions'),
    );
    expect(retry).toBeDefined();
    retry!.focus();
    retry!.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(input(root, 'Search all countries'));
    await new Promise((resolve) => setTimeout(resolve, 700));
    http
      .expectOne((r) => r.url === 'https://api.nationalize.io' && r.params.get('name') === 'Smith')
      .flush({ country: [] });
    fixture.detectChanges();
    expect(hint?.textContent).toContain('No suggestions found.');
  });

  it('cancels old surname prediction before new debounce completes', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    http
      .match((r) => r.url === 'https://countries.dev/countries')
      .forEach((r) => r.flush('Unavailable', { status: 503, statusText: 'Unavailable' }));
    type(root, 'Last name', 'Smith');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const old = http.expectOne(
      (r) => r.url === 'https://api.nationalize.io' && r.params.get('name') === 'Smith',
    );
    type(root, 'Last name', 'Jones');
    expect(old.cancelled).toBe(true);
    fixture.detectChanges();
    expect(root.textContent).not.toContain('Nigeria (');
    type(root, 'Last name', '');
    fixture.detectChanges();
    http.expectNone((r) => r.url === 'https://api.nationalize.io');
  });

  it('suggests universities for selected country with provider-specific name', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    chooseCountry(root, fixture, http, 'United States of America');
    input(root, 'University name').focus();
    type(root, 'University name', 'Stanford');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 480));
    const search = http.expectOne((r) => r.url === '/external/universities');
    expect(search.request.params.get('country')).toBe('United States');
    expect(search.request.params.get('name')).toBe('Stanford');
    search.flush([
      { name: 'Stanford University', alpha_two_code: 'US', web_pages: ['https://stanford.edu/'] },
    ]);
    fixture.detectChanges();
    expect(
      [...document.querySelectorAll('mat-option')].some((option) =>
        option.textContent?.includes('Stanford University'),
      ),
    ).toBe(true);
  });

  it('clears selected university from the input suffix without losing keyboard focus', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    chooseCountry(root, fixture, http);
    const universityInput = input(root, 'University name');
    universityInput.focus();
    type(root, 'University name', 'Lagos');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 480));
    http
      .expectOne((r) => r.url === '/external/universities')
      .flush([
        {
          name: 'University of Lagos',
          alpha_two_code: 'NG',
          web_pages: ['https://unilag.edu.ng/'],
        },
      ]);
    fixture.detectChanges();
    const option = [...document.querySelectorAll('mat-option')].find((node) =>
      node.textContent?.includes('University of Lagos'),
    ) as HTMLElement;
    option.click();
    fixture.detectChanges();
    const clearButton = universityInput
      .closest('mat-form-field')
      ?.querySelector<HTMLButtonElement>('button[aria-label="Clear university"]');
    expect(clearButton).not.toBeNull();
    clearButton!.focus();
    clearButton!.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(universityInput);
    expect(universityInput.value).toBe('');
    expect(
      universityInput
        .closest('mat-form-field')
        ?.querySelector('button[aria-label="Clear university"]'),
    ).toBeNull();
  });

  it('stores selected university website and clears it on country change', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    chooseCountry(root, fixture, http);
    input(root, 'University name').focus();
    type(root, 'University name', 'Lagos');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 480));
    const search = http.expectOne((r) => r.url === '/external/universities');
    expect(search.request.params.get('country')).toBe('Nigeria');
    search.flush([
      { name: 'University of Lagos', alpha_two_code: 'NG', web_pages: ['https://unilag.edu.ng/'] },
    ]);
    fixture.detectChanges();
    const option = [...document.querySelectorAll('mat-option')].find((node) =>
      node.textContent?.includes('University of Lagos'),
    ) as HTMLElement;
    expect(option).toBeDefined();
    option.click();
    fixture.detectChanges();
    expect(input(root, 'University name').value).toBe('University of Lagos');
    const clearButton = input(root, 'University name')
      .closest('mat-form-field')
      ?.querySelector<HTMLButtonElement>('button[aria-label="Clear university"]');
    expect(clearButton?.type).toBe('button');
    expect(root.textContent).not.toContain('Selected:');
    expect(root.textContent).not.toContain('https://unilag.edu.ng/');
    type(root, 'First name', 'Amina');
    type(root, 'Last name', 'Okafor');
    type(root, 'Email', 'amina@example.test');
    type(root, 'Street', 'Maple Lane');
    type(root, 'City', 'Lagos');
    type(root, 'Postal code', '100001');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    const save = http.expectOne('/api/customers');
    expect(save.request.body.universities).toEqual([
      { id: expect.any(String), name: 'University of Lagos', website: 'https://unilag.edu.ng/' },
    ]);
    input(root, 'Search all countries').focus();
    type(root, 'Search all countries', 'Australia');
    fixture.detectChanges();
    const australia = [...document.querySelectorAll('mat-option')].find((node) =>
      node.textContent?.includes('Australia'),
    ) as HTMLElement;
    australia.click();
    fixture.detectChanges();
    expect(input(root, 'University name').value).toBe('');
    expect(
      input(root, 'University name')
        .closest('mat-form-field')
        ?.querySelector('button[aria-label="Clear university"]'),
    ).toBeNull();
    save.flush({ ...save.request.body, id: 'new-id' });
  });

  it('cancels university lookups immediately and retries unchanged query after failure', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    chooseCountry(root, fixture, http);
    input(root, 'University name').focus();
    type(root, 'University name', 'Lagos');
    fixture.detectChanges();
    expect(
      input(root, 'University name').closest('mat-form-field')?.querySelector('mat-hint')
        ?.textContent,
    ).toContain('Waiting for search…');
    await new Promise((resolve) => setTimeout(resolve, 480));
    const stale = http.expectOne(
      (r) => r.url === '/external/universities' && r.params.get('name') === 'Lagos',
    );
    type(root, 'University name', 'Ibadan');
    expect(stale.cancelled).toBe(true);
    fixture.detectChanges();
    type(root, 'University name', '');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 480));
    http.expectNone((r) => r.url === '/external/universities');
    type(root, 'University name', 'Ibadan');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 480));
    http
      .expectOne((r) => r.url === '/external/universities')
      .flush('unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    const retry = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Retry university search'),
    )!;
    expect(
      input(root, 'University name')
        .closest('mat-form-field')
        ?.querySelector('mat-hint')
        ?.contains(retry),
    ).toBe(true);
    retry.focus();
    retry.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(input(root, 'University name'));
    await new Promise((resolve) => setTimeout(resolve, 480));
    http
      .expectOne((r) => r.url === '/external/universities' && r.params.get('name') === 'Ibadan')
      .flush([]);
    fixture.detectChanges();
    expect(root.textContent).toContain('No universities found.');
  });

  it('preserves confirmed country and university when editing', async () => {
    const store = TestBed.inject(Store);
    const legacyCustomer = {
      id: 'c1',
      createdAt: '2025-01-01',
      firstName: 'Amina',
      lastName: 'Okafor',
      email: 'amina@example.test',
      nationality: { code: 'NG', name: 'Nigeria' },
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
        { id: 'u1', name: 'University of Lagos', website: 'https://unilag.edu.ng/' },
        { id: 'u2', name: 'University of Ibadan', website: null },
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
    expect(request.request.body.universities).toEqual([
      { id: 'u1', name: 'University of Lagos', website: 'https://unilag.edu.ng/' },
    ]);
    request.flush(request.request.body);
    http
      .match((r) => r.url === 'https://countries.dev/countries')
      .forEach((r) => r.flush('Unavailable', { status: 503, statusText: 'Unavailable' }));
    http.verify();
  });
});
