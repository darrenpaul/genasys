import { Routes } from '@angular/router';

export const quoteRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./quotes').then((page) => page.Quotes),
    title: 'Quotes — Genesys',
  },
];
