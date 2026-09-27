import { inject } from '@angular/core';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {
  createActionGroup,
  createFeature,
  createReducer,
  createSelector,
  emptyProps,
  on,
  props,
} from '@ngrx/store';
import { Router } from '@angular/router';
import { catchError, exhaustMap, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { NotificationService } from '../../../shell/notification.service';
import { Customer, CustomerDraft } from './customer.model';
import {
  countQuotesByCustomer,
  CustomerQuotesApi,
  CustomersApi,
  hasRelatedQuotes,
  QuoteCounts,
} from './customers-api';

// ---------------------------------------------------------------------------
// NgRx in one paragraph, for Vue developers
// ---------------------------------------------------------------------------
// NgRx is Redux for Angular. If you have used Vuex it will feel familiar;
// if you have only used Pinia it is stricter. The pieces map like this:
//
//   NgRx action    -> the name + payload of a Vuex `commit`/`dispatch`
//   NgRx reducer   -> a Vuex mutation, but it must return a NEW state object
//                     instead of mutating `state` in place
//   NgRx selector  -> a Vuex/Pinia getter
//   NgRx effect    -> the async part of a Vuex/Pinia action (API calls,
//                     navigation, toasts). Effects listen for actions, do the
//                     side effect, then dispatch a new action with the result.
//
// The rule that keeps it predictable: components only ever `dispatch` actions
// and read selectors. They never call the API or change state directly.
// ---------------------------------------------------------------------------

// `createActionGroup` generates one action creator per event. The string key
// 'Load requested' becomes the camelCase function `customerActions.loadRequested()`
// and its `type` string becomes '[Customers] Load requested' (handy in devtools).
//
// `props<{...}>()` declares the payload type. `emptyProps()` means no payload.
// The "requested / succeeded / failed" triplet is the conventional way to
// model one async operation.
export const customerActions = createActionGroup({
  source: 'Customers',
  events: {
    'Load requested': emptyProps(),
    'Load succeeded': props<{ customers: Customer[] }>(),
    'Load failed': props<{ error: string }>(),
    // Per-customer quote counts for the list page's "Quotes" column. Loaded
    // separately from the customers so a quotes outage never hides the list.
    'Quote counts requested': emptyProps(),
    'Quote counts succeeded': props<{ counts: QuoteCounts }>(),
    'Quote counts failed': emptyProps(),
    'Get requested': props<{ id: string }>(),
    'Get succeeded': props<{ customer: Customer }>(),
    'Get failed': props<{ error: string }>(),
    // `originNavigationId` records which router navigation the form was on when
    // the user pressed Save. The `afterSave` effect uses it to avoid redirecting
    // a page the user has since left and come back to. See `afterSave` below.
    'Create requested': props<{ draft: CustomerDraft; originNavigationId: number | null }>(),
    'Create succeeded': props<{ customer: Customer; originNavigationId: number | null }>(),
    'Create failed': props<{ error: string }>(),
    'Update requested': props<{ customer: Customer; originNavigationId: number | null }>(),
    'Update succeeded': props<{ customer: Customer; originNavigationId: number | null }>(),
    'Update failed': props<{ error: string }>(),
    // The pre-delete "does this customer have quotes?" check. It is its own
    // little state machine so the list page can show "checking" and "blocked"
    // per row and so leaving the page can cancel it (`dismissed`).
    // `token` identifies the page instance that asked; the page ignores an
    // `allowed` result carrying someone else's token (see customers.ts).
    'Delete check requested': props<{ id: string; token: string }>(),
    'Delete check dismissed': emptyProps(),
    'Delete check allowed': props<{ id: string; token: string }>(),
    'Delete check blocked': props<{ id: string }>(),
    'Delete check failed': props<{ id: string; error: string }>(),
    'Delete requested': props<{ id: string }>(),
    'Delete succeeded': props<{ id: string }>(),
    'Delete failed': props<{ error: string }>(),
  },
});

// Shape of this feature's slice of the global store.
//
// `EntityState<Customer>` comes from @ngrx/entity and gives us a normalised
// collection: `{ ids: string[], entities: { [id]: Customer } }`. That makes
// "find by id" and "replace one" O(1) instead of scanning an array.
// The extra fields track UI status so templates can show spinners and errors.
type Status = 'idle' | 'loading' | 'loaded' | 'error';
interface CustomerState extends EntityState<Customer> {
  loadStatus: Status;
  saveStatus: 'idle' | 'saving' | 'error';
  /** id of the customer currently being deleted, so only that row's button disables. */
  deletingId: string | null;
  /** id of the customer whose "related quotes" check is in flight. */
  checkingId: string | null;
  /** id of the customer the last check refused to delete; the page links to its quotes. */
  blockedId: string | null;
  /** Quotes per customer id, or null while unknown (not loaded yet, or the request failed). */
  quoteCounts: QuoteCounts | null;
  error: string | null;
}

// The adapter provides ready-made immutable helpers (`setAll`, `upsertOne`,
// `removeOne`, ...) that return a new state object, which is exactly what a
// reducer must do. It uses `entity.id` as the key by default.
const adapter = createEntityAdapter<Customer>();
const initialState: CustomerState = adapter.getInitialState({
  loadStatus: 'idle',
  saveStatus: 'idle',
  deletingId: null,
  checkingId: null,
  blockedId: null,
  quoteCounts: null,
  error: null,
});

// `createFeature` bundles the reducer under the key 'customers' and, as a bonus,
// auto-generates a selector for every top-level state field:
// `customerFeature.selectLoadStatus`, `selectError`, `selectDeletingId`, etc.
// Components read those with `store.selectSignal(...)`.
export const customerFeature = createFeature({
  name: 'customers',
  reducer: createReducer(
    initialState,
    // Each `on(...)` is a pure function: (currentState, action) => nextState.
    // Never mutate `state`; spread it into a new object. Passing several
    // actions to one `on` handles them identically.
    on(customerActions.loadRequested, customerActions.getRequested, (state) => ({
      ...state,
      // `as const` keeps the literal type 'loading' instead of widening to `string`.
      loadStatus: 'loading' as const,
      error: null,
    })),
    // `setAll` replaces the whole collection with the freshly loaded list.
    on(customerActions.loadSucceeded, (state, { customers }) =>
      adapter.setAll(customers, { ...state, loadStatus: 'loaded', error: null }),
    ),
    // `upsertOne` inserts or updates a single record without touching the rest.
    on(customerActions.getSucceeded, (state, { customer }) =>
      adapter.upsertOne(customer, { ...state, loadStatus: 'loaded', error: null }),
    ),
    // Note we keep the existing `entities` on failure so a failed refresh does
    // not blank out rows the user can already see.
    on(customerActions.loadFailed, customerActions.getFailed, (state, { error }) => ({
      ...state,
      loadStatus: 'error' as const,
      error,
    })),
    // Counts only ever replace the previous snapshot; a failed refresh keeps
    // the old numbers on screen (same idea as `loadFailed` above).
    on(customerActions.quoteCountsSucceeded, (state, { counts }) => ({
      ...state,
      quoteCounts: counts,
    })),
    on(customerActions.createRequested, customerActions.updateRequested, (state) => ({
      ...state,
      saveStatus: 'saving' as const,
      error: null,
    })),
    on(customerActions.createSucceeded, customerActions.updateSucceeded, (state, { customer }) =>
      adapter.upsertOne(customer, { ...state, saveStatus: 'idle', error: null }),
    ),
    on(customerActions.createFailed, customerActions.updateFailed, (state, { error }) => ({
      ...state,
      saveStatus: 'error' as const,
      error,
    })),
    // Starting a new check clears any previous "blocked" message.
    on(customerActions.deleteCheckRequested, (state, { id }) => ({
      ...state,
      checkingId: id,
      blockedId: null,
      error: null,
    })),
    // Page left: forget everything about the check.
    on(customerActions.deleteCheckDismissed, (state) => ({
      ...state,
      checkingId: null,
      blockedId: null,
      error: null,
    })),
    // "Allowed" only clears the flag; the confirm dialog is UI, so the list
    // page opens it after hearing this action.
    on(customerActions.deleteCheckAllowed, (state) => ({ ...state, checkingId: null })),
    on(customerActions.deleteCheckBlocked, (state, { id }) => ({
      ...state,
      checkingId: null,
      blockedId: id,
      error: 'Delete related quotes first.',
    })),
    on(customerActions.deleteCheckFailed, (state, { error }) => ({
      ...state,
      checkingId: null,
      error,
    })),
    on(customerActions.deleteRequested, (state, { id }) => ({
      ...state,
      deletingId: id,
      error: null,
    })),
    on(customerActions.deleteSucceeded, (state, { id }) =>
      adapter.removeOne(id, { ...state, deletingId: null, error: null }),
    ),
    on(customerActions.deleteFailed, (state, { error }) => ({ ...state, deletingId: null, error })),
  ),
  // Add the adapter's collection selectors (`selectAll`, `selectEntities`,
  // `selectIds`, `selectTotal`) to the feature so callers get them from one place.
  extraSelectors: ({ selectCustomersState }) => ({
    ...adapter.getSelectors(selectCustomersState),
  }),
});

// A parameterised selector, like a Pinia getter that returns a function.
// `createSelector` memoises: it only recomputes when `selectEntities` changes.
export const selectCustomer = (id: string) =>
  createSelector(customerFeature.selectEntities, (entities) => entities[id]);

// Turn any thrown value into a user-facing string. We only pass through the one
// message we wrote ourselves; everything else (HTTP errors etc.) gets a generic
// message so raw server text never reaches the UI.
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'Could not verify related quotes.')
    return error.message;
  return 'Request failed. Check connection and retry.';
}

// ---------------------------------------------------------------------------
// Effects: where the async work lives
// ---------------------------------------------------------------------------
// Each effect is an RxJS pipeline that:
//   1. listens to the global stream of actions (`actions$`),
//   2. filters for the actions it cares about with `ofType`,
//   3. does a side effect (API call, navigation),
//   4. returns a new action, which NgRx dispatches for us.
//
// These are "functional effects": plain functions whose parameters default to
// `inject(...)`. That default-parameter trick is how they get their
// dependencies at runtime, while tests can pass fakes in directly
// (see customer.store.spec.ts, "Save navigation").
//
// Flattening operators you will see below, and why each one was chosen:
//   exhaustMap -> ignore new triggers while one is in flight (prevents double
//                 submits and duplicate loads).
//   switchMap  -> cancel the previous request and start a new one (right for
//                 "get by id": if the user navigates to a different id, the old
//                 response is no longer wanted).
//
// `catchError` MUST return an Observable (here `of(failedAction)`). If an
// error escaped, the whole effect stream would die and never fire again.
export const customerEffects = {
  load: createEffect(
    (actions$ = inject(Actions), api = inject(CustomersApi)) =>
      actions$.pipe(
        ofType(customerActions.loadRequested),
        exhaustMap(() =>
          api.list().pipe(
            map((customers) => customerActions.loadSucceeded({ customers })),
            catchError((error: unknown) =>
              of(customerActions.loadFailed({ error: errorMessage(error) })),
            ),
          ),
        ),
      ),
    { functional: true },
  ),
  // The "Quotes" column. `switchMap`: a newer request supersedes an older one,
  // so a stale response can never overwrite fresher counts.
  loadQuoteCounts: createEffect(
    (actions$ = inject(Actions), quotes = inject(CustomerQuotesApi)) =>
      actions$.pipe(
        ofType(customerActions.quoteCountsRequested),
        switchMap(() =>
          quotes.all().pipe(
            map((response) =>
              customerActions.quoteCountsSucceeded({ counts: countQuotesByCustomer(response) }),
            ),
            catchError(() => of(customerActions.quoteCountsFailed())),
          ),
        ),
      ),
    { functional: true },
  ),
  get: createEffect(
    (actions$ = inject(Actions), api = inject(CustomersApi)) =>
      actions$.pipe(
        ofType(customerActions.getRequested),
        switchMap(({ id }) =>
          api.get(id).pipe(
            map((customer) => customerActions.getSucceeded({ customer })),
            catchError((error: unknown) =>
              of(customerActions.getFailed({ error: errorMessage(error) })),
            ),
          ),
        ),
      ),
    { functional: true },
  ),
  // One effect handles both create and update because they share the
  // "saving" state and the same follow-up behaviour.
  save: createEffect(
    (actions$ = inject(Actions), api = inject(CustomersApi)) =>
      actions$.pipe(
        ofType(customerActions.createRequested, customerActions.updateRequested),
        exhaustMap((action) => {
          // `action` is a union of the two action types. Comparing `action.type`
          // narrows it, so TypeScript knows `action.draft` vs `action.customer`.
          const request =
            action.type === customerActions.createRequested.type
              ? api.create(action.draft).pipe(
                  map((customer) =>
                    customerActions.createSucceeded({
                      customer,
                      originNavigationId: action.originNavigationId,
                    }),
                  ),
                  catchError((error: unknown) =>
                    of(customerActions.createFailed({ error: errorMessage(error) })),
                  ),
                )
              : api.update(action.customer).pipe(
                  map((customer) =>
                    customerActions.updateSucceeded({
                      customer,
                      originNavigationId: action.originNavigationId,
                    }),
                  ),
                  catchError((error: unknown) =>
                    of(customerActions.updateFailed({ error: errorMessage(error) })),
                  ),
                );
          return request;
        }),
      ),
    { functional: true },
  ),
  // Step 1 of deleting: ask the API whether the customer has quotes, BEFORE
  // the confirm dialog is shown. Emits exactly one of allowed / blocked /
  // failed. `token` is passed straight through so the page can match the
  // result to the instance that asked for it.
  //
  // `takeUntil(... deleteCheckDismissed)` is the cancellation: when the page is
  // destroyed it dispatches `dismissed`, the inner Observable completes, and
  // because it is an `HttpClient` Observable the HTTP request itself is
  // aborted. Nothing is emitted afterwards, not even `failed`.
  checkDelete: createEffect(
    (actions$ = inject(Actions), quotes = inject(CustomerQuotesApi)) =>
      actions$.pipe(
        ofType(customerActions.deleteCheckRequested),
        exhaustMap(({ id, token }) =>
          quotes.related(id).pipe(
            map((response) =>
              hasRelatedQuotes(response)
                ? customerActions.deleteCheckBlocked({ id })
                : customerActions.deleteCheckAllowed({ id, token }),
            ),
            catchError(() =>
              of(
                customerActions.deleteCheckFailed({
                  id,
                  error: 'Could not check related quotes. Retry deletion.',
                }),
              ),
            ),
            takeUntil(actions$.pipe(ofType(customerActions.deleteCheckDismissed))),
          ),
        ),
      ),
    { functional: true },
  ),
  // Step 3: the user confirmed. Re-check for quotes and only then call DELETE.
  // `checkDelete` already ran before the dialog; re-checking here narrows the
  // window in which a quote could have been added in between. A real backend
  // must enforce this server-side; the frontend cannot close the race fully.
  delete: createEffect(
    (actions$ = inject(Actions), api = inject(CustomersApi), quotes = inject(CustomerQuotesApi)) =>
      actions$.pipe(
        ofType(customerActions.deleteRequested),
        exhaustMap(({ id }) =>
          quotes.related(id).pipe(
            map(hasRelatedQuotes),
            // Inner `switchMap` chains the second HTTP call after the first.
            // Throwing inside an operator routes the error to `catchError` below.
            switchMap((hasQuotes) => {
              if (hasQuotes) throw new Error('Customer has quotes. Delete quotes first.');
              return api.delete(id);
            }),
            map(() => customerActions.deleteSucceeded({ id })),
            catchError((error: unknown) =>
              of(
                customerActions.deleteFailed({
                  error:
                    error instanceof Error &&
                    error.message === 'Customer has quotes. Delete quotes first.'
                      ? error.message
                      : errorMessage(error),
                }),
              ),
            ),
          ),
        ),
      ),
    { functional: true },
  ),
  // `dispatch: false` tells NgRx this effect does not emit a new action; it is
  // a fire-and-forget side effect (toast + navigation). `tap` runs code without
  // changing the stream's values.
  afterSave: createEffect(
    (
      actions$ = inject(Actions),
      router = inject(Router),
      notification = inject(NotificationService),
    ) =>
      actions$.pipe(
        ofType(customerActions.createSucceeded, customerActions.updateSucceeded),
        tap((action) => {
          notification.announce('Customer saved.');
          // Strip query string and hash so we compare paths only.
          const path = router.url.split(/[?#]/, 1)[0];
          // Only redirect if the user is still on the form page that triggered
          // the save. Saves are async, so by the time the response arrives they
          // may already have navigated somewhere else.
          const matchingPage =
            action.type === customerActions.createSucceeded.type
              ? path === '/customers/new'
              : path === `/customers/${encodeURIComponent(action.customer.id)}/edit`;
          // Second guard: the path could match again if the user left the form
          // and re-opened the same one before a slow save finished. Comparing
          // navigation ids (a counter the router increments on every navigation)
          // makes sure we only close the exact page instance that submitted.
          if (
            matchingPage &&
            action.originNavigationId !== null &&
            action.originNavigationId === router.lastSuccessfulNavigation()?.id
          ) {
            // `router.navigate` returns a Promise. `void` marks it as
            // intentionally not awaited so lint does not complain.
            void router.navigate(['/customers']);
          }
        }),
      ),
    { functional: true, dispatch: false },
  ),
  afterDelete: createEffect(
    (actions$ = inject(Actions), notification = inject(NotificationService)) =>
      actions$.pipe(
        ofType(customerActions.deleteSucceeded),
        tap(() => notification.announce('Customer deleted.')),
      ),
    { functional: true, dispatch: false },
  ),
};
