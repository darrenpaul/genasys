import { Routes } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { customerEffects, customerFeature } from './data-access/customer.store';
import { CustomerQuotesApi, CustomersApi } from './data-access/customers-api';

// Child routes for everything under `/customers`. The app-level routes file
// lazy-loads this whole array, so none of this code is downloaded until the
// user first visits a customers URL.
//
// Coming from Vue Router: `loadComponent: () => import(...)` is the same
// pattern as `component: () => import('./View.vue')`. The parts that have no
// Vue equivalent are `providers` and `title`, explained below.
export const customerRoutes: Routes = [
  {
    // Empty path = a wrapper route with no URL segment of its own. It exists
    // only to share `providers` with all of its `children`.
    path: '',
    // Route-level providers register services for this branch of the router
    // only. Angular creates them when the branch activates and destroys them
    // when it deactivates. This is how the customers NgRx slice and effects are
    // registered lazily instead of in the global app config.
    providers: [
      // Adds the 'customers' reducer to the store (like registering a Vuex module).
      provideState(customerFeature),
      // Starts listening for actions with the effects defined in customer.store.ts.
      provideEffects(customerEffects),
      // The API services are `@Service()` already, but listing them here scopes
      // their instances to this feature.
      CustomersApi,
      CustomerQuotesApi,
    ],
    children: [
      {
        path: '',
        // `.then((page) => page.Customers)` picks the named export from the module.
        loadComponent: () => import('./customers').then((page) => page.Customers),
        // Angular sets `document.title` from this automatically on navigation.
        title: 'Customers — Genasys',
      },
      {
        path: 'new',
        loadComponent: () => import('./customer-form').then((page) => page.CustomerForm),
        title: 'Add customer — Genasys',
      },
      {
        // `:customerId` is a route parameter, read in the form via
        // `ActivatedRoute.paramMap` (Vue: `useRoute().params.customerId`).
        // The same component serves both create and edit; it checks whether
        // the parameter is present to decide which mode it is in.
        path: ':customerId/edit',
        loadComponent: () => import('./customer-form').then((page) => page.CustomerForm),
        title: 'Edit customer — Genasys',
      },
    ],
  },
];
