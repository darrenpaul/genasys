import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatDivider } from '@angular/material/divider';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  applyEach,
  email,
  form,
  minLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { Store } from '@ngrx/store';
import {
  Subject,
  catchError,
  concat,
  distinctUntilChanged,
  filter,
  map,
  merge,
  of,
  switchMap,
  take,
  timer,
} from 'rxjs';
import {
  Address,
  ConfirmedCountry,
  Customer,
  CustomerDraft,
  University,
} from '@app/pages/customers/data-access/customer.model';
import {
  Country,
  CountriesApi,
  fallbackCountries,
  NationalityApi,
  Prediction,
  UniversitiesApi,
  UniversityOption,
} from '@app/pages/customers/data-access/enrichment-api';
import {
  customerActions,
  customerFeature,
  selectCustomer,
} from '@app/pages/customers/data-access/customer.store';
import { PageToolbar } from '@app/shared/page-toolbar/page-toolbar';
import { SearchField } from '@app/shared/search-field/search-field';
import { TextField } from '@app/shared/text-field/text-field';
import { CountrySelect } from '@app/pages/customers/ui/country-select/country-select';

// One component serves both `/customers/new` and `/customers/:customerId/edit`.
// It decides which mode it is in by whether the route has a `customerId`.
//
// Forms here use Angular's Signal Forms (`@angular/forms/signals`). If you have
// used a `reactive()` object with `v-model` plus a schema library such as
// VeeValidate or Zod, the idea is the same: the form's single source of truth
// is a plain object in a signal (`model`), and validation rules are declared
// separately against a typed path into that object.
//
// The page also "enriches" the customer while they type:
//   1. Surname  -> nationality suggestions (api.nationalize.io), shown at the
//      top of the country picker. The user must still confirm a country.
//   2. Country  -> university search (HipoLabs), enabled only once a country
//      is confirmed.
// Both lookups are debounced, cancel stale requests, and expose a small state
// machine ('idle' | 'waiting' | 'loading' | ...) that the template renders as
// a hint under the input. The wiring lives in the constructor and uses RxJS,
// which is the part most likely to look foreign after Vue; the comments there
// walk through it operator by operator.

// The form model is the draft shape exactly as the API wants it. Nationality
// is `ConfirmedCountry | null`, never free text: the country search box has
// its own signal (`countryQuery`) outside the model.
type CustomerFormModel = CustomerDraft;

// Factory functions instead of shared constants so every call returns a fresh
// object. Sharing one object would let two rows accidentally alias each other.
function blankAddress(): Address {
  return {
    id: crypto.randomUUID(),
    street: '',
    city: '',
    suburb: '',
    postalCode: '',
  };
}

function blankUniversity(): University {
  return { id: crypto.randomUUID(), name: '', website: null };
}

function blankModel(): CustomerFormModel {
  return {
    firstName: '',
    lastName: '',
    email: '',
    nationality: null,
    // Business rule: a customer always has at least one address.
    addresses: [blankAddress()],
    universities: [blankUniversity()],
  };
}

@Component({
  selector: 'app-customer-form',
  // `FormField` is the directive behind `[formField]` in the template; it is
  // the Signal Forms equivalent of `v-model`.
  //
  // Everything a standalone component's template uses must be listed here.
  // There is no global registration like `app.component(...)` in Vue.
  // `MatAutocompleteModule` bundles <mat-autocomplete>, <mat-option>,
  // <mat-optgroup> and the `[matAutocomplete]` input directive.
  imports: [
    MatButton,
    MatIconButton,
    MatCard,
    MatCardContent,
    MatDivider,
    MatIcon,
    MatAutocompleteModule,
    RouterLink,
    PageToolbar,
    SearchField,
    TextField,
    CountrySelect,
  ],
  templateUrl: './customer-form.html',
  providers: [
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { subscriptSizing: 'dynamic' } },
  ],
  styles: `
    form {
      max-width: 52rem;
    }
    .customer-details-card {
      margin-bottom: 1rem;
    }
    mat-card h2 {
      margin-top: 0;
    }
    .address-row {
      margin-block: 1rem;
    }
    .address-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .address-heading h3 {
      margin: 0;
    }
    .remove-address-button {
      min-width: 40px;
      --mat-button-filled-horizontal-padding: 8px;
      --mat-button-filled-icon-spacing: 0px;
      --mat-button-filled-icon-offset: 0px;
      --mat-button-filled-container-color: #b91c1c;
      --mat-button-filled-label-text-color: #fff;
    }
    .address-actions {
      display: flex;
      justify-content: flex-end;
    }
    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .toolbar-actions a {
      --mat-button-text-label-text-color: #fff;
      --mat-button-text-state-layer-color: #fff;
    }
  `,
})
export class CustomerForm {
  private readonly store = inject(Store);
  // `ActivatedRoute` is Vue's `useRoute()`, except its params are Observables.
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  // Three small HTTP services from enrichment-api.ts. `inject()` is Angular's
  // dependency injection. The nearest Vue analogy is `inject()` from
  // provide/inject, except that classes marked `@Service()` are registered
  // app-wide automatically, so nothing has to `provide()` them first. Tests
  // can still swap them for fakes through `TestBed`.
  private readonly countriesApi = inject(CountriesApi);
  private readonly nationalityApi = inject(NationalityApi);
  private readonly universitiesApi = inject(UniversitiesApi);
  private readonly destroyRef = inject(DestroyRef);
  // Needed by `afterNextRender` below, which is called outside of construction.
  private readonly injector = inject(Injector);
  // Template ref to the <form> element (`#formElement` in the HTML). Typed so
  // `.nativeElement` is an HTMLFormElement.
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');
  // Same idea as `ref="countryField"` + `useTemplateRef()` in Vue. These are
  // only used to put keyboard focus back into the search input after a Retry
  // click, through the component's `focus()` method.
  private readonly countryField = viewChild<CountrySelect>('countryField');
  private readonly universityField = viewChild<SearchField>('universityField');

  // --- The form ------------------------------------------------------------
  // `model` holds the current values. `[formField]` bindings in the template
  // read from and write to it directly, so `this.model()` is always the latest
  // user input. Setting it (e.g. when loading a customer) updates every input.
  protected readonly model = signal<CustomerFormModel>(blankModel());

  // `form(model, schemaFn)` wraps the signal with validation and field state.
  // `path` is a typed proxy of the model: `path.firstName`, `path.addresses`,
  // and so on. Each rule takes a path, and an optional message.
  //
  // In the template, `customerForm.firstName` is the field to bind, and
  // `customerForm.firstName()` returns its state: `.touched()`, `.invalid()`,
  // `.errors()`. Same idea as VeeValidate's `useField` meta.
  protected readonly customerForm = form(this.model, (path) => {
    required(path.firstName, { message: 'First name is required.' });
    // `required` accepts whitespace-only strings, so pair it with a "has at
    // least one non-space character" pattern.
    pattern(path.firstName, /\S/, { message: 'First name cannot be blank.' });
    required(path.lastName, { message: 'Last name is required.' });
    pattern(path.lastName, /\S/, { message: 'Last name cannot be blank.' });
    required(path.email, { message: 'Email is required.' });
    email(path.email, { message: 'Enter a valid email.' });
    // On an array path, `minLength` checks the number of items.
    minLength(path.addresses, 1, { message: 'Add at least one address.' });
    // `applyEach` applies rules to every element of an array, and keeps doing
    // so as rows are added or removed.
    applyEach(path.addresses, (address) => {
      required(address.street, { message: 'Street is required.' });
      pattern(address.street, /\S/, { message: 'Street cannot be blank.' });
      required(address.city, { message: 'City is required.' });
      pattern(address.city, /\S/, { message: 'City cannot be blank.' });
      required(address.postalCode, { message: 'Postal code is required.' });
      pattern(address.postalCode, /\S/, { message: 'Postal code cannot be blank.' });
    });
  });

  // --- Page state ------------------------------------------------------------
  /** Becomes true on the first submit attempt, so untouched invalid fields show errors. */
  protected readonly attempted = signal(false);
  /** The customer being edited, or null when creating (or still loading). */
  protected readonly currentCustomer = signal<Customer | null>(null);
  /** The `:customerId` route param, or null on the create page. */
  protected readonly editId = signal<string | null>(null);
  protected readonly status = this.store.selectSignal(customerFeature.selectLoadStatus);
  protected readonly saving = this.store.selectSignal(customerFeature.selectSaveStatus);
  protected readonly error = this.store.selectSignal(customerFeature.selectError);

  // --- Nationality enrichment ----------------------------------------------
  // Full country list for the picker. Starts as the bundled snapshot so the
  // page works even when the country service is down, then is replaced by the
  // live list if the refresh in `loadCountries()` succeeds.
  protected readonly countries = signal<Country[]>(fallbackCountries);
  /** True when the live country refresh failed; the picker offers a Retry. */
  protected readonly countryWarning = signal(false);
  // Surname-based suggestions from the nationality API, best match first.
  // Passed into <app-country-select>, which does the filtering and rendering.
  // The search text itself lives inside the picker: the form only cares about
  // the *confirmed* country (`model().nationality`).
  protected readonly predictions = signal<Prediction[]>([]);
  // A small state machine for the hint under the country input:
  //   idle     surname too short, nothing to do
  //   waiting  surname changed, debounce timer running
  //   loading  request in flight
  //   ready    suggestions available        empty    none found
  //   error    request failed               limited  API quota hit (HTTP 429)
  // One union-typed signal instead of several booleans means the template's
  // `@switch` can never show two hints at once.
  protected readonly predictionState = signal<
    'idle' | 'waiting' | 'loading' | 'empty' | 'ready' | 'error' | 'limited'
  >('idle');

  // --- University enrichment -----------------------------------------------
  /** Text in the university search box. Like `countryQuery`, kept outside `model`. */
  protected readonly universityQuery = signal('');
  /** Search results for the current country + query. */
  protected readonly universities = signal<UniversityOption[]>([]);
  /** Same idea as `predictionState`, minus 'limited'. */
  protected readonly universityState = signal<
    'idle' | 'waiting' | 'loading' | 'empty' | 'ready' | 'error'
  >('idle');
  /** True while the university hint block is visible beside the label. */
  protected readonly universityHintVisible = computed(() =>
    ['waiting', 'loading', 'empty', 'error'].includes(this.universityState()),
  );

  // --- Manual triggers into the RxJS pipelines ------------------------------
  // A `Subject` is an RxJS stream you push into by hand with `.next(value)`.
  // Think of it as a typed event emitter that the pipelines in the
  // constructor subscribe to. They exist so that user actions (typing,
  // clicking Retry) feed the same debounced pipelines as the signal-driven
  // inputs, instead of duplicating the request logic in each handler.
  private readonly retryPrediction = new Subject<void>();
  private readonly retryUniversity = new Subject<void>();
  // Why both a Subject *and* `toObservable(model().lastName)` for the surname?
  // `toObservable` emits asynchronously (after change detection), while the
  // `(input)` DOM event is synchronous. Feeding both into one pipeline with
  // `distinctUntilChanged` gives the fastest possible feedback without ever
  // firing a duplicate request for the same value.
  private readonly surnameInput = new Subject<string>();
  private readonly searchInput = new Subject<{ countryCode: string; query: string }>();

  /** `(input)` on the surname field. Pushes the trimmed value into the prediction pipeline. */
  protected onSurnameInput(event: Event): void {
    this.surnameInput.next((event.target as HTMLInputElement).value.trim());
  }
  /** Pushes the current country + query pair into the university pipeline. */
  private searchChanged(): void {
    this.searchInput.next({
      countryCode: this.model().nationality?.code ?? '',
      query: this.universityQuery().trim(),
    });
  }

  // --- Country handler ------------------------------------------------------
  /**
   * `(valueChange)` from <app-country-select>: the user picked a country.
   * Changing country also resets the university, because a university is only
   * meaningful for the country it was searched under. The picker never emits
   * null; the parameter is nullable only because the bound value is.
   */
  protected confirmCountry(country: ConfirmedCountry | null): void {
    if (!country) return;
    if (this.model().nationality?.code !== country.code) {
      this.universityQuery.set('');
      this.universities.set([]);
      // `model.update(fn)` replaces the whole form object. Always spread into
      // a new object rather than mutating; see the note on `addAddress()`.
      this.model.update((value) => ({
        ...value,
        nationality: { code: country.code, name: country.name },
        universities: [blankUniversity()],
      }));
    }
    // Let the university pipeline know the country changed.
    this.searchChanged();
  }
  // `[displayWith]` for the university autocomplete. Its option values are
  // whole `UniversityOption` objects, so Material asks this function how to
  // print one as input text. Declared as an arrow-function property (not a
  // method) so `this` is not lost when Material calls it.
  protected readonly displayUniversity = (option: UniversityOption | string | null): string =>
    typeof option === 'string' ? option : (option?.name ?? '');

  // --- Retry handlers -------------------------------------------------------
  // Focus goes back to the input *before* the retry so a keyboard user is
  // not left on a button that disappears as soon as the state changes.
  protected retryCountries(): void {
    this.loadCountries();
  }
  protected retryNationality(): void {
    this.countryField()?.focus();
    this.retryPrediction.next();
  }
  protected retrySearch(): void {
    this.universityField()?.focus();
    this.retryUniversity.next();
  }

  // --- University handlers --------------------------------------------------
  /**
   * `(input)` on the university box. Typing anything other than the exact
   * selected name clears the selection: the model only ever holds a
   * university the user picked from the results, never free text.
   */
  protected onUniversityInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    if (query !== this.model().universities[0]?.name) {
      this.model.update((value) => ({ ...value, universities: [blankUniversity()] }));
    }
    this.universityQuery.set(query);
    this.searchChanged();
  }
  /** `(optionSelected)` from the university <mat-autocomplete>. */
  protected chooseUniversity(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as UniversityOption;
    // Guard against a stale results list left over from a previous country.
    if (option.countryCode !== this.model().nationality?.code) return;
    this.model.update((value) => ({
      ...value,
      universities: [
        {
          // Keep the existing row id so `@for ... track` does not re-create the row.
          id: value.universities[0]?.id ?? crypto.randomUUID(),
          name: option.name,
          website: option.website,
        },
      ],
    }));
    this.universityQuery.set(option.name);
    this.searchChanged();
    // Close the dropdown; the pipeline treats "query equals selected name" as idle.
    this.universities.set([]);
  }
  /** The "×" suffix button inside the university field. */
  protected clearUniversity(): void {
    this.universityQuery.set('');
    this.model.update((value) => ({ ...value, universities: [blankUniversity()] }));
    this.searchChanged();
  }

  // Fetches the live country list. `subscribe({ next, error })` is the
  // Observable equivalent of `.then()/.catch()`. `takeUntilDestroyed` unsubscribes
  // automatically when the component is destroyed (like Vue tearing down
  // watchers on unmount); without it the callbacks could run after the page
  // is gone. The service caches the result, so Retry is cheap.
  private loadCountries(): void {
    this.countriesApi
      .refresh()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (countries) => {
          this.countries.set(countries);
          this.countryWarning.set(false);
        },
        error: () => this.countryWarning.set(true),
      });
  }

  // The constructor is where Angular components set up long-lived
  // subscriptions, roughly where you would put `watch()` calls in `setup()`.
  constructor() {
    this.loadCountries();

    // --- Pipeline 1: surname -> nationality suggestions ---------------------
    // In Vue you might reach for VueUse:
    //   watchDebounced(() => form.lastName, fetchPredictions, { debounce: 600 })
    // and then handle cancellation and the loading flag by hand. RxJS expresses
    // all of that declaratively. Read the chain top to bottom.
    //
    // `toObservable(signal)` bridges the signal world into RxJS: it emits the
    // signal's value every time it changes. Wrapping `lastName` in a
    // `computed` first means we only react to changes of the trimmed value.
    const surname$ = toObservable(computed(() => this.model().lastName.trim())).pipe(
      distinctUntilChanged(), // ignore an emission equal to the previous one
    );
    // `merge` joins several streams into one. The surname signal, the raw
    // `(input)` event and the Retry button all flow into the same place.
    // Retry maps to the *current* surname and skips the dedupe, so clicking
    // it re-runs the request for the same value.
    merge(
      merge(surname$, this.surnameInput).pipe(distinctUntilChanged()),
      this.retryPrediction.pipe(map(() => this.model().lastName.trim())),
    )
      .pipe(
        // `switchMap` is the heart of it. For every new surname it starts the
        // inner stream returned below and *cancels* whatever the previous one
        // was doing. So if the user keeps typing, the pending timer or the
        // in-flight HTTP request is dropped, and an old response can never
        // overwrite a newer one.
        switchMap((name) => {
          this.predictions.set([]);
          // `of(x)` is a stream that emits `x` once. Too short: back to idle.
          if (name.length < 2) return of('idle' as const);
          // `concat` runs streams one after another: emit 'waiting' straight
          // away, then after the 600 ms debounce move on to the HTTP request.
          return concat(
            of('waiting' as const),
            timer(600).pipe(
              switchMap(() => {
                this.predictionState.set('loading');
                return this.nationalityApi.predict(name, this.countries()).pipe(
                  // Success: store the results and derive the next state.
                  map((results) => {
                    this.predictions.set(results);
                    return results.length ? ('ready' as const) : ('empty' as const);
                  }),
                  // Failure: convert the error into a state value. Without
                  // this an HTTP error would terminate the *outer* stream too,
                  // and suggestions would stop working for the rest of the
                  // component's life.
                  catchError((error: unknown) =>
                    of(
                      error instanceof HttpErrorResponse && error.status === 429
                        ? ('limited' as const)
                        : ('error' as const),
                    ),
                  ),
                );
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      // Everything above boils down to a state string; this is the single
      // place that writes it.
      .subscribe((state) => this.predictionState.set(state));

    // --- Pipeline 2: country + query -> university results ------------------
    // Same shape as pipeline 1 with two differences: the input is a pair
    // (countryCode, query), so `distinctUntilChanged` needs a comparator; and
    // the debounce is shorter (400 ms) because this is the text the user is
    // actively typing, so results should feel snappier.
    const search$ = toObservable(
      computed(() => ({
        countryCode: this.model().nationality?.code ?? '',
        query: this.universityQuery().trim(),
      })),
    ).pipe(distinctUntilChanged((a, b) => a.countryCode === b.countryCode && a.query === b.query));
    merge(
      merge(search$, this.searchInput).pipe(
        distinctUntilChanged((a, b) => a.countryCode === b.countryCode && a.query === b.query),
      ),
      this.retryUniversity.pipe(
        map(() => ({
          countryCode: this.model().nationality?.code ?? '',
          query: this.universityQuery().trim(),
        })),
      ),
    )
      .pipe(
        switchMap(({ countryCode, query }) => {
          this.universities.set([]);
          const country = this.countries().find((item) => item.code === countryCode);
          // Nothing to search when there is no confirmed country, the query
          // is too short, or the query is exactly the university already
          // selected (typing it back in should not reopen the dropdown).
          if (!country || query.length < 2 || query === this.model().universities[0]?.name)
            return of('idle' as const);
          return concat(
            of('waiting' as const),
            timer(400).pipe(
              switchMap(() => {
                this.universityState.set('loading');
                return this.universitiesApi.search(country, query).pipe(
                  map((results) => {
                    this.universities.set(results);
                    return results.length ? ('ready' as const) : ('empty' as const);
                  }),
                  catchError(() => of('error' as const)),
                );
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.universityState.set(state));
    // React to the route parameter. This is an Observable rather than a plain
    // value because Angular reuses the component instance when only the param
    // changes (e.g. navigating from /c1/edit straight to /c2/edit). In Vue you
    // would `watch(() => route.params.customerId, ...)` for the same reason.
    this.route.paramMap
      .pipe(
        map((params) => params.get('customerId')),
        distinctUntilChanged(),
        switchMap((id) => {
          // Reset everything for the new id (or for the create page).
          this.editId.set(id);
          this.attempted.set(false);
          this.currentCustomer.set(null);
          this.model.set(blankModel());
          // The university search box lives outside `model`, so clear it too.
          // (The country picker resets its own text when `[value]` changes.)
          this.universityQuery.set('');
          // Create mode: returning an empty array = "emit nothing, complete".
          if (!id) return [];
          // Edit mode. If the list page already loaded this customer, it is in
          // the store and we skip the network round-trip.
          const existing = this.store.selectSignal(selectCustomer(id))();
          if (!existing) this.store.dispatch(customerActions.getRequested({ id }));
          // Wait for the customer to appear in the store, then stop listening.
          // `filter` with a type guard narrows `Customer | undefined` to `Customer`.
          return this.store.select(selectCustomer(id)).pipe(
            filter((customer): customer is Customer => !!customer),
            take(1),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((customer) => {
        // Belt and braces: ignore a late result for an id we have moved away from.
        if (customer.id !== this.editId()) return;
        this.currentCustomer.set(customer);
        // Copy into the form model. The arrays are shallow-cloned so editing the
        // form never mutates the object that lives inside the NgRx store.
        this.model.set({
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          nationality: customer.nationality,
          addresses: customer.addresses.map(({ id, street, city, suburb, postalCode }) => ({
            id,
            street,
            city,
            suburb,
            postalCode,
          })),
          universities: [
            customer.universities[0] ? { ...customer.universities[0] } : blankUniversity(),
          ],
        });
        // Pre-fill the university search box so the user sees the saved name
        // as text. Pipeline 2 recognises "query equals the confirmed value" and
        // stays idle, so this does not trigger a lookup. The country picker
        // fills its own box from `[value]`.
        this.universityQuery.set(customer.universities[0]?.name ?? '');
      });
  }

  // Array rows are added/removed by producing a new model object with
  // `signal.update(fn)`. Never `push` onto the existing array: signals only
  // notify when the value reference changes, so mutation would not re-render.
  protected addAddress(): void {
    this.model.update((value) => ({ ...value, addresses: [...value.addresses, blankAddress()] }));
  }
  protected removeAddress(id: string): void {
    this.model.update((value) => ({
      ...value,
      // Keep at least one address; the button is also disabled in that case.
      addresses:
        value.addresses.length > 1 ? value.addresses.filter((a) => a.id !== id) : value.addresses,
    }));
  }
  // Bound to `(submit)` on the <form>.
  protected async save(event: Event): Promise<void> {
    // Stop the browser's native full-page form post.
    event.preventDefault();
    // Ignore submits while saving, or while the edit page is still loading.
    if (this.saving() === 'saving' || (this.editId() && !this.currentCustomer())) return;

    // Nationality is required but has no Signal Forms rule in the schema: the
    // country box is not a `[formField]`, it is a search input feeding a
    // signal. So it is checked by hand here and in the template.
    if (this.customerForm().invalid() || !this.model().nationality) {
      // Accessibility: move the user to the first problem. The `aria-invalid`
      // attributes only appear once `attempted` flips to true and the template
      // re-renders, so we schedule this for after the next render.
      // `afterNextRender` is Angular's `nextTick`. Because we are inside an
      // event handler rather than the constructor, we must pass the injector.
      afterNextRender(
        () => {
          const firstInvalid = this.formElement()?.nativeElement.querySelector<HTMLElement>(
            'input[aria-invalid="true"]',
          );
          // No invalid `[formField]` input? Then the problem is the country
          // box, which gets its `aria-invalid` from the template, not from
          // Signal Forms. Fields are in DOM order, so a missing country is
          // reported before any address error further down the page.
          const target =
            firstInvalid ??
            (!this.model().nationality
              ? this.formElement()?.nativeElement.querySelector<HTMLElement>('#customer-country')
              : null);
          target?.scrollIntoView({ behavior: 'auto', block: 'center' });
          target?.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
    }
    this.attempted.set(true);

    // `submit()` from Signal Forms marks every field as touched, and only runs
    // the callback when the whole form is valid. On an invalid form it resolves
    // without calling it, so the guard above and the errors in the template do
    // the rest.
    await submit(this.customerForm, async () => {
      const value = this.model();
      // Defensive: never save a country code that is not in the list we
      // offered. The UI cannot produce one, but the model is plain data.
      if (
        !value.nationality ||
        !this.countries().some((item) => item.code === value.nationality?.code)
      )
        return;
      const draft: CustomerDraft = {
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        email: value.email.trim(),
        nationality: value.nationality,
        addresses: value.addresses.map((address) => ({
          id: address.id,
          street: address.street.trim(),
          city: address.city.trim(),
          suburb: address.suburb.trim(),
          postalCode: address.postalCode.trim(),
        })),
        // The form always holds exactly one university row (possibly blank).
        // The API wants an empty array when nothing was chosen.
        universities: value.universities[0]?.name.trim()
          ? [
              {
                id: value.universities[0].id,
                name: value.universities[0].name.trim(),
                website: value.universities[0].website,
              },
            ]
          : [],
      };
      const current = this.currentCustomer();
      // Captured so the `afterSave` effect can tell whether this exact page
      // instance is still open when the response comes back.
      const originNavigationId = this.router.lastSuccessfulNavigation()?.id ?? null;
      // The component's job ends at `dispatch`. The API call, the "Customer
      // saved" toast and the redirect all happen in customer.store.ts effects.
      if (current)
        this.store.dispatch(
          customerActions.updateRequested({
            // Preserve server-owned fields; PUT replaces the whole record.
            customer: { ...draft, id: current.id, createdAt: current.createdAt },
            originNavigationId,
          }),
        );
      else this.store.dispatch(customerActions.createRequested({ draft, originNavigationId }));
    });
  }
}
