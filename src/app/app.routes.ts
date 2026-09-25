import { Routes } from '@angular/router';
import { Customers } from './pages/customers/customers';
import { Quotes } from './pages/quotes/quotes';

export const routes: Routes = [
  { path: '', redirectTo: 'customers', pathMatch: 'full' },
  { path: 'customers', component: Customers, title: 'Customers — Genesys' },
  { path: 'quotes', component: Quotes, title: 'Quotes — Genesys' },
];
