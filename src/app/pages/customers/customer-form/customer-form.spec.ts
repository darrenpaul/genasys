// Unit tests for the create/edit customer form.
//
// See customers.spec.ts for how TestBed and HttpTestingController compare to
// Vue Test Utils. Two extra things here:
//   - `vi.fn()` is Vitest's mock function (this project runs Angular's test
//     runner on Vitest), used to spy on `scrollIntoView`.
//   - Inputs are found by visible label text and its for/id association,
//     which keeps the tests close to what a user actually sees.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { provideState, provideStore, Store } from '@ngrx/store';
import { CustomerForm } from './customer-form';
import { customerActions, customerEffects, customerFeature } from '../data-access/customer.store';
import { CustomersApi, CustomerQuotesApi } from '../data-access/customers-api';
import { fallbackCountries } from '../data-access/enrichment-api';

// Find the <input> associated with the visible label containing `label`.
function input(root: HTMLElement, label: string): HTMLInputElement {
  const labels = [...root.querySelectorAll<HTMLLabelElement>('label.field-label')];
  const text = labels.find((node) => node.textContent?.includes(label));
  const result = text && root.querySelector<HTMLInputElement>(`input[id="${text.htmlFor}"]`);
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
  const field = input(root, 'Nationality');
  field.focus();
  type(root, 'Nationality', name);
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

  it('places Cancel before Save in the toolbar while Save submits the form', () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const toolbar = root.querySelector('app-page-toolbar')!;
    const save = toolbar.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(save.form).toBe(root.querySelector('form#customer-form'));
    expect(save.querySelector('mat-icon[aria-hidden="true"]')?.textContent?.trim()).toBe('save');
    expect(save.querySelector('.mdc-button__label')?.textContent?.trim()).toBe('Save');
    expect(getComputedStyle(save).getPropertyValue('--mat-button-filled-container-color')).toBe(
      '#007f7e',
    );
    expect(getComputedStyle(save).getPropertyValue('--mat-button-filled-label-text-color')).toBe(
      '#fff',
    );
    expect(root.querySelector('form button[type="submit"]')).toBeNull();
    const cancel = toolbar.querySelector<HTMLAnchorElement>('a[href="/customers"]')!;
    expect([...toolbar.querySelector('.toolbar-actions')!.children]).toEqual([cancel, save]);
    expect(cancel.textContent?.trim()).toBe('Cancel');
    expect(getComputedStyle(cancel).getPropertyValue('--mat-button-text-label-text-color')).toBe(
      '#fff',
    );
  });

  it('adds and removes address rows without dropping the required first row', () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const addressesCard = root.querySelector('form > mat-card.addresses-card')!;
    expect(addressesCard.getAttribute('appearance')).toBe('outlined');
    expect(addressesCard.querySelector('h2')?.textContent).toBe('Addresses');
    const addressRows = () => addressesCard.querySelectorAll('.address-row[role="group"]');
    const remove = (row: Element) =>
      row.querySelector<HTMLButtonElement>('.address-heading button')!;
    expect(addressRows()).toHaveLength(1);
    expect(addressesCard.querySelectorAll('mat-divider')).toHaveLength(0);
    expect(addressesCard.querySelector('fieldset')).toBeNull();
    expect(addressRows()[0].getAttribute('aria-labelledby')).toBe(
      addressRows()[0].querySelector('h3')?.id,
    );
    expect(addressRows()[0].querySelector('h3')?.textContent).toBe('Address 1');
    const heading = addressRows()[0].querySelector<HTMLElement>('.address-heading')!;
    expect(getComputedStyle(heading).display).toBe('flex');
    expect(heading.lastElementChild).toBe(remove(addressRows()[0]));
    expect(remove(addressRows()[0]).getAttribute('aria-label')).toBe('Remove address 1');
    expect(remove(addressRows()[0]).classList.contains('mat-mdc-unelevated-button')).toBe(true);
    expect(
      getComputedStyle(remove(addressRows()[0])).getPropertyValue(
        '--mat-button-filled-container-color',
      ),
    ).toBe('#b91c1c');
    expect(
      remove(addressRows()[0]).querySelector('mat-icon[aria-hidden="true"]')?.textContent,
    ).toBe('delete');
    expect(remove(addressRows()[0]).disabled).toBe(true);
    const actions = addressesCard.querySelector<HTMLElement>('.address-actions')!;
    const add = actions.querySelector<HTMLButtonElement>('button')!;
    expect(getComputedStyle(actions).justifyContent).toBe('flex-end');
    expect(add.type).toBe('button');
    expect(add.textContent).toContain('Add address');
    expect(add.querySelector('mat-icon[aria-hidden="true"]')?.textContent).toBe('add');
    add.click();
    fixture.detectChanges();
    expect(addressRows()).toHaveLength(2);
    expect(remove(addressRows()[1]).getAttribute('aria-label')).toBe('Remove address 2');
    const divider = addressesCard.querySelector('mat-divider')!;
    expect(addressesCard.querySelectorAll('mat-divider')).toHaveLength(1);
    expect(divider.previousElementSibling).toBe(addressRows()[0]);
    expect(divider.nextElementSibling).toBe(addressRows()[1]);
    expect(divider.getAttribute('aria-hidden')).toBe('true');
    const firstId = input(addressRows()[0] as HTMLElement, 'Street').id;
    type(addressRows()[1] as HTMLElement, 'Street', 'River Road');
    remove(addressRows()[0]).click();
    fixture.detectChanges();
    expect(addressRows()).toHaveLength(1);
    expect(addressesCard.querySelectorAll('mat-divider')).toHaveLength(0);
    expect(input(addressRows()[0] as HTMLElement, 'Street').id).not.toBe(firstId);
    expect(input(addressRows()[0] as HTMLElement, 'Street').value).toBe('River Road');
    expect(remove(addressRows()[0]).disabled).toBe(true);
  });

  it('retries failed live country refresh and removes its warning on success', () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((r) => r.url === 'https://countries.dev/countries')
      .flush('Unavailable', {
        status: 503,
        statusText: 'Unavailable',
      });
    fixture.detectChanges();
    const warning = root.querySelector('#customer-country-warning')!;
    warning.querySelector('button')!.click();
    http
      .expectOne((r) => r.url === 'https://countries.dev/countries')
      .flush(fallbackCountries.map(({ code, name, flag }) => ({ alpha2Code: code, name, flag })));
    fixture.detectChanges();
    expect(root.querySelector('#customer-country-warning')).toBeNull();
    expect(input(root, 'Nationality').disabled).toBe(false);
  });

  it('focuses required nationality before later address errors', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const detailsCard = root.querySelector('form > mat-card.customer-details-card')!;
    expect(detailsCard.getAttribute('appearance')).toBe('outlined');
    expect(detailsCard.querySelector('h2')?.textContent).toBe('Customer details');
    expect(detailsCard.querySelectorAll('mat-form-field')).toHaveLength(5);
    expect(detailsCard.querySelector('#customer-university')).toBeTruthy();
    expect(detailsCard.querySelector('fieldset')).toBeNull();
    expect(root.textContent).not.toContain('Choose a country first to search universities.');
    expect(input(root, 'University').disabled).toBe(true);
    expect(input(root, 'University').labels?.[0]?.textContent).toBe('University');
    expect(root.querySelector('form > mat-card.addresses-card h2')?.textContent).toBe('Addresses');
    type(root, 'First name', 'Amina');
    type(root, 'Last name', 'Okafor');
    type(root, 'Email', 'amina@example.test');
    const country = input(root, 'Nationality');
    expect(country.labels?.[0]?.textContent).toBe('Nationality');
    country.scrollIntoView = vi.fn();
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(country);
    expect(country.scrollIntoView).toHaveBeenCalled();
    expect(country.getAttribute('aria-describedby')).toBe('customer-country-error');
    const countryError = root.querySelector('.field-heading #customer-country-error')!;
    expect(countryError.textContent?.trim()).toBe('Choose a country.');
    expect(countryError.classList.contains('field-feedback')).toBe(true);
    TestBed.inject(HttpTestingController).expectNone('/api/customers');
  });

  it('scrolls and focuses the first invalid field after failed submit', async () => {
    const fixture = TestBed.createComponent(CustomerForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const firstName = input(root, 'First name');
    expect(firstName.labels?.[0]?.textContent).toBe('First name');
    expect(firstName.placeholder).toBe('e.g. Amina');
    expect(firstName.closest('mat-form-field')?.getAttribute('appearance')).toBe('outline');
    const firstScroll = vi.fn();
    firstName.scrollIntoView = firstScroll;

    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(firstName.outerHTML).toContain('aria-invalid="true"');
    const field = firstName.closest('mat-form-field')!;
    expect(getComputedStyle(field).display).toBe('flex');
    expect(firstName.getAttribute('aria-describedby')).toBe('customer-first-name-error');
    const firstNameError = root.querySelector('.field-heading #customer-first-name-error')!;
    expect(firstNameError.textContent).toContain('First name is required.');
    expect(firstNameError.classList.contains('field-feedback')).toBe(true);
    expect(root.querySelector('#customer-email-error')?.parentElement?.className).toBe(
      'field-heading',
    );
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
    const second = [...root.querySelectorAll<HTMLElement>('.address-row[role="group"]')].find(
      (row) => row.querySelector('h3')?.textContent?.includes('Address 2'),
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
      input(root, 'Nationality').closest('mat-form-field')?.querySelector('mat-hint'),
    ).toBeNull();
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
    const countryInput = input(root, 'Nationality');
    countryInput.focus();
    type(root, 'Nationality', '');
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
    expect(prediction?.textContent?.trim()).toBe('🇳🇬 Nigeria — 74%');
    expect(options.some((option) => option.textContent?.includes('Afghanistan'))).toBe(true);
    prediction!.click();
    fixture.detectChanges();
    expect(countryInput.value).toBe('Nigeria');
    expect(root.textContent).not.toContain('Confirmed:');
    countryInput.blur();
    countryInput.focus();
    fixture.detectChanges();
    expect(
      [...document.querySelectorAll('mat-option')].some(
        (option) => option.textContent?.trim() === '🇦🇺 Australia — 22%',
      ),
    ).toBe(true);
  });

  it('keeps the country picker usable when surname predictions fail', async () => {
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
    const country = input(root, 'Nationality');
    expect(country.closest('mat-form-field')?.querySelector('mat-hint')).toBeNull();
    expect(root.textContent).not.toContain('Suggestions unavailable.');
    chooseCountry(root, fixture, http);
    expect(country.value).toBe('Nigeria');
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
    input(root, 'University').focus();
    type(root, 'University', 'Stanford');
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
    const universityInput = input(root, 'University');
    universityInput.focus();
    type(root, 'University', 'Lagos');
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
    // Query inside Material's suffix slot, not just the form field. This proves
    // the button was projected into <app-search-field>'s suffix wrapper rather
    // than rendered after the input on its own line.
    const clearButton = universityInput
      .closest('mat-form-field')
      ?.querySelector<HTMLButtonElement>(
        '.mat-mdc-form-field-icon-suffix button[aria-label="Clear university"]',
      );
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
    input(root, 'University').focus();
    type(root, 'University', 'Lagos');
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
    expect(input(root, 'University').value).toBe('University of Lagos');
    const clearButton = input(root, 'University')
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
    input(root, 'Nationality').focus();
    type(root, 'Nationality', 'Australia');
    fixture.detectChanges();
    const australia = [...document.querySelectorAll('mat-option')].find((node) =>
      node.textContent?.includes('Australia'),
    ) as HTMLElement;
    australia.click();
    fixture.detectChanges();
    expect(input(root, 'University').value).toBe('');
    expect(
      input(root, 'University')
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
    input(root, 'University').focus();
    type(root, 'University', 'Lagos');
    fixture.detectChanges();
    expect(root.querySelector('.field-heading #customer-university-hint')?.textContent).toContain(
      'Waiting for search…',
    );
    expect(input(root, 'University').getAttribute('aria-describedby')).toBe(
      'customer-university-hint',
    );
    await new Promise((resolve) => setTimeout(resolve, 480));
    const stale = http.expectOne(
      (r) => r.url === '/external/universities' && r.params.get('name') === 'Lagos',
    );
    type(root, 'University', 'Ibadan');
    expect(stale.cancelled).toBe(true);
    fixture.detectChanges();
    type(root, 'University', '');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 480));
    http.expectNone((r) => r.url === '/external/universities');
    type(root, 'University', 'Ibadan');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 480));
    http
      .expectOne((r) => r.url === '/external/universities')
      .flush('unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    const retry = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Retry university search'),
    )!;
    expect(root.querySelector('#customer-university-hint')?.contains(retry)).toBe(true);
    retry.focus();
    retry.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(input(root, 'University'));
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
    expect(input(root, 'University').value).toBe('University of Lagos');
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
