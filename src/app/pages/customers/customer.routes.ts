import { Routes } from '@angular/router';

export const customerRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./customers').then((page) => page.Customers),
    title: 'Customers — Genesys',
  },
];
