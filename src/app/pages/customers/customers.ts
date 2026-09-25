import { Component, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { Actions, ofType } from '@ngrx/effects';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { customerActions, customerFeature } from './data-access/customer.store';
import { Customer } from './data-access/customer.model';
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
  // The stream of every dispatched action (see the subscription in the
  // constructor). Listening to it from a component is unusual; it is done
  // here because opening a dialog is UI work, which belongs to the component,
  // while the "may this customer be deleted?" check now lives in an effect.
  private readonly actions$ = inject(Actions);
  // A random id for THIS page instance. It travels with `deleteCheckRequested`
  // and comes back on `deleteCheckAllowed`, so a result that belongs to an
  // earlier instance of this page (user left and came back quickly) is ignored
  // instead of popping a dialog on the new one.
  private readonly deleteCheckToken = crypto.randomUUID();
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
  // The three "something is happening to a row" markers. The first two live in
  // the store because the check runs in an effect; the third is local because
  // the dialog is opened by this component.
  /** id of the row whose "related quotes" check is in flight. */
  protected readonly checkingId = this.store.selectSignal(customerFeature.selectCheckingId);
  /** id of the row that cannot be deleted because it has quotes; drives the alert + link. */
  protected readonly blockedId = this.store.selectSignal(customerFeature.selectBlockedId);
  /** id of the row whose confirm dialog is open. */
  protected readonly dialogId = signal<string | null>(null);
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
    // Cancel any pending dependency check when this page is left. Old results
    // must not lock a new page instance or show stale feedback. The
    // `checkDelete` effect listens for this action with `takeUntil` and drops
    // the HTTP request; the reducer clears `checkingId` and `blockedId`.
    // `onDestroy` is the Angular equivalent of `onUnmounted`.
    this.destroyRef.onDestroy(() => this.store.dispatch(customerActions.deleteCheckDismissed()));
    // Custom filter: search across the human-visible fields only. Ids are left
    // out on purpose so typing "c1" does not match a hidden database key.
    // `query` arrives already trimmed and lower-cased by `search()` below.
    this.dataSource.filterPredicate = (customer, query) =>
      [
        customer.firstName,
        customer.lastName,
        customer.email,
        customer.nationality?.name ?? '',
        ...customer.addresses.flatMap((address) => [address.city, address.suburb, address.street]),
        customer.universities[0]?.name ?? '',
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
          return customer.nationality?.name.toLocaleLowerCase() ?? '';
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

    // Step 2 of the delete flow (step 1 is `requestDelete` below): the
    // `checkDelete` effect found no related quotes and dispatched
    // `deleteCheckAllowed`, so open the confirm dialog. `ofType` filters the
    // action stream down to that one action; `takeUntilDestroyed` unsubscribes
    // when the page is destroyed.
    this.actions$
      .pipe(ofType(customerActions.deleteCheckAllowed), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ id, token }) => {
        // Effects can finish after this page was left and re-opened. Only act
        // on a result that this page instance asked for.
        if (token !== this.deleteCheckToken) return;
        const customer = this.customers().find((row) => row.id === id);
        if (!customer) return;
        this.dialogId.set(id);
        this.dialog
          .open(ConfirmDelete, {
            data: { name: `${customer.firstName} ${customer.lastName}` },
            autoFocus: 'first-tabbable',
          })
          .afterClosed()
          .pipe(take(1), takeUntilDestroyed(this.destroyRef))
          .subscribe((confirmed: boolean) => {
            this.dialogId.set(null);
            // Step 3: the `delete` effect re-checks quotes and calls DELETE.
            if (confirmed) this.store.dispatch(customerActions.deleteRequested({ id }));
          });
      });
    // Kick off the initial load. The `load` effect in customer.store.ts hears
    // this action, calls the API, and dispatches loadSucceeded/loadFailed.
    this.store.dispatch(customerActions.loadRequested());
  }

  // Template helper. Methods called from templates are fine in Angular but
  // re-run on every change-detection pass, so keep them cheap.
  protected universityName(customer: Customer): string {
    return customer.universities[0]?.name || '—';
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
  //   1. here: dispatch `deleteCheckRequested`; the `checkDelete` effect asks
  //      the API whether this customer has quotes,
  //   2. constructor: on `deleteCheckAllowed`, open the confirm dialog
  //      (on `deleteCheckBlocked`, the template shows the alert via `blockedId`),
  //   3. if the user confirms, dispatch `deleteRequested`; the `delete` effect
  //      re-checks quotes and calls DELETE.
  //
  // An earlier version ran step 1 as an RxJS chain inside this method. Moving
  // it into NgRx means the request is cancelled when the page is left, and the
  // "checking" and "blocked" state is visible in devtools like everything else.
  protected requestDelete(customer: Customer): void {
    // Guard against double clicks while a check, dialog or delete is running.
    if (this.checkingId() || this.deletingId() || this.dialogId()) return;
    this.store.dispatch(
      customerActions.deleteCheckRequested({ id: customer.id, token: this.deleteCheckToken }),
    );
  }
}
