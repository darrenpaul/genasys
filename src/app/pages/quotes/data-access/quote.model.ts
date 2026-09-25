// Shared types and pure helpers for the Quotes feature. Nothing in this file
// touches Angular: it is plain TypeScript, so it is trivial to unit test and
// safe to import from anywhere (store, components, tests).

// A readonly tuple of the allowed statuses. `as const` keeps the literal
// strings ('draft', 'submitted', ...) instead of widening them to `string`,
// which is what lets the type below be derived from the array. One source of
// truth: add a status here and both the `QuoteStatus` type and the
// <mat-select> options in the templates pick it up.
export const quoteStatuses = ['draft', 'submitted', 'approved', 'declined'] as const;
// `(typeof quoteStatuses)[number]` reads as "the type of any element of that
// array", i.e. the union 'draft' | 'submitted' | 'approved' | 'declined'.
export type QuoteStatus = (typeof quoteStatuses)[number];

// A type guard. The `value is QuoteStatus` return type tells TypeScript that
// inside an `if (isQuoteStatus(x))` block, `x` may be treated as a
// `QuoteStatus`. Used for values that come from outside the app (URL query
// params, form selects) and therefore arrive as plain strings.
export function isQuoteStatus(value: string | null): value is QuoteStatus {
  return quoteStatuses.some((status) => status === value);
}

// What the user provides when creating a quote. The server adds `id` and the
// client stamps `createdAt`; together they make a `Quote` (below).
export interface QuoteDraft {
  customerId: string;
  /**
   * Integer euro cents. Never mix amounts in different currencies.
   *
   * Money is stored as a whole number of cents, never as a float: in
   * JavaScript `0.1 + 0.2 !== 0.3`, but `10 + 20 === 30` always holds. The
   * conversion to "10.01" happens only at the edges: `formatEuroInput` for the
   * form input and the `currency` pipe for display.
   */
  amountInMinorUnits: number;
  status: QuoteStatus;
}

export interface Quote extends QuoteDraft {
  id: string;
  createdAt: string;
}

/**
 * Parse decimal text without floating-point multiplication (e.g. 10.01 -> 1001).
 *
 * Why not `Math.round(Number(value) * 100)`? Because `1.15 * 100` evaluates to
 * `114.99999999999999`, and rounding hides that class of bug rather than
 * avoiding it. Instead the string is split at the decimal point and each part
 * is handled as an integer:
 *
 *   "10.01" -> match[1] = "10", match[2] = "01"  -> 10 * 100 + 1  = 1001
 *   "10.5"  -> match[1] = "10", match[2] = "5"   -> padEnd -> "50" = 1050
 *   "10"    -> match[2] is undefined             -> "" padded "00" = 1000
 *
 * The regex allows up to 7 whole digits and up to 2 decimals. Anything else
 * (letters, three decimals, negatives) returns `null`. Zero is rejected too
 * because a quote for €0.00 is not meaningful.
 */
export function parseEuroCents(value: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

// The inverse, for pre-filling the edit form: 1001 -> "10.01". `toFixed(2)` is
// safe here because dividing an integer by 100 has at most two decimals.
export function formatEuroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
