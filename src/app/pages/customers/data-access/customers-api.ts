import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Customer, CustomerDraft } from './customer.model';

// This file is the only place that knows the REST URLs. Components never call
// `HttpClient` directly; they dispatch NgRx actions and the effects in
// `customer.store.ts` call these methods.
//
// Coming from Vue: think of this as the `api/customers.ts` module you would
// import into a Pinia store. Two differences:
//
//   1. It is a class, not a set of exported functions. Angular creates one
//      instance and hands it to whoever asks for it via `inject()`. This is
//      Angular's dependency injection (DI): like `provide`/`inject` in Vue,
//      but used for every service in the app, not just parent/child sharing.
//   2. Methods return RxJS `Observable`s instead of Promises. An Observable is
//      lazy: nothing is sent until someone subscribes to it. NgRx effects do
//      the subscribing for us.

// `@Service()` registers the class with Angular's injector so `inject(CustomersApi)`
// works anywhere. It is the Angular v22 shorthand for
// `@Injectable({ providedIn: 'root' })`. Because we also list this class in the
// customer routes' `providers`, it is created lazily when the feature loads.
@Service()
export class CustomersApi {
  // `inject()` asks Angular's DI for the HttpClient singleton. It must be called
  // during construction (field initialisers count), not later inside a method.
  private readonly http = inject(HttpClient);
  // Relative URL: the dev server proxies `/api/*` to JSON Server. See README.
  private readonly url = '/api/customers';

  // `http.get<Customer[]>` is typed for convenience only. Angular does not
  // validate the response shape at runtime.
  list(): Observable<Customer[]> {
    return this.http.get<Customer[]>(this.url);
  }

  get(id: string): Observable<Customer> {
    return this.http.get<Customer>(`${this.url}/${encodeURIComponent(id)}`);
  }

  // The server does not stamp `createdAt`, so we do it here. We deliberately do
  // not send an `id`; JSON Server generates one and returns it in the body.
  create(draft: CustomerDraft): Observable<Customer> {
    return this.http.post<Customer>(this.url, { ...draft, createdAt: new Date().toISOString() });
  }

  // PUT replaces the whole record, so the caller must pass the full `Customer`,
  // including the original `createdAt`.
  update(customer: Customer): Observable<Customer> {
    return this.http.put<Customer>(`${this.url}/${encodeURIComponent(customer.id)}`, customer);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`);
  }
}

// Separate service on purpose: it talks to the quotes collection, not customers.
// Keeping it apart makes it easy to mock on its own in tests.
@Service()
export class CustomerQuotesApi {
  private readonly http = inject(HttpClient);

  // Returns `unknown` because we do not model quotes yet. `hasRelatedQuotes`
  // below is responsible for deciding what a valid response looks like.
  related(customerId: string): Observable<unknown> {
    return this.http.get<unknown>('/api/quotes', {
      // `HttpParams` builds `?customerId=...` and handles URL encoding.
      // It is immutable: `.set()` returns a new instance, it does not mutate.
      params: new HttpParams().set('customerId', customerId),
    });
  }
}

// Pure helper, exported so both the list page and the delete effect share the
// same rule and so it can be unit-tested without any Angular setup.
export function hasRelatedQuotes(response: unknown): boolean {
  // Treat malformed responses as unsafe, never as evidence that deletion is permitted.
  if (!Array.isArray(response)) throw new Error('Could not verify related quotes.');
  return response.length > 0;
}
