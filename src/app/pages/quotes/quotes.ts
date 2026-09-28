import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from '@angular/material/autocomplete';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption } from '@angular/material/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSelect } from '@angular/material/select';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { take } from 'rxjs';
import { Customer } from '@app/pages/customers/data-access/customer.model';
import { ConfirmDelete } from '@app/shared/confirm-delete/confirm-delete';
import { Quote, isQuoteStatus, quoteStatuses } from '@app/pages/quotes/data-access/quote.model';
import { quoteActions, quoteFeature } from '@app/pages/quotes/data-access/quote.store';
import { PageToolbar } from '@app/shared/page-toolbar/page-toolbar';

// A quote plus the joined customer name, which is what the table displays and
// sorts on. The store keeps quotes and customers separate; this page joins them.
interface QuoteRow extends Quote {
  customerName: string;
}

// The `/quotes` list page: a Material table filtered by customer and status,
// sortable, paginated, with Edit/Delete per row.
//
// This file assumes you have read customers.ts, which explains the @Component
// decorator, `inject()`, `selectSignal`, `signal`, `viewChild` and
// `MatTableDataSource` for Vue developers. The comments here focus on what
// this page adds: URL-driven filters, joining two store collections, and
// keyboard focus management after a delete.
//
// `CurrencyPipe` and `DatePipe` are the `| currency` and `| date` used in the
// template. Pipes are Angular's Vue 2 filters; they must be listed in
// `imports` like any component or directive the template uses.
@Component({
  selector: 'app-quotes',
  imports: [
    CurrencyPipe,
    DatePipe,
    TitleCasePipe,
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatButton,
    MatIconButton,
    MatChip,
    MatChipSet,
    MatFormField,
    MatSuffix,
    MatIcon,
    MatInput,
    MatOption,
    MatPaginator,
    MatSelect,
    MatSort,
    MatSortHeader,
    MatTableModule,
    MatTooltip,
    PageToolbar,
    RouterLink,
  ],
  templateUrl: './quotes.html',
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: flex-start;
    }
    .filters > div {
      flex: 1 1 16rem;
      min-width: 0;
    }
    .filters mat-form-field {
      width: 100%;
    }
    .filters > .quote-id-filter,
    .filters > .status-filter {
      flex: 0 0 256px;
    }
    table {
      min-width: 700px;
      width: 100%;
    }
    .row-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .edit-button,
    .delete-button {
      min-width: 40px;
    }
    .edit-button {
      --mat-button-tonal-horizontal-padding: 8px;
      --mat-button-tonal-icon-spacing: 0px;
      --mat-button-tonal-icon-offset: 0px;
    }
    .delete-button {
      --mat-button-filled-container-color: #b91c1c;
      --mat-button-filled-label-text-color: #fff;
      --mat-button-filled-horizontal-padding: 8px;
      --mat-button-filled-icon-spacing: 0px;
      --mat-button-filled-icon-offset: 0px;
    }
    .status-chip {
      --mat-chip-elevated-container-color: var(--status-color);
      --mat-chip-outline-width: 0px;
      box-sizing: border-box;
      width: 100px;
      border: 1px solid;
      border-color: var(--status-color);
    }
    .status-chip.status-draft {
      --status-color: #6b7280;
      --mat-chip-label-text-color: #fff;
    }
    .status-chip.status-submitted {
      --status-color: #eab308;
      --mat-chip-label-text-color: #1f2937;
    }
    .status-chip.status-approved {
      --status-color: #15803d;
      --mat-chip-label-text-color: #fff;
    }
    .status-chip.status-declined {
      --status-color: #b91c1c;
      --mat-chip-label-text-color: #fff;
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
export class Quotes {
  private readonly store = inject(Store);
  // `Router` performs navigation; `ActivatedRoute` describes the current URL
  // (path params, query params). Vue: `useRouter()` and `useRoute()`.
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  // The stream of every dispatched action. Components rarely listen to it; here
  // it is used once, to move focus after a delete (see the constructor).
  private readonly actions$ = inject(Actions);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);
  private readonly toolbar = viewChild(PageToolbar);

  protected readonly statuses = quoteStatuses;
  // Column ids, matched against `matColumnDef="..."` in the template. Order
  // here is display order.
  protected readonly columns = ['id', 'customer', 'amount', 'status', 'createdAt', 'actions'];

  // --- Store state (read-only signals, always in sync with NgRx) -----------
  protected readonly quotes = this.store.selectSignal(quoteFeature.selectAll);
  protected readonly customers = this.store.selectSignal(quoteFeature.selectCustomers);
  protected readonly status = this.store.selectSignal(quoteFeature.selectLoadStatus);
  protected readonly customersStatus = this.store.selectSignal(quoteFeature.selectCustomersStatus);
  protected readonly error = this.store.selectSignal(quoteFeature.selectError);
  protected readonly customersError = this.store.selectSignal(quoteFeature.selectCustomersError);
  protected readonly deletingId = this.store.selectSignal(quoteFeature.selectDeletingId);

  // --- Local UI state ------------------------------------------------------
  // id of the row whose confirm dialog is open; null when none is.
  protected readonly dialogId = signal<string | null>(null);
  // The two filters, mirrored FROM the URL query string (see constructor). The
  // URL is the source of truth: filters survive a refresh, can be shared as a
  // link, and the Back button undoes a filter change. `filterCustomer()` and
  // `filterStatus()` below change the URL, never these signals directly.
  protected readonly customerId = signal<string | null>(null);
  protected readonly statusParam = signal<string | null>(null);
  // Free-text ID search stays local, like the Customers list search.
  protected readonly quoteIdSearch = signal('');

  // --- Derived state ---------------------------------------------------------
  // `computed()` behaves like Vue's: evaluated lazily and re-evaluated only when
  // a signal it read has changed. The selected customer object, if any.
  protected readonly customer = computed(() =>
    this.customers().find((c) => c.id === this.customerId()),
  );
  // Typing is local; changing the URL or loading its selected customer resets
  // the text to the selected name. Unconfirmed search never filters the table.
  protected readonly customerSearch = linkedSignal(() => this.customerName(this.customer()));
  protected readonly matchingCustomers = computed(() => {
    const search = this.customerSearch().trim().toLocaleLowerCase();
    const selectedName = this.customerName(this.customer()).toLocaleLowerCase();
    if (!search || search === selectedName) return this.customers().slice(0, 50);
    return this.customers()
      .filter((customer) => this.customerName(customer).toLocaleLowerCase().includes(search))
      .slice(0, 50);
  });
  // A `?customerId=` that matches no customer (typo, deleted customer). The
  // check waits for customers to be loaded, otherwise every page load would
  // briefly flash the "cannot be resolved" message.
  protected readonly invalidCustomer = computed(
    () => !!this.customerId() && this.customersStatus() === 'loaded' && !this.customer(),
  );
  protected readonly invalidStatus = computed(
    () => !!this.statusParam() && !isQuoteStatus(this.statusParam()),
  );
  // The table rows: quotes filtered by the URL, joined with customer names. In
  // Vue this join would also be a `computed`. Returning `[]` while references
  // are loading, or when a filter is invalid, is a deliberate "fail closed": a
  // bad customer id must never reveal every quote in the system.
  protected readonly rows = computed<QuoteRow[]>(() => {
    const id = this.customerId();
    const status = this.statusParam();
    const quoteId = this.quoteIdSearch().trim().toLocaleLowerCase();
    const customers = this.customers();
    if (this.customersStatus() !== 'loaded' || this.invalidCustomer() || this.invalidStatus())
      return [];
    return this.quotes()
      .filter(
        (quote) =>
          (!id || quote.customerId === id) &&
          (!status || quote.status === status) &&
          (!quoteId || quote.id.toLocaleLowerCase().includes(quoteId)),
      )
      .map((quote) => ({
        ...quote,
        customerName: (() => {
          const customer = customers.find((item) => item.id === quote.customerId);
          return customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown customer';
        })(),
      }));
  });
  // Material's table helper; not signal-based, so it is fed by the effects below.
  protected readonly dataSource = new MatTableDataSource<QuoteRow>();

  constructor() {
    // Tell the table which value to sort each column by. Without this it would
    // read `row[column]`, which does not exist for 'customer' and would sort
    // 'amount' on the raw cents (fine) but names case-sensitively (not fine).
    this.dataSource.sortingDataAccessor = (row, column) => {
      switch (column) {
        case 'customer':
          return row.customerName.toLocaleLowerCase();
        case 'amount':
          return row.amountInMinorUnits;
        case 'createdAt':
          return row.createdAt;
        case 'status':
          return row.status;
        case 'id':
          return row.id;
        default:
          return '';
      }
    };
    // `effect()` is Angular's `watchEffect`: it runs once, notes which signals
    // it read, and re-runs whenever one of them changes. This one pushes the
    // computed rows into the non-signal data source and jumps back to page 1,
    // so a new filter never leaves the user stranded on an empty page 3.
    effect(() => {
      this.dataSource.data = this.rows();
      this.dataSource.paginator?.firstPage();
    });
    // `sort()` and `paginator()` are `undefined` until the table renders (it is
    // inside an `@if`), so these effects re-run once the directives appear.
    effect(() => {
      this.dataSource.sort = this.sort() ?? null;
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
    });
    // Mirror the URL into the two filter signals. `queryParamMap` is an
    // Observable that emits on every query change; Vue: `watch(() => route.query)`.
    // `takeUntilDestroyed()` unsubscribes when the component is destroyed. With
    // no argument it must be called from the constructor, where Angular still
    // knows which component is being built.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.customerId.set(params.get('customerId'));
      this.statusParam.set(params.get('status'));
    });
    // Accessibility: after a row is deleted, the Delete button that had focus
    // no longer exists, and the browser would drop focus to <body>. Move it to
    // the heading instead. The <h1> has `tabindex="-1"` so it can receive
    // programmatic focus without joining the Tab order.
    this.actions$.pipe(ofType(quoteActions.deleteSucceeded), takeUntilDestroyed()).subscribe(() => {
      this.toolbar()?.focusHeading();
    });
    // Kick off both loads. The effects in quote.store.ts do the HTTP work and
    // dispatch the succeeded/failed actions the signals above react to.
    this.store.dispatch(quoteActions.loadRequested());
    this.store.dispatch(quoteActions.customersRequested());
  }

  // A filter change IS a URL change. `[]` with `relativeTo: this.route` means
  // "stay on the current route"; `queryParamsHandling: 'merge'` keeps the other
  // filter; a `null` value removes the key. The `queryParamMap` subscription
  // in the constructor then updates the signal.
  // Vue: `router.push({ query: { ...route.query, customerId: value } })`.
  protected filterCustomer(value: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { customerId: value || null },
      queryParamsHandling: 'merge',
    });
  }

  protected readonly displayCustomer = (value: Customer | string | null): string =>
    typeof value === 'string' ? value : this.customerName(value);

  private customerName(customer: Customer | null | undefined): string {
    return customer ? `${customer.firstName} ${customer.lastName}` : '';
  }

  protected searchCustomers(event: Event): void {
    this.customerSearch.set((event.target as HTMLInputElement).value);
  }

  protected selectCustomer(event: MatAutocompleteSelectedEvent): void {
    const value: unknown = event.option.value;
    if (!value || typeof value !== 'object' || !('id' in value)) return;
    const customer = this.customers().find((item) => item.id === value.id);
    if (!customer) return;
    this.customerSearch.set(this.customerName(customer));
    this.filterCustomer(customer.id);
  }

  protected clearCustomerFilter(event: MouseEvent, input: HTMLInputElement): void {
    event.stopPropagation();
    this.customerSearch.set('');
    this.filterCustomer(null);
    input.focus();
  }

  protected searchQuoteId(event: Event): void {
    this.quoteIdSearch.set((event.target as HTMLInputElement).value);
  }

  protected clearQuoteId(input: HTMLInputElement): void {
    input.value = '';
    this.quoteIdSearch.set('');
    input.focus();
  }

  protected filterStatus(value: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: value || null },
      queryParamsHandling: 'merge',
    });
  }

  // Only re-request what actually failed; the other list may be fine.
  protected retry(): void {
    if (this.status() === 'error') this.store.dispatch(quoteActions.loadRequested());
    if (this.customersStatus() === 'error') this.store.dispatch(quoteActions.customersRequested());
  }

  // Open the confirm dialog and dispatch `deleteRequested` only if the user
  // confirms. `afterClosed()` emits the value the dialog closed with: `true`
  // for Delete, `undefined` for Cancel, Escape or a backdrop click. Outside the
  // constructor `takeUntilDestroyed` needs `this.destroyRef` passed explicitly.
  protected requestDelete(row: QuoteRow): void {
    // Guard against a double click while a dialog or a DELETE is already open.
    if (this.deletingId() || this.dialogId()) return;
    this.dialogId.set(row.id);
    this.dialog
      .open(ConfirmDelete, {
        data: { name: `quote ${row.id} for ${row.customerName}` },
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed: boolean) => {
        this.dialogId.set(null);
        if (confirmed) this.store.dispatch(quoteActions.deleteRequested({ id: row.id }));
      });
  }
}
