# Genasys

Client-rendered, standalone Angular 22 workspace for the [Customer and Quote Management tutorial](docs/angular-tutorial/README.md). Customers and quotes can be listed, filtered, created, edited, and deleted through lazy-loaded Angular Material pages backed by NgRx and JSON Server. Quote amounts are stored as integer euro cents and displayed in EUR.

## Runtime and installed versions

Use `nvm use` (from `.nvmrc`), then `npm ci`. Angular's [compatibility table](https://angular.dev/reference/versions) lists Node `^22.22.3` as supported for Angular 22; Node 22.22.3 and npm 10.9.8 were used for this baseline. Installed versions are fixed by `package-lock.json`:

| Package                                  | Version       |
| ---------------------------------------- | ------------- |
| Angular / CLI                            | 22.2.0        |
| Angular Material / CDK                   | 22.2.0        |
| NgRx Store / Effects / Entity / Devtools | 22.0.1        |
| JSON Server                              | 1.0.0-beta.15 |

TypeScript and Angular templates use strict checking. Angular ESLint, Prettier, and Vitest are configured. No SSR or `AppModule` is used.

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:4200/`. `dev` starts Angular and JSON Server together; `npm run start` and `npm run api` start them separately. JSON Server listens on `127.0.0.1:3000`. Angular's development proxy removes `/api` before forwarding: `http://localhost:4200/api/customers` maps to JSON Server's `/customers`. Browser services should use relative `/api` URLs. This proxy only exists during `ng serve`; production hosting needs its own API routing. `/external/universities` forwards to HipoLabs over HTTP from the development server, keeping browser calls same-origin. University searches translate country names HipoLabs spells differently (e.g. `US` → `United States`) using the selected ISO code. Production HTTPS hosting must provide a server-side proxy for this route; do not call HipoLabs HTTP directly from the browser. Nationalize receives only surname. Country choices use a bundled 250-entry snapshot from countries.dev (retrieved 2026-09-25; upstream redistribution license must be confirmed before production distribution); remote country refresh is optional and retryable. Nationalize and countries.dev are called over HTTPS from the browser.

`server/db.seed.json` is tracked and contains fake customers and sample EUR quotes across all statuses. Existing ignored `server/db.json` is not overwritten by seed changes; use `npm run db:reset` only if you intend to discard local records. `npm run api` creates ignored `server/db.json` on first run, then preserves edits across restarts. `npm run db:reset` **overwrites local database**, restoring seed. JSON Server 1.0.0-beta.15 generates its own string ID on POST even if request includes `id`; use returned ID for later requests. Customer nationality is a required, explicitly confirmed `{ code, name }` country (Nationalize predictions never auto-select). University is optional, chosen from search results and saved with a nullable validated HTTP(S) website; API retains university array format but new saves contain at most one. Editing older records with multiple universities keeps first and removes others on save. `createdAt` is set on create and preserved on edit. Customer state is owned by NgRx; table filter/sort state is local. JSON Server is a development mock, not a production backend. Before deleting a customer, an NgRx effect checks `/api/quotes?customerId=<id>` and the delete effect rechecks it; malformed or failed checks block deletion. Customer-specific quote links use `/quotes?customerId=<id>`; customer and status filters stay in URL. A real API must enforce quote-reference guards atomically server-side: frontend checks alone cannot eliminate check-then-delete races. Do not put secrets in browser configuration.

## Quality checks

```bash
npm run test         # one Vitest run
npm run test:watch   # interactive watch mode
npm run lint
npm run format:check
npm run build
```

`npm run format` writes formatting changes. `npm run watch` watches development builds. No browser-based end-to-end runner is configured; check browser console manually when running app.
