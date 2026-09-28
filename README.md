# Genasys

Customer and quote management demo built with client-rendered Angular 22, Angular Material, NgRx, and JSON Server.

## Quick start

Requires Node 22.22.3 (`.nvmrc`) and npm 10.9.8. Dependencies are locked in `package-lock.json`.

```bash
nvm use
npm ci
npm run dev
```

Open <http://localhost:4200/>. `npm run dev` starts both Angular and JSON Server; the API listens on `127.0.0.1:3000`. For separate terminals, run `npm run api` and `npm run start` instead.

> **Local data:** `npm run api` copies tracked `server/db.seed.json` to ignored `server/db.json` only when the latter does not exist. Changes to `server/db.json` survive restarts. `npm run db:reset` **overwrites local records** with the seed.

## What the app does

- List, filter, sort, create, edit, and delete customers and quotes. Feature routes and their NgRx state/effects load lazily.
- Follow a customer's quote link to `/quotes?customerId=<id>`; customer and status filters remain in the URL.
- Manage customer addresses, confirm a nationality, and optionally select one university. Nationalize suggestions never auto-select a country. University websites are saved only when valid HTTP(S) links; the API keeps array format for compatibility with older records.
- Store quote amounts as integer euro cents and display them in EUR. Quotes support draft, submitted, approved, and declined statuses.
- Block customer deletion when quotes reference that customer. The app checks `/api/quotes?customerId=<id>` before confirmation and again before deletion; failed or malformed checks also block deletion.

`createdAt` is set on creation and preserved on edit. JSON Server 1.0.0-beta.15 generates string IDs on POST; clients use the returned ID for later requests. Editing an older customer with multiple universities retains only the first on save.

## Project layout

| Path                       | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `src/app/pages/customers/` | Customer pages, form, NgRx feature, API, enrichment lookups |
| `src/app/pages/quotes/`    | Quote pages, form, NgRx feature, API                        |
| `src/app/shared/`          | Reusable UI components                                      |
| `src/app/app.routes.ts`    | Lazy feature routes                                         |
| `server/db.seed.json`      | Sample customers and EUR quotes across all statuses         |
| `proxy.conf.json`          | Development API and university-search proxy                 |
| `agent-sessions/`          | AI prompts and development conversation records             |

Standalone components, strict TypeScript/templates, and Signal Forms are used; there is no SSR or `AppModule`. Some source comments compare Angular concepts with Vue as learning aids; the app does not use Vue or depend on it.

## API and external services

| Browser URL                       | Destination in development        | Notes                                                                                                 |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/api/*`                          | JSON Server at `127.0.0.1:3000/*` | Angular strips `/api`; use relative URLs in browser services.                                         |
| `/external/universities`          | HipoLabs `/search`                | Same-origin browser request; development server proxies to HTTP upstream.                             |
| `https://api.nationalize.io`      | Nationalize                       | HTTPS browser request sends surname only.                                                             |
| `https://countries.dev/countries` | countries.dev                     | Optional, retryable HTTPS refresh; bundled 250-entry country snapshot keeps picker available offline. |

University search translates selected ISO codes where HipoLabs country names differ (for example `US` → `United States`). The bundled country snapshot was retrieved 2026-09-25. **Confirm upstream redistribution license before production distribution.** External lookups may fail or be rate-limited; core local data uses JSON Server.

## AI usage

AI was used for Tasks 1–5, including Tasks 2–4. Prompts and follow-up requests are recorded as `USER:` entries in [`agent-sessions/1-implement-routing.md`](agent-sessions/1-implement-routing.md), [`agent-sessions/2-customer-management-page.md`](agent-sessions/2-customer-management-page.md), [`agent-sessions/3-quote-management-page.md`](agent-sessions/3-quote-management-page.md) (including Task 4), and [`agent-sessions/5-enrichment.md`](agent-sessions/5-enrichment.md). These records contain assistant responses as well. No separate Task 4 session exists.

## Checks

```bash
npm run test          # single Vitest run
npm run test:watch    # watch mode
npm run lint
npm run format:check
npm run build
```

`npm run format` writes formatting changes; `npm run watch` watches development builds. No browser-based end-to-end runner is configured; manually check browser console during development.

## Production considerations

JSON Server is a development mock, not a production backend. `ng serve` proxies do not exist in production: hosting must route `/api` to a real API and proxy `/external/universities` server-side (HTTPS browser pages must not call HipoLabs HTTP directly). A real API must enforce customer/quote reference rules atomically; frontend checks cannot prevent check-then-delete races. Do not put secrets in browser configuration.
