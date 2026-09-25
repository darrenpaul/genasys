// Plain TypeScript interfaces for the customers feature. Nothing here is
// Angular-specific.
//
// Coming from Vue: this is the same `types.ts` you would keep next to a Pinia
// store. Interfaces exist only at compile time and never reach the browser.

/** One postal address that belongs to a customer. */
export interface Address {
  /**
   * Generated in the browser with `crypto.randomUUID()` when the user clicks
   * "Add address". It gives each row a stable identity for `@for ... track`
   * (Angular's version of `v-for` + `:key`), so typing in one address never
   * re-creates the inputs of another.
   */
  id: string;
  street: string;
  city: string;
  suburb: string;
  postalCode: string;
}

/**
 * Explicitly selected country, never an unconfirmed prediction.
 *
 * Stored as `{ code, name }` rather than a plain string so the university
 * search can key off the ISO code while the list page displays the name.
 */
export interface ConfirmedCountry {
  code: string;
  name: string;
}

/** University selected from lookup results. */
export interface University {
  /** Same purpose as `Address.id`: a stable key for the `@for` loop. */
  id: string;
  name: string;
  /** First usable http(s) link from the lookup provider, or null if none was valid. */
  website: string | null;
}

/**
 * Everything the user can type into the form, and exactly what we POST to the
 * API when creating a customer.
 *
 * Nationality must be explicitly confirmed. University is optional.
 */
export interface CustomerDraft {
  firstName: string;
  lastName: string;
  email: string;
  nationality: ConfirmedCountry | null;
  addresses: Address[];
  /** API keeps array format for existing records; new saves contain zero or one university. */
  universities: University[];
}

/**
 * A saved customer: the draft plus the fields the server owns.
 * Plain TypeScript `extends`, nothing Angular about it.
 */
export interface Customer extends CustomerDraft {
  /** Assigned by JSON Server on POST. We never send our own id when creating. */
  id: string;
  /** ISO timestamp. Set once on create and carried over unchanged on edit. */
  createdAt: string;
}
