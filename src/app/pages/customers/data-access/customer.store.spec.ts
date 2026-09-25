// Unit tests for the NgRx pieces in customer.store.ts.
//
// Notice how little Angular there is here: no TestBed at all.
//   - Reducers are pure functions, so we call `customerFeature.reducer` with
//     a state and an action and check the returned state. Same as testing a
//     Vuex mutation, with the bonus that we can also assert the input state
//     was not mutated.
//   - Functional effects take their dependencies as parameters, so we can pass
//     a fake `Router` and `NotificationService` straight in, push actions
//     through a `Subject` (an Observable we control by hand), and check what
//     the effect did.
import { customerActions, customerEffects, customerFeature } from './customer.store';
import { Actions } from '@ngrx/effects';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { NotificationService } from '../../../shell/notification.service';
import { Customer } from './customer.model';
import { hasRelatedQuotes } from './customers-api';

const customer: Customer = {
  id: 'c1',
  firstName: 'Amina',
  lastName: 'Okafor',
  email: 'amina@example.test',
  nationality: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  addresses: [
    {
      id: 'a1',
      street: '10 Maple Lane',
      city: 'Lagos',
      suburb: 'Yaba',
      postalCode: '101212',
    },
  ],
  universities: [{ id: 'u1', name: 'University of Lagos' }],
};

describe('Customer state', () => {
  const reduce = customerFeature.reducer;
  // Reducers return the initial state when given an unknown action.
  const initial = reduce(undefined, { type: 'init' });

  it('loads customers and keeps previous rows on load failure', () => {
    const loaded = reduce(initial, customerActions.loadSucceeded({ customers: [customer] }));
    expect(loaded.entities['c1']?.firstName).toBe('Amina');
    const failed = reduce(loaded, customerActions.loadFailed({ error: 'Offline' }));
    expect(failed.entities['c1']).toEqual(customer);
    expect(failed.loadStatus).toBe('error');
  });

  it('reflects create, edit and delete success without changing original state', () => {
    const created = reduce(
      initial,
      customerActions.createSucceeded({ customer, originNavigationId: 1 }),
    );
    const edited = { ...customer, firstName: 'Amara' };
    const updated = reduce(
      created,
      customerActions.updateSucceeded({ customer: edited, originNavigationId: 1 }),
    );
    expect(updated.entities['c1']?.firstName).toBe('Amara');
    expect(created.entities['c1']?.firstName).toBe('Amina');
    const deleted = reduce(updated, customerActions.deleteSucceeded({ id: 'c1' }));
    expect(deleted.ids).toEqual([]);
    expect(updated.entities['c1']).toEqual(edited);
  });

  it('keeps customer after failed deletion and allows a retry', () => {
    const loaded = reduce(initial, customerActions.loadSucceeded({ customers: [customer] }));
    const pending = reduce(loaded, customerActions.deleteRequested({ id: 'c1' }));
    const failed = reduce(pending, customerActions.deleteFailed({ error: 'Blocked' }));
    expect(failed.entities['c1']).toEqual(customer);
    expect(failed.deletingId).toBeNull();
    expect(reduce(failed, customerActions.deleteRequested({ id: 'c1' })).deletingId).toBe('c1');
  });
});

describe('Save navigation', () => {
  it('does not close a different customer edit after a delayed save', () => {
    // The user is now on c2's edit page, but the save that finishes belongs
    // to an earlier navigation (id 1). The effect must not redirect them.
    const events = new Subject<ReturnType<typeof customerActions.updateSucceeded>>();
    const router = {
      url: '/customers/c2/edit',
      navigate: vi.fn(),
      lastSuccessfulNavigation: () => ({ id: 2 }),
    } as unknown as Router;
    const notification = { announce: vi.fn() } as unknown as NotificationService;
    const subscription = customerEffects
      .afterSave(new Actions(events), router, notification)
      .subscribe();
    events.next(customerActions.updateSucceeded({ customer, originNavigationId: 1 }));
    expect(router.navigate).not.toHaveBeenCalled();
    expect(notification.announce).toHaveBeenCalledWith('Customer saved.');
    subscription.unsubscribe();
  });

  it('returns to list after save from the current edit navigation', () => {
    const events = new Subject<ReturnType<typeof customerActions.updateSucceeded>>();
    const router = {
      url: '/customers/c1/edit',
      navigate: vi.fn(),
      lastSuccessfulNavigation: () => ({ id: 2 }),
    } as unknown as Router;
    const notification = { announce: vi.fn() } as unknown as NotificationService;
    const subscription = customerEffects
      .afterSave(new Actions(events), router, notification)
      .subscribe();
    events.next(customerActions.updateSucceeded({ customer, originNavigationId: 2 }));
    expect(router.navigate).toHaveBeenCalledWith(['/customers']);
    subscription.unsubscribe();
  });

  it('does not close a reopened create page after an earlier save', () => {
    const events = new Subject<ReturnType<typeof customerActions.createSucceeded>>();
    const router = {
      url: '/customers/new',
      navigate: vi.fn(),
      lastSuccessfulNavigation: () => ({ id: 2 }),
    } as unknown as Router;
    const notification = { announce: vi.fn() } as unknown as NotificationService;
    const subscription = customerEffects
      .afterSave(new Actions(events), router, notification)
      .subscribe();
    events.next(customerActions.createSucceeded({ customer, originNavigationId: 1 }));
    expect(router.navigate).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('does not close a reopened edit of the same customer after an earlier save', () => {
    const events = new Subject<ReturnType<typeof customerActions.updateSucceeded>>();
    const router = {
      url: '/customers/c1/edit',
      navigate: vi.fn(),
      lastSuccessfulNavigation: () => ({ id: 2 }),
    } as unknown as Router;
    const notification = { announce: vi.fn() } as unknown as NotificationService;
    const subscription = customerEffects
      .afterSave(new Actions(events), router, notification)
      .subscribe();
    events.next(customerActions.updateSucceeded({ customer, originNavigationId: 1 }));
    expect(router.navigate).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});

describe('Quote dependency response', () => {
  it('blocks when quotes exist or response is malformed', () => {
    expect(hasRelatedQuotes([])).toBe(false);
    expect(hasRelatedQuotes([{ id: 'q1' }])).toBe(true);
    expect(() => hasRelatedQuotes({ error: 'unknown' })).toThrow(
      'Could not verify related quotes.',
    );
  });
});
