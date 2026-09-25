// Thin HTTP layer for the Quotes feature. Each method maps to one endpoint and
// returns an Observable. No state lives here; that is the store's job.
//
// Coming from Vue: this is the `api/quotes.ts` module of axios calls you would
// normally write, except it is a class so Angular's dependency injection (DI)
// can hand an instance to whoever asks for it (the NgRx effects, here).
//
// Two things will feel different from axios:
//
//   1. `HttpClient` returns RxJS Observables, not Promises. An Observable is
//      lazy: nothing is sent until someone calls `.subscribe()` (or an NgRx
//      effect does so for you). A Promise starts the moment it is created.
//   2. Unsubscribing from an `HttpClient` Observable cancels the in-flight
//      request. That is what makes "ignore the result because the user
//      navigated away" a one-operator change instead of a manual flag.
//
// The `/api` prefix is rewritten by the dev proxy to JSON Server (see README).
import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Customer } from '../../customers/data-access/customer.model';
import { Quote, QuoteDraft } from './quote.model';

// `@Service()` registers this class as an app-wide singleton, the Angular 22
// shorthand for `@Injectable({ providedIn: 'root' })`. Anyone can then call
// `inject(QuotesApi)` without importing or providing it first. In Vue terms it
// is a composable that always returns the same instance.
@Service()
export class QuotesApi {
  // `inject()` pulls a dependency out of DI. It only works while the class is
  // being constructed (field initialisers and the constructor body), which is
  // why dependencies are declared as fields rather than fetched in methods.
  private readonly http = inject(HttpClient);
  private readonly url = '/api/quotes';

  // The generic `<Quote[]>` tells TypeScript what the response body looks
  // like. Nothing checks it at runtime, so trust it as far as the backend.
  list(): Observable<Quote[]> {
    return this.http.get<Quote[]>(this.url);
  }

  // `encodeURIComponent` guards against ids containing `/` or `?`.
  get(id: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.url}/${encodeURIComponent(id)}`);
  }

  // `createdAt` is stamped client-side because JSON Server does not add it.
  // Vue equivalent: `axios.post(url, { ...draft, createdAt })`.
  create(draft: QuoteDraft): Observable<Quote> {
    return this.http.post<Quote>(this.url, { ...draft, createdAt: new Date().toISOString() });
  }

  // PUT replaces the whole record, so the caller must include the original
  // `createdAt` (the form copies it from the loaded quote before dispatching).
  update(quote: Quote): Observable<Quote> {
    return this.http.put<Quote>(`${this.url}/${encodeURIComponent(quote.id)}`, quote);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`);
  }
}

/**
 * Read-only customer references; customer feature remains mutation owner.
 *
 * The quotes pages need customer names for the table and the customer
 * <mat-select>, but they must never create, edit or delete customers. Giving
 * quotes its own read-only service, instead of importing the customers
 * feature's API, keeps that boundary visible in the code and keeps the two
 * lazy-loaded features independent of each other's providers.
 */
@Service()
export class QuoteCustomersApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Customer[]> {
    return this.http.get<Customer[]>('/api/customers');
  }
}
