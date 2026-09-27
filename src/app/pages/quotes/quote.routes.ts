// Routes for the lazy-loaded Quotes feature. app.routes.ts points `/quotes` at
// this file with `loadChildren`, so none of this code, and none of the NgRx
// state it registers, is downloaded until the user first visits a quotes URL.
//
// vue-router comparison:
//
//   loadComponent: () => import(...)   ->  component: () => import(...)
//   path: ':quoteId/edit'              ->  path: ':quoteId/edit' (same syntax)
//   title: '...'                       ->  meta.title plus an afterEach hook that
//                                          sets document.title; Angular does it
//   providers: [...]                   ->  no equivalent; explained below
import { Routes } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { quoteEffects, quoteFeature } from './data-access/quote.store';
import { QuoteCustomersApi, QuotesApi } from './data-access/quotes-api';

export const quoteRoutes: Routes = [
  {
    // A pathless parent route exists only to hold `providers`. Everything
    // listed there is created when the route first activates and shared by
    // every child route. `provideState` / `provideEffects` register this
    // feature's NgRx slice on demand, rather than in the root store at
    // startup, roughly like calling `defineStore` only when the page is
    // visited. The two API services are listed so they are scoped here too.
    path: '',
    providers: [
      provideState(quoteFeature),
      provideEffects(quoteEffects),
      QuotesApi,
      QuoteCustomersApi,
    ],
    children: [
      // '' under the parent '' is `/quotes`. `import()` returns the module
      // object, so `.then((page) => page.Quotes)` picks out the component
      // class; Angular needs the class, not the module.
      {
        path: '',
        loadComponent: () => import('./quotes').then((page) => page.Quotes),
        title: 'Quotes — Genasys',
      },
      // `/quotes/new` and `/quotes/:quoteId/edit` share one component. It reads
      // `ActivatedRoute.paramMap` to decide whether it is creating or editing.
      {
        path: 'new',
        loadComponent: () => import('./quote-form/quote-form').then((page) => page.QuoteForm),
        title: 'Add quote — Genasys',
      },
      {
        path: ':quoteId/edit',
        loadComponent: () => import('./quote-form/quote-form').then((page) => page.QuoteForm),
        title: 'Edit quote — Genasys',
      },
    ],
  },
];
