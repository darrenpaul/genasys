// Unit tests for the quotes store, plus the customer delete-check effect that
// this change added. No TestBed, no DOM: everything here is tested as plain
// functions, which is one of the nicer consequences of NgRx's strictness.
//
// Two techniques, both worth copying:
//
//   Reducers are pure functions, so `quoteFeature.reducer(state, action)` is
//   just a call. Passing `undefined` as the state returns the initial state,
//   like calling a Vuex mutation on a fresh store.
//
//   Functional effects are also just functions. Instead of `inject()` filling
//   the parameters, the test passes its own: a `Subject` wrapped in `Actions`
//   to play the action stream, and an object literal with `vi.fn()` (Vitest's
//   `jest.fn()`) standing in for the API. Pushing an action with
//   `actions.next(...)` then synchronously produces the effect's output.
import { Actions } from '@ngrx/effects';
import { Router } from '@angular/router';
import { NotificationService } from '../../../shell/notification.service';
import { of, Subject } from 'rxjs';
import { CustomerQuotesApi } from '../../customers/data-access/customers-api';
import {
  customerActions,
  customerEffects,
  customerFeature,
} from '../../customers/data-access/customer.store';
import { Quote, parseEuroCents, formatEuroInput } from './quote.model';
import { quoteActions, quoteEffects, quoteFeature } from './quote.store';
import { QuotesApi } from './quotes-api';

const quote: Quote = {
  id: 'q1',
  customerId: 'c1',
  amountInMinorUnits: 1001,
  status: 'draft',
  createdAt: '2025-04-01T12:00:00.000Z',
};

describe('Quote operations', () => {
  it('parses exact euro cents and rejects invalid amounts', () => {
    expect(parseEuroCents('10.01')).toBe(1001);
    expect(parseEuroCents('0.10')).toBe(10);
    expect(parseEuroCents('10.001')).toBeNull();
    expect(parseEuroCents('0.00')).toBeNull();
    expect(parseEuroCents('10000000')).toBeNull();
    expect(formatEuroInput(1001)).toBe('10.01');
  });

  it('updates list only after successful mutations and retains row after failed delete', () => {
    const reduce = quoteFeature.reducer;
    const initial = reduce(undefined, { type: 'init' });
    const created = reduce(
      initial,
      quoteActions.createSucceeded({
        quote,
        customerId: null,
        statusFilter: null,
        originNavigationId: 1,
      }),
    );
    const edited = { ...quote, amountInMinorUnits: 999 };
    const updated = reduce(
      created,
      quoteActions.updateSucceeded({
        quote: edited,
        customerId: null,
        statusFilter: null,
        originNavigationId: 1,
      }),
    );
    expect(created.entities['q1']?.amountInMinorUnits).toBe(1001);
    expect(updated.entities['q1']?.amountInMinorUnits).toBe(999);
    const failed = reduce(
      reduce(updated, quoteActions.deleteRequested({ id: 'q1' })),
      quoteActions.deleteFailed({ error: 'Offline' }),
    );
    expect(failed.entities['q1']).toEqual(edited);
    expect(failed.deletingId).toBeNull();
    expect(reduce(failed, quoteActions.deleteSucceeded({ id: 'q1' })).ids).toEqual([]);
  });

  // Scenario: user opens /quotes/q1/edit, the GET is slow, they click "Add
  // quote". The failure for q1 must not show on the create page.
  it('ignores late edit failure after moving to create mode', () => {
    const reduce = quoteFeature.reducer;
    const loading = reduce(undefined, quoteActions.getRequested({ id: 'q1' }));
    const createPage = reduce(loading, quoteActions.getDismissed());
    const late = reduce(
      createPage,
      quoteActions.getFailed({ id: 'q1', error: 'Quote not found or unavailable.' }),
    );
    expect(late.error).toBeNull();
    expect(late.loadStatus).toBe('idle');
  });

  // `afterSave` has `dispatch: false`, so nothing comes out of it; the
  // assertion is on the fake router's `navigate` spy instead. The fake only
  // implements the three Router members the effect touches; `as unknown as
  // Router` tells TypeScript to accept that.
  it('returns to original status filter after save', () => {
    const actions = new Subject<ReturnType<typeof quoteActions.createSucceeded>>();
    const router = {
      url: '/quotes/new?status=approved',
      lastSuccessfulNavigation: () => ({ id: 4 }),
      navigate: vi.fn(),
    } as unknown as Router;
    const notifications = { announce: vi.fn() } as unknown as NotificationService;
    const subscription = quoteEffects
      .afterSave(new Actions(actions), router, notifications)
      .subscribe();
    actions.next(
      quoteActions.createSucceeded({
        quote,
        customerId: null,
        statusFilter: 'approved',
        originNavigationId: 4,
      }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/quotes'], {
      queryParams: { status: 'approved' },
    });
    subscription.unsubscribe();
  });

  it('sends euro cents and immutable createdAt to API during edit', () => {
    const actions = new Subject<ReturnType<typeof quoteActions.updateRequested>>();
    const update = vi.fn(() => of({ ...quote, amountInMinorUnits: 1500 }));
    const api = { update } as unknown as QuotesApi;
    const results: unknown[] = [];
    const subscription = quoteEffects
      .save(new Actions(actions), api)
      .subscribe((result) => results.push(result));
    actions.next(
      quoteActions.updateRequested({
        quote: { ...quote, amountInMinorUnits: 1500 },
        customerId: 'c1',
        statusFilter: null,
        originNavigationId: 1,
      }),
    );
    expect(update).toHaveBeenCalledWith({ ...quote, amountInMinorUnits: 1500 });
    expect(results).toEqual([
      quoteActions.updateSucceeded({
        quote: { ...quote, amountInMinorUnits: 1500 },
        customerId: 'c1',
        statusFilter: null,
        originNavigationId: 1,
      }),
    ]);
    subscription.unsubscribe();
  });
});

describe('Customer delete check in NgRx', () => {
  // The API reply is a `Subject` so the test controls WHEN it answers. The
  // dismiss action is pushed before the reply, and `results` staying empty
  // proves `takeUntil` dropped the response.
  it('cancels pending check and unlocks delete when page is left', () => {
    const actions = new Subject<
      | ReturnType<typeof customerActions.deleteCheckRequested>
      | ReturnType<typeof customerActions.deleteCheckDismissed>
    >();
    const reply = new Subject<unknown>();
    const api = { related: vi.fn(() => reply) } as unknown as CustomerQuotesApi;
    const results: unknown[] = [];
    const subscription = customerEffects
      .checkDelete(new Actions(actions), api)
      .subscribe((result) => results.push(result));
    const requested = customerActions.deleteCheckRequested({ id: 'c1', token: 'old-page' });
    const pending = customerFeature.reducer(undefined, requested);
    expect(pending.checkingId).toBe('c1');
    actions.next(requested);
    actions.next(customerActions.deleteCheckDismissed());
    expect(
      customerFeature.reducer(pending, customerActions.deleteCheckDismissed()).checkingId,
    ).toBeNull();
    reply.next([]);
    expect(results).toEqual([]);
    subscription.unsubscribe();
  });

  it('blocks deletion when API returns related quotes', () => {
    const actions = new Subject<ReturnType<typeof customerActions.deleteCheckRequested>>();
    const api = {
      related: vi.fn(() => of([{ id: 'q1', customerId: 'c1' }])),
    } as unknown as CustomerQuotesApi;
    const results: unknown[] = [];
    const subscription = customerEffects
      .checkDelete(new Actions(actions), api)
      .subscribe((result) => results.push(result));
    actions.next(customerActions.deleteCheckRequested({ id: 'c1', token: 'page-1' }));
    expect(results).toEqual([customerActions.deleteCheckBlocked({ id: 'c1' })]);
    const state = customerFeature.reducer(
      undefined,
      customerActions.deleteCheckBlocked({ id: 'c1' }),
    );
    expect(state.blockedId).toBe('c1');
    subscription.unsubscribe();
  });
});
