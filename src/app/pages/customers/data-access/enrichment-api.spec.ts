// Tests for the enrichment HTTP services in enrichment-api.ts.
//
// `provideHttpClientTesting()` swaps the real HTTP backend for an in-memory
// one. `HttpTestingController` then lets a test assert which requests were
// made (`expectOne`), answer them (`flush`, with a body and optional status),
// and confirm nothing was left unanswered (`verify`). If you have used msw or
// a mocked axios in Vitest, it is the same idea with one difference: the test
// controls timing. A request only resolves when the test flushes it, so no
// `await` or fake timers are needed for the happy path.
//
// `TestBed` is Angular's test harness. `configureTestingModule` sets up a
// mini application with the given providers, and `TestBed.inject(X)` pulls
// a service out of it, the way a component would with `inject(X)`.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CountriesApi, fallbackCountries, NationalityApi, UniversitiesApi } from './enrichment-api';

describe('Enrichment HTTP boundary', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  it('bundles complete unique country choices without relying on remote service', () => {
    expect(fallbackCountries.length).toBeGreaterThanOrEqual(240);
    expect(new Set(fallbackCountries.map((country) => country.code)).size).toBe(
      fallbackCountries.length,
    );
    expect(
      fallbackCountries.every((country) => /^[A-Z]{2}$/.test(country.code) && !!country.name),
    ).toBe(true);
  });

  it('uses a successful country refresh once, and retries a failed refresh', () => {
    const api = TestBed.inject(CountriesApi);
    const http = TestBed.inject(HttpTestingController);
    api.refresh().subscribe({ error: () => undefined });
    http
      .expectOne((r) => r.url === 'https://countries.dev/countries')
      .flush('unavailable', { status: 503, statusText: 'Unavailable' });
    const result: string[][] = [];
    api.refresh().subscribe((countries) => result.push(countries.map((country) => country.code)));
    http
      .expectOne((r) => r.url === 'https://countries.dev/countries')
      .flush(fallbackCountries.map(({ name, flag, code }) => ({ name, flag, alpha2Code: code })));
    api.refresh().subscribe((countries) => result.push(countries.map((country) => country.code)));
    http.expectNone((r) => r.url === 'https://countries.dev/countries');
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('NG');
    http.verify();
  });

  it('retains every bundled country when remote metadata omits one', () => {
    const api = TestBed.inject(CountriesApi);
    const http = TestBed.inject(HttpTestingController);
    let countries = fallbackCountries;
    api.refresh().subscribe((result) => (countries = result));
    http
      .expectOne((r) => r.url === 'https://countries.dev/countries')
      .flush(
        fallbackCountries
          .filter((country) => country.code !== 'NG')
          .map(({ name, flag, code }) => ({ name, flag, alpha2Code: code })),
      );
    expect(countries.find((country) => country.code === 'NG')?.name).toBe('Nigeria');
    http.verify();
  });

  it('maps valid predictions once per country and drops malformed candidates', () => {
    const api = TestBed.inject(NationalityApi);
    const http = TestBed.inject(HttpTestingController);
    const results: string[] = [];
    api
      .predict('Smith', fallbackCountries)
      .subscribe((rows) =>
        results.push(...rows.map((row) => `${row.country.name}:${row.probability}`)),
      );
    const request = http.expectOne((r) => r.url === 'https://api.nationalize.io');
    expect(request.request.params.get('name')).toBe('Smith');
    request.flush({
      country: [
        { country_id: 'NG', probability: 0.274 },
        { country_id: 'ng', probability: 0.12 },
        { country_id: 'XX', probability: 0.9 },
        { country_id: 'AU', probability: 2 },
      ],
    });
    expect(results).toEqual(['Nigeria:0.274']);
    http.verify();
  });

  it.each([
    ['BO', 'Bolivia, Plurinational State of'],
    ['CD', 'Congo, the Democratic Republic of the'],
    ['CI', "Côte d'Ivoire"],
    ['CV', 'Cape Verde'],
    ['GB', 'United Kingdom'],
    ['IR', 'Iran'],
    ['KR', 'Korea, Republic of'],
    ['MD', 'Moldova, Republic of'],
    ['TR', 'Turkiye'],
    ['TW', 'Taiwan, Province of China'],
    ['US', 'United States'],
    ['VA', 'Holy See (Vatican City State)'],
    ['VE', 'Venezuela, Bolivarian Republic of'],
    ['VG', 'Virgin Islands, British'],
    ['XK', 'Kosovo'],
  ])('uses university provider name for %s', (code, providerName) => {
    const api = TestBed.inject(UniversitiesApi);
    const http = TestBed.inject(HttpTestingController);
    const country = fallbackCountries.find((item) => item.code === code)!;
    const results: string[] = [];
    api
      .search(country, 'University')
      .subscribe((options) => results.push(...options.map((option) => option.name)));
    const request = http.expectOne((r) => r.url === '/external/universities');
    expect(request.request.params.get('country')).toBe(providerName);
    request.flush([
      { name: 'Test University', alpha_two_code: code, web_pages: ['https://example.edu/'] },
    ]);
    expect(results).toEqual(['Test University']);
    http.verify();
  });

  it('searches by full country name, retains only matching options and HTTPS websites', () => {
    const api = TestBed.inject(UniversitiesApi);
    const http = TestBed.inject(HttpTestingController);
    const country = fallbackCountries.find((item) => item.code === 'NG')!;
    const results: { name: string; website: string | null }[] = [];
    api.search(country, 'Lagos & more').subscribe((options) => results.push(...options));
    const request = http.expectOne((r) => r.url === '/external/universities');
    expect(request.request.params.get('country')).toBe('Nigeria');
    expect(request.request.params.get('name')).toBe('Lagos & more');
    request.flush([
      {
        name: 'Lagos',
        alpha_two_code: 'NG',
        web_pages: ['javascript:alert(1)', 'https://unilag.edu.ng/'],
      },
      { name: 'Other', alpha_two_code: 'US', web_pages: ['https://other.test'] },
      { name: 'HTTP only', alpha_two_code: 'NG', web_pages: ['http://example.test/'] },
      { name: 'Unsafe', alpha_two_code: 'NG', web_pages: ['javascript:alert(1)'] },
    ]);
    expect(results).toEqual([
      { name: 'Lagos', website: 'https://unilag.edu.ng/', countryCode: 'NG' },
      { name: 'HTTP only', website: 'http://example.test/', countryCode: 'NG' },
      { name: 'Unsafe', website: null, countryCode: 'NG' },
    ]);
    http.verify();
  });
});
