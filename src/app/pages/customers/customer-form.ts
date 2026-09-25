import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatError } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormField,
  applyEach,
  email,
  form,
  minLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { Store } from '@ngrx/store';
import { distinctUntilChanged, filter, map, switchMap, take } from 'rxjs';
import { Address, Customer, CustomerDraft, University } from './data-access/customer.model';
import { customerActions, customerFeature, selectCustomer } from './data-access/customer.store';

// One component serves both `/customers/new` and `/customers/:customerId/edit`.
// It decides which mode it is in by whether the route has a `customerId`.
//
// Forms here use Angular's Signal Forms (`@angular/forms/signals`). If you have
// used a `reactive()` object with `v-model` plus a schema library such as
// VeeValidate or Zod, the idea is the same: the form's single source of truth
// is a plain object in a signal (`model`), and validation rules are declared
// separately against a typed path into that object.

// The form works with `nationality: string` (an empty input is ''), while the
// API wants `string | null`. `save()` converts between the two.
interface CustomerFormModel extends Omit<CustomerDraft, 'nationality'> {
  nationality: string;
}

// Factory functions instead of shared constants so every call returns a fresh
// object. Sharing one object would let two rows accidentally alias each other.
function blankAddress(): Address {
  return {
    id: crypto.randomUUID(),
    street: '',
    city: '',
    suburb: '',
    postalCode: '',
    countryCode: '',
  };
}

function blankUniversity(): University {
  return { id: crypto.randomUUID(), name: '' };
}

function blankModel(): CustomerFormModel {
  return {
    firstName: '',
    lastName: '',
    email: '',
    nationality: '',
    // Business rule: a customer always has at least one address.
    addresses: [blankAddress()],
    universities: [],
  };
}

@Component({
  selector: 'app-customer-form',
  // `FormField` is the directive behind `[formField]` in the template; it is
  // the Signal Forms equivalent of `v-model`.
  imports: [FormField, MatButton, MatFormField, MatLabel, MatError, MatInput, RouterLink],
  templateUrl: './customer-form.html',
  styles: `
    form {
      max-width: 52rem;
    }
    mat-form-field {
      display: block;
    }
    fieldset {
      margin-block: 1rem;
      border: 1px solid #888;
      border-radius: 4px;
    }
    .actions {
      display: flex;
      gap: 1rem;
      margin-block: 1rem;
    }
  `,
})
export class CustomerForm {
  private readonly store = inject(Store);
  // `ActivatedRoute` is Vue's `useRoute()`, except its params are Observables.
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  // Needed by `afterNextRender` below, which is called outside of construction.
  private readonly injector = inject(Injector);
  // Template ref to the <form> element (`#formElement` in the HTML). Typed so
  // `.nativeElement` is an HTMLFormElement.
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

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
      required(address.countryCode, { message: 'Country code is required.' });
      pattern(address.countryCode, /^[a-zA-Z]{2}$/, { message: 'Use a two-letter country code.' });
    });
    applyEach(path.universities, (university) => {
      required(university.name, { message: 'University name is required.' });
      pattern(university.name, /\S/, { message: 'University name cannot be blank.' });
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

  constructor() {
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
          nationality: customer.nationality ?? '',
          addresses: customer.addresses.map((a) => ({ ...a })),
          universities: customer.universities.map((u) => ({ ...u })),
        });
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
  protected addUniversity(): void {
    this.model.update((value) => ({
      ...value,
      universities: [...value.universities, blankUniversity()],
    }));
  }
  protected removeUniversity(id: string): void {
    this.model.update((value) => ({
      ...value,
      universities: value.universities.filter((u) => u.id !== id),
    }));
  }

  // Bound to `(submit)` on the <form>.
  protected async save(event: Event): Promise<void> {
    // Stop the browser's native full-page form post.
    event.preventDefault();
    // Ignore submits while saving, or while the edit page is still loading.
    if (this.saving() === 'saving' || (this.editId() && !this.currentCustomer())) return;

    if (this.customerForm().invalid()) {
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
          firstInvalid?.scrollIntoView({ behavior: 'auto', block: 'center' });
          firstInvalid?.focus({ preventScroll: true });
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
      // Normalise before sending: trim strings and turn an empty nationality into null.
      const draft: CustomerDraft = {
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        email: value.email.trim(),
        nationality: value.nationality.trim() || null,
        addresses: value.addresses.map((address) => ({
          ...address,
          street: address.street.trim(),
          city: address.city.trim(),
          suburb: address.suburb.trim(),
          postalCode: address.postalCode.trim(),
          countryCode: address.countryCode.trim(),
        })),
        universities: value.universities.map((university) => ({
          ...university,
          name: university.name.trim(),
        })),
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
