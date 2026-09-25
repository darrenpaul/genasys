// NgRx state for the Quotes feature: actions, reducer, selectors and effects
// in one file. If NgRx is new to you, read the "NgRx in one paragraph" note at
// the top of customers/data-access/customer.store.ts first. This file follows
// the same layout and comments mainly on what is new here.
//
// The shape of one operation (loading the list), start to finish:
//
//   component  --dispatch(loadRequested)-->   reducer sets loadStatus 'loading'
//   effect     hears loadRequested, calls api.list()
//   effect     --dispatch(loadSucceeded)-->   reducer stores the quotes
//   component  re-renders because its selectSignal() values changed
//
// A component never calls the API or changes state directly. It dispatches
// and reads. That single rule is what makes the flow easy to trace.
import { inject } from '@angular/core';
import { Router } from '@angular/router';
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
import { catchError, exhaustMap, map, of, switchMap, tap } from 'rxjs';
import { Customer } from '../../customers/data-access/customer.model';
import { NotificationService } from '../../../shell/notification.service';
import { Quote, QuoteDraft, QuoteStatus } from './quote.model';
import { QuoteCustomersApi, QuotesApi } from './quotes-api';

// One action creator per event: 'Load requested' becomes
// `quoteActions.loadRequested()` with the type string '[Quotes] Load requested'
// (visible in Redux DevTools). The requested / succeeded / failed triplet
// models one async operation; the reducer and effects below pick them apart.
export const quoteActions = createActionGroup({
  source: 'Quotes',
  events: {
    'Load requested': emptyProps(),
    'Load succeeded': props<{ quotes: Quote[] }>(),
    'Load failed': props<{ error: string }>(),
    // The quotes pages load their own copy of the customers list (names for
    // the table, options for the form) so they work even if the customers
    // feature has never been visited.
    'Customers requested': emptyProps(),
    'Customers succeeded': props<{ customers: Customer[] }>(),
    'Customers failed': props<{ error: string }>(),
    // "Get" fetches ONE quote, for the edit page when it is opened directly by
    // URL and the list was never loaded. `id` is echoed back on failure so the
    // reducer can tell a stale failure from the current one.
    'Get requested': props<{ id: string }>(),
    'Get succeeded': props<{ quote: Quote }>(),
    'Get failed': props<{ id: string; error: string }>(),
    // Sent when the form switches to "new" mode, so an in-flight get is ignored.
    'Get dismissed': emptyProps(),
    // Create/update carry three extra values that have nothing to do with the
    // quote itself. They exist so the `afterSave` effect can send the user
    // back to the SAME filtered list they came from:
    //
    //   customerId / statusFilter  the list filters at the time "Add quote"
    //                              or "Edit" was clicked (from the URL)
    //   originNavigationId         which router navigation the form was on
    //                              when Save was pressed; a late response
    //                              must never redirect a page the user has
    //                              since left. See `afterSave` below.
    'Create requested': props<{
      draft: QuoteDraft;
      customerId: string | null;
      statusFilter: QuoteStatus | null;
      originNavigationId: number | null;
    }>(),
    'Create succeeded': props<{
      quote: Quote;
      customerId: string | null;
      statusFilter: QuoteStatus | null;
      originNavigationId: number | null;
    }>(),
    'Create failed': props<{ error: string }>(),
    'Update requested': props<{
      quote: Quote;
      customerId: string | null;
      statusFilter: QuoteStatus | null;
      originNavigationId: number | null;
    }>(),
    'Update succeeded': props<{
      quote: Quote;
      customerId: string | null;
      statusFilter: QuoteStatus | null;
      originNavigationId: number | null;
    }>(),
    'Update failed': props<{ error: string }>(),
    'Delete requested': props<{ id: string }>(),
    'Delete succeeded': props<{ id: string }>(),
    'Delete failed': props<{ error: string }>(),
  },
});

// Request lifecycle for the list load and the single-quote get, which share
// `loadStatus` because both populate the same collection.
type Status = 'idle' | 'loading' | 'loaded' | 'error';

// `EntityState<Quote>` comes from @ngrx/entity and gives the slice a
// normalised shape: `{ ids: string[], entities: { [id]: Quote } }`. Lookup by
// id is a property access instead of `array.find`, and updating one quote
// never needs `findIndex` + splice. Think of a Pinia store that keeps a
// `Map<id, Quote>` plus an ordered list of keys.
interface QuoteState extends EntityState<Quote> {
  loadStatus: Status;
  // id of the quote the edit form asked for with `getRequested`. Responses for
  // any other id are ignored by the reducer: the user may have navigated to a
  // different quote, or back to "new", while the request was in flight.
  activeGetId: string | null;
  customersStatus: Status;
  customers: Customer[];
  customersError: string | null;
  saveStatus: 'idle' | 'saving' | 'error';
  /** id of the quote whose DELETE is in flight. The list disables Delete buttons while set. */
  deletingId: string | null;
  error: string | null;
}
// The adapter supplies `setAll`, `upsertOne`, `removeOne` and friends. Each
// returns a NEW state object; nothing is mutated in place. NgRx, like Vuex in
// strict mode, depends on that to detect changes cheaply by reference.
const adapter = createEntityAdapter<Quote>();
const initialState: QuoteState = adapter.getInitialState({
  loadStatus: 'idle',
  activeGetId: null,
  customersStatus: 'idle',
  customers: [],
  customersError: null,
  saveStatus: 'idle',
  deletingId: null,
  error: null,
});

// `createFeature` bundles the reducer with auto-generated selectors: one
// `selectXxx` per top-level state key (`selectLoadStatus`, `selectCustomers`,
// `selectError`, ...) plus `selectQuotesState` for the whole slice. Components
// read them through `store.selectSignal(quoteFeature.selectXxx)`.
export const quoteFeature = createFeature({
  name: 'quotes',
  // `on(action, handler)` is the "case" for that action, like a Vuex mutation.
  // Every handler returns a fresh object; `...state` copies what is unchanged.
  // The `'loading' as const` casts stop TypeScript widening the literal to
  // `string`, which would not satisfy the `Status` union.
  reducer: createReducer(
    initialState,
    on(quoteActions.loadRequested, (state) => ({
      ...state,
      loadStatus: 'loading' as const,
      activeGetId: null,
      error: null,
    })),
    on(quoteActions.getRequested, (state, { id }) => ({
      ...state,
      loadStatus: 'loading' as const,
      activeGetId: id,
      error: null,
    })),
    // The form dispatches this when it switches to "new" mode, so a get that is
    // still running cannot later flip the create page into an error state.
    on(quoteActions.getDismissed, (state) => ({
      ...state,
      activeGetId: null,
      loadStatus: 'idle' as const,
      error: null,
    })),
    // `setAll` replaces the whole collection with the server's list.
    on(quoteActions.loadSucceeded, (state, { quotes }) =>
      adapter.setAll(quotes, { ...state, loadStatus: 'loaded', error: null }),
    ),
    // Only accept the quote we are still waiting for. `upsertOne` inserts it or
    // replaces the existing entry with the same id. Returning `state` unchanged
    // (same reference) tells NgRx nothing happened, so nothing re-renders.
    on(quoteActions.getSucceeded, (state, { quote }) =>
      state.activeGetId === quote.id
        ? adapter.upsertOne(quote, {
            ...state,
            activeGetId: null,
            loadStatus: 'loaded',
            error: null,
          })
        : state,
    ),
    on(quoteActions.loadFailed, (state, { error }) => ({
      ...state,
      loadStatus: 'error' as const,
      error,
    })),
    // Same guard as `getSucceeded`: a failure for a quote we no longer care
    // about is dropped.
    on(quoteActions.getFailed, (state, { id, error }) =>
      state.activeGetId === id
        ? { ...state, activeGetId: null, loadStatus: 'error' as const, error }
        : state,
    ),
    on(quoteActions.customersRequested, (state) => ({
      ...state,
      customersStatus: 'loading' as const,
      customersError: null,
    })),
    on(quoteActions.customersSucceeded, (state, { customers }) => ({
      ...state,
      customers,
      customersStatus: 'loaded' as const,
      customersError: null,
    })),
    on(quoteActions.customersFailed, (state, { error }) => ({
      ...state,
      customersStatus: 'error' as const,
      customersError: error,
    })),
    // `on()` accepts several actions when they share a handler. To the reducer,
    // create and update are the same thing: something is being saved.
    on(quoteActions.createRequested, quoteActions.updateRequested, (state) => ({
      ...state,
      saveStatus: 'saving' as const,
      error: null,
    })),
    on(quoteActions.createSucceeded, quoteActions.updateSucceeded, (state, { quote }) =>
      adapter.upsertOne(quote, { ...state, saveStatus: 'idle', error: null }),
    ),
    on(quoteActions.createFailed, quoteActions.updateFailed, (state, { error }) => ({
      ...state,
      saveStatus: 'error' as const,
      error,
    })),
    // Delete is deliberately NOT optimistic. The row stays until the API
    // confirms, so a failed DELETE never hides a quote that still exists.
    on(quoteActions.deleteRequested, (state, { id }) => ({
      ...state,
      deletingId: id,
      error: null,
    })),
    on(quoteActions.deleteSucceeded, (state, { id }) =>
      adapter.removeOne(id, { ...state, deletingId: null, error: null }),
    ),
    on(quoteActions.deleteFailed, (state, { error }) => ({ ...state, deletingId: null, error })),
  ),
  // Adds the adapter's `selectAll`, `selectEntities`, `selectIds` and
  // `selectTotal`, scoped to this slice, alongside the generated ones.
  extraSelectors: ({ selectQuotesState }) => ({ ...adapter.getSelectors(selectQuotesState) }),
});

// A selector factory: `selectQuote('q1')` returns a selector for that single
// quote, or `undefined` if it is not loaded. `createSelector` memoises, so the
// same input state yields the same output without recomputing, much like a
// cached `computed()` with an argument.
export const selectQuote = (id: string) =>
  createSelector(quoteFeature.selectEntities, (entities) => entities[id]);

// One place for the generic failure text so every effect reports the same thing.
const requestError = () => 'Request failed. Check connection and retry.';

// ---------------------------------------------------------------------------
// Effects: where the side effects live
// ---------------------------------------------------------------------------
// Each effect is an RxJS pipeline that listens to the stream of ALL dispatched
// actions (`actions$`), keeps the ones it cares about (`ofType`), does the
// async work, and emits a new action that NgRx dispatches for you.
//
// These are "functional" effects: plain functions whose dependencies arrive as
// default parameters (`api = inject(QuotesApi)`). Two benefits: no class
// boilerplate, and a test can call `quoteEffects.save(fakeActions, fakeApi)`
// directly with hand-made fakes (see quote.store.spec.ts).
//
// Two RxJS operators decide what happens when a second action arrives while
// the previous request is still running:
//
//   exhaustMap   ignore the new one until the current request finishes. Right
//                for "load list" and "save": a double click must not double
//                post.
//   switchMap    cancel the current request, start the new one. Right for
//                "get this quote": if the user moved on, the old response is
//                useless and its HTTP call is cancelled for free.
//
// `catchError` must sit INSIDE the inner pipe, on the API call. If it were on
// the outer `actions$` pipe, the first error would complete the whole effect
// and it would never react to another action for the rest of the session.
export const quoteEffects = {
  load: createEffect(
    (actions$ = inject(Actions), api = inject(QuotesApi)) =>
      actions$.pipe(
        ofType(quoteActions.loadRequested),
        exhaustMap(() =>
          api.list().pipe(
            map((quotes) => quoteActions.loadSucceeded({ quotes })),
            // `of(action)` wraps the failure action in an Observable, because
            // `catchError` must return an Observable to continue the stream.
            catchError(() => of(quoteActions.loadFailed({ error: requestError() }))),
          ),
        ),
      ),
    { functional: true },
  ),
  customers: createEffect(
    (actions$ = inject(Actions), api = inject(QuoteCustomersApi)) =>
      actions$.pipe(
        ofType(quoteActions.customersRequested),
        exhaustMap(() =>
          api.list().pipe(
            map((customers) => quoteActions.customersSucceeded({ customers })),
            catchError(() => of(quoteActions.customersFailed({ error: requestError() }))),
          ),
        ),
      ),
    { functional: true },
  ),
  // `switchMap` here: navigating from /quotes/q1/edit to /quotes/q2/edit while
  // q1 is loading cancels the q1 request outright.
  get: createEffect(
    (actions$ = inject(Actions), api = inject(QuotesApi)) =>
      actions$.pipe(
        ofType(quoteActions.getRequested),
        switchMap(({ id }) =>
          api.get(id).pipe(
            map((quote) => quoteActions.getSucceeded({ quote })),
            catchError(() =>
              of(quoteActions.getFailed({ id, error: 'Quote not found or unavailable.' })),
            ),
          ),
        ),
      ),
    { functional: true },
  ),
  // One effect handles both create and update because they share the "saving"
  // state and the same follow-up (`afterSave`).
  save: createEffect(
    (actions$ = inject(Actions), api = inject(QuotesApi)) =>
      actions$.pipe(
        ofType(quoteActions.createRequested, quoteActions.updateRequested),
        exhaustMap((action) => {
          // `action` is a union of the two action types. Comparing `action.type`
          // narrows it, so TypeScript knows whether `action.draft` or
          // `action.quote` exists in each branch. The three routing values are
          // passed straight through to the succeeded action for `afterSave`.
          return action.type === quoteActions.createRequested.type
            ? api.create(action.draft).pipe(
                map((quote) =>
                  quoteActions.createSucceeded({
                    quote,
                    customerId: action.customerId,
                    statusFilter: action.statusFilter,
                    originNavigationId: action.originNavigationId,
                  }),
                ),
                catchError(() => of(quoteActions.createFailed({ error: requestError() }))),
              )
            : api.update(action.quote).pipe(
                map((quote) =>
                  quoteActions.updateSucceeded({
                    quote,
                    customerId: action.customerId,
                    statusFilter: action.statusFilter,
                    originNavigationId: action.originNavigationId,
                  }),
                ),
                catchError(() => of(quoteActions.updateFailed({ error: requestError() }))),
              );
        }),
      ),
    { functional: true },
  ),
  delete: createEffect(
    (actions$ = inject(Actions), api = inject(QuotesApi)) =>
      actions$.pipe(
        ofType(quoteActions.deleteRequested),
        exhaustMap(({ id }) =>
          api.delete(id).pipe(
            map(() => quoteActions.deleteSucceeded({ id })),
            catchError(() => of(quoteActions.deleteFailed({ error: requestError() }))),
          ),
        ),
      ),
    { functional: true },
  ),
  // Runs after a successful save: announce it to screen readers, then return to
  // the list. `dispatch: false` tells NgRx this effect emits nothing to
  // dispatch, so `tap` (run a side effect, pass the value through) is enough.
  //
  // The redirect is guarded twice so the user is never yanked somewhere they
  // did not ask to go:
  //
  //   1. `matchingPage`: the URL still shows the form that did the saving.
  //   2. `originNavigationId`: no navigation happened since Save was pressed.
  //      `router.lastSuccessfulNavigation()` is a signal, hence the parens.
  //
  // If either check fails the save is still recorded and announced; only the
  // redirect is skipped. `router.url` includes the query string, so it is cut
  // at the first `?` or `#` before comparing paths.
  afterSave: createEffect(
    (
      actions$ = inject(Actions),
      router = inject(Router),
      notifications = inject(NotificationService),
    ) =>
      actions$.pipe(
        ofType(quoteActions.createSucceeded, quoteActions.updateSucceeded),
        tap((action) => {
          notifications.announce('Quote saved.');
          const path = router.url.split(/[?#]/, 1)[0];
          const matchingPage =
            action.type === quoteActions.createSucceeded.type
              ? path === '/quotes/new'
              : path === `/quotes/${encodeURIComponent(action.quote.id)}/edit`;
          if (
            matchingPage &&
            action.originNavigationId !== null &&
            action.originNavigationId === router.lastSuccessfulNavigation()?.id
          ) {
            // Rebuild the list's query string from the filters the form was
            // opened with, omitting keys that were not set. Vue equivalent:
            // `router.push({ path: '/quotes', query })`.
            void router.navigate(['/quotes'], {
              queryParams: {
                ...(action.customerId ? { customerId: action.customerId } : {}),
                ...(action.statusFilter ? { status: action.statusFilter } : {}),
              },
            });
          }
        }),
      ),
    { functional: true, dispatch: false },
  ),
  afterDelete: createEffect(
    (actions$ = inject(Actions), notifications = inject(NotificationService)) =>
      actions$.pipe(
        ofType(quoteActions.deleteSucceeded),
        tap(() => notifications.announce('Quote deleted.')),
      ),
    { functional: true, dispatch: false },
  ),
};
