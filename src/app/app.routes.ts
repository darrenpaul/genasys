import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'customers', pathMatch: 'full' },
  {
    path: 'customers',
    loadChildren: () =>
      import('./pages/customers/customer.routes').then((file) => file.customerRoutes),
  },
  {
    path: 'quotes',
    loadChildren: () => import('./pages/quotes/quote.routes').then((file) => file.quoteRoutes),
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((page) => page.NotFound),
    title: 'Page not found — Genasys',
  },
];
