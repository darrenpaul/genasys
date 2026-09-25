import { Component, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { catchError, finalize, of, switchMap, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { customerActions, customerFeature } from './data-access/customer.store';
import { Customer } from './data-access/customer.model';
import { CustomerQuotesApi, hasRelatedQuotes } from './data-access/customers-api';
import { ConfirmDelete } from './ui/confirm-delete';

// The `/customers` list page: a searchable, sortable, paginated Material table
// with Edit/Delete per row.
//
// Coming from Vue, an Angular component is a class plus a decorator instead of
// an SFC. Rough mapping:
//
//   @Component({ selector })   -> the component's tag name
//   @Component({ imports })    -> the `components:` option (what the template may use)
//   @Component({ templateUrl }) -> the <template> block, kept in a sibling .html file
//   @Component({ styles })     -> a <style scoped> block (Angular scopes styles by default)
//   class fields               -> what you would return from `setup()`
//   constructor()              -> the body of `setup()`
//
// Anything the template reads must be `public` or `protected`. `protected` is
// the convention: visible to the template, hidden from other TypeScript code.
@Component({
  selector: 'app-customers',
  imports: [
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatPaginator,
    MatSort,
    MatSortHeader,
    MatTableModule,
    RouterLink,
  ],
  templateUrl: './customers.html',
  styles: `
    .table-scroll {
      overflow-x: auto;
    }
    table {
      min-width: 640px;
      width: 100%;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .sr-only {
      position: absolute;
      clip: rect(0, 0, 0, 0);
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
  `,
})
export class Customers {
  // Dependencies come from `inject()` rather than constructor parameters.
  // `Store` is the NgRx store (think `useStore()` / `useCustomerStore()`).
  private readonly store = inject(Store);
  private readonly dialog = inject(MatDialog);
  private readonly quotes = inject(CustomerQuotesApi);
  // `DestroyRef` lets us tie subscriptions to this component's lifetime.
  private readonly destroyRef = inject(DestroyRef);

  // --- State read from the NgRx store -------------------------------------
  // `selectSignal` turns a selector into a read-only Signal. A Signal is
  // Angular's `ref`/`computed`: you READ it by calling it, `customers()`, both
  // here and in the template. These stay in sync with the store automatically.
  protected readonly customers = this.store.selectSignal(customerFeature.selectAll);
  protected readonly status = this.store.selectSignal(customerFeature.selectLoadStatus);
  protected readonly error = this.store.selectSignal(customerFeature.selectError);
  protected readonly deletingId = this.store.selectSignal(customerFeature.selectDeletingId);

  // --- Local UI state ------------------------------------------------------
  // `signal(initial)` is the writable equivalent of `ref(initial)`. Update it
  // with `.set(value)` or `.update(fn)`, never by assignment.
  // Filter and sort are deliberately local, not in NgRx: no other page cares.
  protected readonly filter = signal('');
  /** id of the row whose "related quotes" check is in flight. */
  protected readonly checkingId = signal<string | null>(null);
  protected readonly deleteError = signal('');
  // Column ids, matched against `matColumnDef="..."` in the template.
  protected readonly columns = [
    'name',
    'email',
    'nationality',
    'cities',
    'universities',
    'actions',
  ];

  // `MatTableDataSource` is Material's helper that takes a plain array and
  // applies filtering, sorting and paging for the table. We feed it from the
  // store in the `effect()` below.
  protected readonly dataSource = new MatTableDataSource<Customer>();

  // `viewChild(Type)` is a signal-based template ref: like `ref="sort"` in Vue,
  // but looked up by directive type. It returns `undefined` until the element
  // exists, which matters because the table is inside an `@if`.
  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  constructor() {
    // Custom filter: search across the human-visible fields only. Ids are left
    // out on purpose so typing "c1" does not match a hidden database key.
    // `query` arrives already trimmed and lower-cased by `search()` below.
    this.dataSource.filterPredicate = (customer, query) =>
      [
        customer.firstName,
        customer.lastName,
        customer.email,
        customer.nationality ?? '',
        ...customer.addresses.flatMap((address) => [
          address.city,
          address.suburb,
          address.street,
          address.countryCode,
        ]),
        ...customer.universities.map((university) => university.name),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query);

    // Custom sort: tells the table which value to compare for each column,
    // since several columns are derived (full name, first address, first
    // university) rather than plain properties.
    this.dataSource.sortingDataAccessor = (customer, column) => {
      switch (column) {
        case 'name':
          return `${customer.lastName} ${customer.firstName}`.toLocaleLowerCase();
        case 'cities':
          return customer.addresses[0]?.city.toLocaleLowerCase() ?? '';
        case 'universities':
          return customer.universities[0]?.name.toLocaleLowerCase() ?? '';
        case 'nationality':
          return customer.nationality?.toLocaleLowerCase() ?? '';
        case 'email':
          return customer.email.toLocaleLowerCase();
        default:
          return '';
      }
    };

    // `effect()` is Angular's `watchEffect`: it runs once now and again whenever
    // a signal read inside it changes. We use three small effects, one per
    // dependency, so each re-runs only when its own signal changes.
    effect(() => {
      this.dataSource.data = this.customers();
    });
    // These two wire the sort header and paginator into the data source once
    // they appear in the DOM (after the `@if` around the table becomes true).
    effect(() => {
      this.dataSource.sort = this.sort() ?? null;
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
    });

    // Kick off the initial load. The `load` effect in customer.store.ts hears
    // this action, calls the API, and dispatches loadSucceeded/loadFailed.
    this.store.dispatch(customerActions.loadRequested());
  }

  // Template helper. Methods called from templates are fine in Angular but
  // re-run on every change-detection pass, so keep them cheap.
  protected universityNames(customer: Customer): string {
    return customer.universities.map((university) => university.name).join(', ') || '—';
  }

  // Bound to `(input)` on the search box. Angular does not have `v-model`
  // sugar for plain inputs outside of forms, so we read the value off the event.
  protected search(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.filter.set(query);
    // Normalise whitespace and case so the filterPredicate can do a simple `includes`.
    this.dataSource.filter = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    // A new search invalidates the current page number.
    this.dataSource.paginator?.firstPage();
  }

  // The template passes the `<input>` element itself (via `#searchInput`), so
  // we can clear it and return focus for keyboard users.
  protected clearFilter(input: HTMLInputElement): void {
    input.value = '';
    this.filter.set('');
    this.dataSource.filter = '';
    this.dataSource.paginator?.firstPage();
    input.focus();
  }

  protected retry(): void {
    this.store.dispatch(customerActions.loadRequested());
  }

  // Delete flow, in order:
  //   1. ask the API whether this customer has quotes,
  //   2. if not, open the confirm dialog,
  //   3. if the user confirms, dispatch `deleteRequested` (the NgRx effect then
  //      re-checks quotes and calls DELETE).
  //
  // Written as one RxJS chain because both steps are async and step 2 depends
  // on step 1. In Vue you would probably `await` two promises; here the
  // equivalent is `switchMap`.
  protected requestDelete(customer: Customer): void {
    // Guard against double clicks while a check or delete is already running.
    if (this.checkingId() || this.deletingId()) return;
    this.deleteError.set('');
    this.checkingId.set(customer.id);
    this.quotes
      .related(customer.id)
      .pipe(
        // HTTP observables complete on their own, but `take(1)` documents the
        // intent and protects against any source that might not.
        take(1),
        switchMap((response) => {
          if (hasRelatedQuotes(response)) {
            this.deleteError.set(
              `Cannot delete ${customer.firstName} ${customer.lastName}: delete related quotes first.`,
            );
            // `of(false)` = "continue the chain with the value false".
            return of(false);
          }
          // `afterClosed()` emits the value passed to `mat-dialog-close`:
          // `true` for Delete, `undefined` for Cancel/Escape/backdrop click.
          return this.dialog
            .open(ConfirmDelete, {
              data: { name: `${customer.firstName} ${customer.lastName}` },
              autoFocus: 'first-tabbable',
            })
            .afterClosed()
            .pipe(take(1));
        }),
        // Covers both a failed HTTP call and the `throw` inside hasRelatedQuotes.
        catchError(() => {
          this.deleteError.set('Could not check related quotes. Retry deletion.');
          return of(false);
        }),
        // Runs on completion OR error, like `finally`.
        finalize(() => this.checkingId.set(null)),
        // Auto-unsubscribes if the user leaves the page mid-flight. This is the
        // Angular way to avoid the "setState on unmounted component" class of bug.
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((confirmed: boolean) => {
        if (confirmed) this.store.dispatch(customerActions.deleteRequested({ id: customer.id }));
      });
  }
}
