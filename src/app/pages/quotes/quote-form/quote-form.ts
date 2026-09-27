import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, pattern, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { distinctUntilChanged, filter, map, switchMap, take } from 'rxjs';
import {
  Quote,
  QuoteDraft,
  QuoteStatus,
  formatEuroInput,
  isQuoteStatus,
  parseEuroCents,
  quoteStatuses,
} from '../data-access/quote.model';
import { quoteActions, quoteFeature, selectQuote } from '../data-access/quote.store';
import { PageToolbar } from '../../../shared/page-toolbar/page-toolbar';
import { SelectField } from '../../../shared/select-field/select-field';
import { TextField } from '../../../shared/text-field/text-field';

// The form's own data shape. All three are strings because that is what the
// inputs produce; conversion to `QuoteDraft` (cents, typed status) happens in
// `save()`.
interface QuoteFormModel {
  customerId: string;
  amount: string;
  status: string;
}

// The `/quotes/new` and `/quotes/:quoteId/edit` page. One component serves
// both; `editId` tells the two modes apart.
//
// This form uses Angular Signal Forms (`@angular/forms/signals`). It is the
// closest thing Angular has to `v-model` on a reactive object plus a
// vee-validate style schema:
//
//   const model = signal({...})         the data, like `reactive({...})`
//   form(model, (path) => {...})        attaches validation rules per field
//   [formField]="quoteForm.amount"      binds an input to a field, like v-model
//   quoteForm.amount()                  that field's state: value(), touched(),
//                                       invalid(), errors()
//
// Writing to `model` updates the inputs; typing in an input updates `model`.
// Validation state is derived, so there is no "validate()" call to remember.
@Component({
  selector: 'app-quote-form',
  imports: [MatButton, MatIcon, RouterLink, PageToolbar, SelectField, TextField],
  templateUrl: './quote-form.html',
  providers: [
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { subscriptSizing: 'dynamic' } },
  ],
  styles: `
    form {
      max-width: 52rem;
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
export class QuoteForm {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  // Needed to call `afterNextRender` from inside `save()`, which runs long
  // after construction (see there).
  private readonly injector = inject(Injector);
  // The `#formElement` ref, used to find the first invalid control to focus.
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  // Choices for the Status <app-select-field>; the raw status doubles as label.
  protected readonly statusOptions = quoteStatuses.map((status) => ({
    value: status,
    label: status,
  }));
  // The form data. `amount` is kept as the raw text the user typed and only
  // converted to cents on save, so partial input like "10." is not mangled
  // while typing.
  protected readonly model = signal<QuoteFormModel>({
    customerId: '',
    amount: '',
    status: 'draft',
  });
  // The schema callback receives a `path` object mirroring the model's shape;
  // each rule attaches to one field. `pattern` gives instant inline feedback;
  // `parseEuroCents` in `save()` remains the authoritative amount check.
  protected readonly quoteForm = form(this.model, (path) => {
    required(path.customerId, { message: 'Select a customer.' });
    required(path.amount, { message: 'Enter an amount.' });
    pattern(path.amount, /^(?!0+(?:\.0{1,2})?$)\d{1,7}(?:\.\d{1,2})?$/, {
      message: 'Enter an amount above zero, up to 9,999,999.99 with at most two decimals.',
    });
    required(path.status, { message: 'Select a status.' });
  });
  // True after the first Save click. The template shows errors for touched
  // fields OR once an attempt was made, so a user who clicks Save without
  // touching anything still sees what is missing.
  protected readonly attempted = signal(false);
  // null on /quotes/new; the id on /quotes/:quoteId/edit.
  protected readonly editId = signal<string | null>(null);
  // The quote being edited, once loaded. Its id and createdAt are preserved.
  protected readonly currentQuote = signal<Quote | null>(null);
  protected readonly customers = this.store.selectSignal(quoteFeature.selectCustomers);
  // Choices for the Customer <app-select-field>, derived from the loaded list
  // and sorted by the displayed name. `localeCompare` handles accents
  // (Müller, São) the way a person would; a plain `<` would sort them last.
  protected readonly customerOptions = computed(() =>
    this.customers()
      .map((customer) => ({
        value: customer.id,
        label: `${customer.firstName} ${customer.lastName}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
  protected readonly customersStatus = this.store.selectSignal(quoteFeature.selectCustomersStatus);
  protected readonly status = this.store.selectSignal(quoteFeature.selectLoadStatus);
  protected readonly saving = this.store.selectSignal(quoteFeature.selectSaveStatus);
  protected readonly error = this.store.selectSignal(quoteFeature.selectError);
  protected readonly customersError = this.store.selectSignal(quoteFeature.selectCustomersError);
  // The filters the list page was showing when "Add quote" or "Edit" was
  // clicked, read from `?customerId=&status=`. They are handed back on save
  // and on Cancel so the list reopens in the same state. `contextId` also
  // preselects the customer in create mode.
  protected readonly contextId = signal<string | null>(null);
  protected readonly contextStatus = signal<QuoteStatus | null>(null);
  // Business-rule errors the schema cannot express: the customer must exist in
  // the loaded list, the status must be a known value, the amount must parse
  // to cents. Each is passed to its field as `externalError`.
  protected readonly customerError = signal('');
  protected readonly statusError = signal('');
  protected readonly amountError = signal('');

  constructor() {
    // Query params. Preselect the customer in create mode only; in edit mode
    // the loaded quote's customer wins.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('customerId');
      this.contextId.set(id);
      const status = params.get('status');
      this.contextStatus.set(isQuoteStatus(status) ? status : null);
      if (!this.editId() && id) {
        this.model.update((value) => ({ ...value, customerId: id }));
      }
    });
    this.store.dispatch(quoteActions.customersRequested());
    // Path param `:quoteId`. Angular, like vue-router, REUSES the component
    // instance when only the param changes (q1/edit -> q2/edit), so this cannot
    // be a one-off read; it has to react every time the id changes.
    //
    // Reading the chain top to bottom: for each new id (`distinctUntilChanged`
    // drops repeats), reset the form, then wait for that quote to be in the
    // store. `switchMap` abandons the previous wait if the id changes again.
    this.route.paramMap
      .pipe(
        map((params) => params.get('quoteId')),
        distinctUntilChanged(),
        switchMap((id) => {
          // Reset everything for the new mode or id. Setting `model` clears
          // the inputs because they are bound to it.
          this.editId.set(id);
          this.currentQuote.set(null);
          this.attempted.set(false);
          this.customerError.set('');
          this.statusError.set('');
          this.amountError.set('');
          this.model.set({ customerId: this.contextId() ?? '', amount: '', status: 'draft' });
          if (!id) {
            // Create mode. Tell the store to ignore any in-flight get, and emit
            // nothing: returning an empty array is the RxJS idiom for "an
            // Observable that completes without a value".
            this.store.dispatch(quoteActions.getDismissed());
            return [];
          }
          // Skip the HTTP call when the list page already loaded this quote.
          if (!this.store.selectSignal(selectQuote(id))())
            this.store.dispatch(quoteActions.getRequested({ id }));
          // `store.select` (the Observable form) lets us wait: `filter` skips
          // the `undefined` emitted before the quote arrives, `take(1)` stops
          // listening after the first real value so later store updates do not
          // overwrite the user's edits.
          return this.store.select(selectQuote(id)).pipe(
            filter((quote): quote is Quote => !!quote),
            take(1),
          );
        }),
        // Passing `destroyRef` explicitly works anywhere; the bare
        // `takeUntilDestroyed()` form only works directly in the constructor.
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((quote) => {
        // Belt and braces: ignore a quote that is not the one currently shown.
        if (quote.id !== this.editId()) return;
        this.currentQuote.set(quote);
        // Populate the inputs. Cents become "10.01" text for the amount box.
        this.model.set({
          customerId: quote.customerId,
          amount: formatEuroInput(quote.amountInMinorUnits),
          status: quote.status,
        });
      });
  }

  protected retry(): void {
    if (this.customersStatus() === 'error') this.store.dispatch(quoteActions.customersRequested());
    if (this.editId() && this.status() === 'error')
      this.store.dispatch(quoteActions.getRequested({ id: this.editId()! }));
  }

  // The `(submit)` handler. `async` because Signal Forms' `submit()` returns a
  // Promise. Vue: `@submit.prevent="save"`, with the prevent done by hand here.
  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    // Ignore the submit while a save is running, while the customer list is
    // not ready, or while the quote to edit has not arrived. The Save button
    // is also disabled during saving; this guard covers Enter-key submits.
    if (
      this.saving() === 'saving' ||
      this.customersStatus() !== 'loaded' ||
      (this.editId() && !this.currentQuote())
    )
      return;
    this.attempted.set(true);
    this.quoteForm().markAsTouched();
    const value = this.model();
    // Business checks the schema cannot express. They run on every submit so
    // a corrected value clears its message.
    const cents = parseEuroCents(value.amount);
    this.amountError.set(
      cents === null
        ? 'Enter an amount above zero, up to 9,999,999.99 with at most two decimals.'
        : '',
    );
    this.customerError.set(
      this.customers().some((customer) => customer.id === value.customerId)
        ? ''
        : 'Select an existing customer.',
    );
    this.statusError.set(isQuoteStatus(value.status) ? '' : 'Select a valid status.');
    // `quoteForm()` (with parens) is the root field state; `.invalid()` is true
    // if any schema rule fails.
    if (
      this.quoteForm().invalid() ||
      cents === null ||
      this.customerError() ||
      this.statusError()
    ) {
      // Move keyboard focus to the first invalid control. The template sets
      // `aria-invalid` on the NEXT render, so we wait for it: `afterNextRender`
      // is Angular's `nextTick`. It normally has to be called during
      // construction; the `injector` option lets it be called from here.
      afterNextRender(
        () => {
          this.formElement()
            ?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus();
        },
        { injector: this.injector },
      );
      return;
    }
    // `submit()` runs the callback, tracks the form's submitting state, and
    // refuses a second concurrent submit of the same form. The callback only
    // dispatches: the `save` effect in quote.store.ts makes the HTTP call and
    // `afterSave` navigates back to the list.
    await submit(this.quoteForm, async () => {
      const draft: QuoteDraft = {
        customerId: value.customerId,
        amountInMinorUnits: cents,
        // Safe cast: `isQuoteStatus` was checked above.
        status: value.status as QuoteStatus,
      };
      // Snapshot of "which navigation we are on" for the afterSave effect, so
      // a slow response cannot redirect a page the user has since left.
      const originNavigationId = this.router.lastSuccessfulNavigation()?.id ?? null;
      // Only hand the customer filter back if it resolves to a real customer;
      // otherwise the list would open showing "cannot be resolved".
      const customerId = this.customers().some((c) => c.id === this.contextId())
        ? this.contextId()
        : null;
      const current = this.currentQuote();
      // Edit keeps `id` and `createdAt` from the loaded quote. Create lets the
      // API assign them.
      if (current)
        this.store.dispatch(
          quoteActions.updateRequested({
            quote: { ...draft, id: current.id, createdAt: current.createdAt },
            customerId,
            statusFilter: this.contextStatus(),
            originNavigationId,
          }),
        );
      else
        this.store.dispatch(
          quoteActions.createRequested({
            draft,
            customerId,
            statusFilter: this.contextStatus(),
            originNavigationId,
          }),
        );
    });
  }
}
