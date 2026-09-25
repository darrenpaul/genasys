# Genesys

Client-rendered, standalone Angular 22 workspace for the [Customer and Quote Management tutorial](docs/angular-tutorial/README.md). Feature pages, API services, and realistic seed records belong to later tutorial chapters; this is the tooling baseline.

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

Open `http://localhost:4200/`. `dev` starts Angular and JSON Server together; `npm run start` and `npm run api` start them separately. JSON Server listens on `127.0.0.1:3000`. Angular's development proxy removes `/api` before forwarding: `http://localhost:4200/api/customers` maps to JSON Server's `/customers`. Browser services should use relative `/api` URLs. This proxy only exists during `ng serve`; production hosting needs its own API routing.

`server/db.seed.json` is tracked and initially contains empty `customers` and `quotes` collections. `npm run api` creates ignored `server/db.json` on first run, then preserves edits across restarts. `npm run db:reset` **overwrites local database**, restoring seed. Add realistic fake records to the seed in the domain-model chapter. JSON Server 1.0.0-beta.15 generates its own string ID on POST even if request includes `id`; use returned ID for later requests. JSON Server is a development mock, not a production backend. Do not put secrets in browser configuration.

## Quality checks

```bash
npm run test         # one Vitest run
npm run test:watch   # interactive watch mode
npm run lint
npm run format:check
npm run build
```

`npm run format` writes formatting changes. `npm run watch` watches development builds. No browser-based end-to-end runner is configured; check browser console manually when running app.
