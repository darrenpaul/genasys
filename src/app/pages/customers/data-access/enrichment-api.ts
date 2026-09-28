// HTTP access for the two "enrichment" lookups on the customer form
// (surname -> nationality, country -> university), plus the country list
// they both depend on.
//
// Coming from Vue, each class below is what you might write as a module of
// axios calls or a Pinia store that only has actions. Things to know:
//   - `@Service()` registers the class as an app-wide singleton so components
//     can `inject()` it. No plugin or `provide()` setup is needed.
//   - `HttpClient` returns Observables, not Promises. An Observable is lazy
//     (nothing is sent until someone calls `.subscribe()`) and cancellable
//     (unsubscribing aborts the request). That is what lets the form drop
//     stale lookups while the user keeps typing.
//   - Responses are typed as `unknown` and validated inside `map` before they
//     reach the rest of the app. A malformed payload from a third-party API
//     then becomes an ordinary error rather than a crash in a template.
import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map, shareReplay, catchError, throwError } from 'rxjs';
import { ConfirmedCountry } from '@app/pages/customers/data-access/customer.model';
import { countrySnapshot } from '@app/pages/customers/data-access/countries.snapshot';

/** A pickable country. `ConfirmedCountry` (code + name) is what gets saved; the flag is display-only. */
export interface Country extends ConfirmedCountry {
  flag: string;
}
/** One suggestion from the nationality API, already resolved to a known country. */
export interface Prediction {
  country: Country;
  probability: number;
}
/** One row from the university search. `countryCode` lets the form reject results from a stale country. */
export interface UniversityOption {
  name: string;
  website: string | null;
  countryCode: string;
}

// The bundled snapshot, trimmed to the fields the app uses. The form starts
// with this list, so the country picker works even when countries.dev is
// unreachable, and the live refresh only ever *adds to or updates* it.
export const fallbackCountries: Country[] = countrySnapshot.map(({ code, name, flag }) => ({
  code,
  name,
  flag,
}));

// A TypeScript type guard. After `if (isRecord(x))`, the compiler treats `x`
// as an object you can index with `x['key']`. The parsers below use it to
// pick through untyped JSON safely.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Service()
export class CountriesApi {
  private readonly http = inject(HttpClient);
  // The cached Observable, not the cached array. See `shareReplay` below.
  private cached?: Observable<Country[]>;

  // Returns the live country list, fetching at most once per app session.
  //
  // How the cache works: the first call builds the request Observable and
  // stores it. `shareReplay({ bufferSize: 1 })` makes that Observable
  // remember its last value and hand it to every later subscriber without a
  // new request. Think of it as a memoised Promise.
  // `refCount: false` keeps the value even when nobody is subscribed.
  //
  // A failed refresh does not poison the cache: `catchError` clears `cached`
  // before re-throwing, so a Retry click starts a fresh request.
  refresh(): Observable<Country[]> {
    if (!this.cached) {
      this.cached = this.http
        .get<unknown>('https://countries.dev/countries', {
          // `HttpParams` builds the query string and handles encoding. It is
          // immutable: each `.set()` returns a new instance, hence chaining.
          params: new HttpParams().set('fields', 'name,flag,flags,alpha2Code'),
        })
        .pipe(
          // `map` transforms the response body. Throwing inside `map` turns
          // into an error on the stream, which `subscribe({ error })` in the
          // component receives just like a rejected Promise.
          map((body) => {
            if (!Array.isArray(body)) throw new Error('Invalid country list');
            // Keep only rows with a two-letter ISO code and a non-empty name.
            const rows = body
              .filter(isRecord)
              .filter(
                (row) =>
                  typeof row['alpha2Code'] === 'string' &&
                  /^[A-Z]{2}$/.test(row['alpha2Code']) &&
                  typeof row['name'] === 'string' &&
                  !!row['name'].trim(),
              )
              .map((row) => ({
                code: row['alpha2Code'] as string,
                name: row['name'] as string,
                flag: typeof row['flag'] === 'string' ? row['flag'] : '',
              }));
            // Sanity check: a suspiciously short or duplicated list is treated
            // as a failure so we do not silently replace a good snapshot.
            if (rows.length < 240 || new Set(rows.map((row) => row.code)).size !== rows.length)
              throw new Error('Incomplete country list');
            // Merge over the snapshot rather than replace it. A partial
            // upstream response must not remove a country the user needs.
            const byCode = new Map(fallbackCountries.map((country) => [country.code, country]));
            for (const row of rows) byCode.set(row.code, row);
            return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
          }),
          catchError((error: unknown) => {
            this.cached = undefined;
            // `throwError(() => error)` re-emits the error to the subscriber.
            return throwError(() => error);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.cached;
  }
}

@Service()
export class NationalityApi {
  private readonly http = inject(HttpClient);

  // Asks nationalize.io which countries a surname is common in. The raw
  // response looks like:
  //   { name: 'Smith', country: [{ country_id: 'US', probability: 0.3 }, ...] }
  // The caller passes in the current country list so the codes can be
  // resolved to full `Country` objects (name + flag) for display.
  predict(surname: string, countries: Country[]): Observable<Prediction[]> {
    return this.http
      .get<unknown>('https://api.nationalize.io', {
        params: new HttpParams().set('name', surname),
      })
      .pipe(
        map((body) => {
          if (!isRecord(body) || !Array.isArray(body['country']))
            throw new Error('Invalid prediction');
          const seen = new Set<string>();
          // `flatMap` returning `[]` or `[item]` is a filter-and-map in one pass.
          return body['country'].filter(isRecord).flatMap((row) => {
            const code = row['country_id'];
            const probability = row['probability'];
            const country =
              typeof code === 'string'
                ? countries.find((item) => item.code === code.toUpperCase())
                : undefined;
            // Drop rows we cannot show (unknown country), rows with a bogus
            // probability, and duplicate countries.
            if (
              !country ||
              typeof probability !== 'number' ||
              !Number.isFinite(probability) ||
              probability < 0 ||
              probability > 1 ||
              seen.has(country.code)
            )
              return [];
            seen.add(country.code);
            return [{ country, probability }];
          });
        }),
      );
  }
}

// Accepts only real http(s) URLs. The university provider's `web_pages`
// values are untrusted strings that end up in a link, so anything else
// (`javascript:` URLs, plain text, malformed input) is discarded. Exported
// because the tests cover it directly.
export function safeWebsite(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// HipoLabs country names differ from the country picker for these ISO codes.
// The provider searches by *name*, not code, so we translate before calling.
// Checked against HipoLabs /search country fields on 2026-09-25.
const universityCountryNames: Readonly<Record<string, string>> = {
  BO: 'Bolivia, Plurinational State of',
  CD: 'Congo, the Democratic Republic of the',
  CI: "Côte d'Ivoire",
  CV: 'Cape Verde',
  GB: 'United Kingdom',
  IR: 'Iran',
  KR: 'Korea, Republic of',
  MD: 'Moldova, Republic of',
  TR: 'Turkiye',
  TW: 'Taiwan, Province of China',
  US: 'United States',
  VA: 'Holy See (Vatican City State)',
  VE: 'Venezuela, Bolivarian Republic of',
  VG: 'Virgin Islands, British',
  XK: 'Kosovo',
};

@Service()
export class UniversitiesApi {
  private readonly http = inject(HttpClient);

  // Searches HipoLabs for universities in one country whose name contains
  // `query`. Each result row looks like:
  //   { name, alpha_two_code, country, web_pages: [...], domains: [...] }
  //
  // The URL is a relative path, unlike the other two services. HipoLabs is
  // plain http and would be blocked as mixed content, so the dev server
  // proxies `/external/universities` to it (see proxy.conf.json, the Angular
  // equivalent of Vite's `server.proxy`). Production needs the same rule in
  // whatever serves the app.
  search(country: Country, query: string): Observable<UniversityOption[]> {
    return this.http
      .get<unknown>('/external/universities', {
        params: new HttpParams()
          .set('country', universityCountryNames[country.code] ?? country.name)
          .set('name', query),
      })
      .pipe(
        map((body) => {
          if (!Array.isArray(body)) throw new Error('Invalid university response');
          // Keep rows with a usable name that really belong to the country we
          // asked for (the provider's name search is fuzzy), cap at 20, then
          // pick one website per row: the first https URL, else the first
          // http URL, else null. `safeWebsite` discards anything that is not
          // a real http(s) URL.
          return body
            .filter(isRecord)
            .filter(
              (row) =>
                typeof row['name'] === 'string' &&
                !!row['name'].trim() &&
                typeof row['alpha_two_code'] === 'string' &&
                row['alpha_two_code'].toUpperCase() === country.code,
            )
            .slice(0, 20)
            .map((row) => ({
              name: row['name'] as string,
              countryCode: country.code,
              website: Array.isArray(row['web_pages'])
                ? (row['web_pages']
                    .map(safeWebsite)
                    .find((site): site is string => site?.startsWith('https:') ?? false) ??
                  row['web_pages'].map(safeWebsite).find((site): site is string => site !== null) ??
                  null)
                : null,
            }));
        }),
      );
  }
}
