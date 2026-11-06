# DayFlow

**DayFlow V3 — Personal Operations OS**

A local-first personal workspace built around one device-owned data store. The application is designed for a shared React codebase that can run as a browser-installed PWA and inside a future Capacitor Android shell.

## V3 principles

- The device is the source of truth for tasks and projects.
- No MongoDB, hosted task database, account-based task sync or direct ChatGPT integration.
- Local PostgreSQL through PGlite; the current browser build persists it in IndexedDB.
- All five existing modules remain part of the product: PHFI Research, Career Operations, AGM Studio / Business, Projects Lab, and Systems & Access.
- Task changes are stored locally and remain available offline after the app has loaded successfully.
- Gmail integration is planned as a separate, explicit, read-only metadata sync through a native local MCP service. It is not implemented in this milestone.
- User task contents and Gmail metadata are not sent to the DayFlow Vercel deployment.

## Implemented in this branch

- React + TypeScript + Vite application shell.
- PGlite database persisted with the IndexedDB filesystem.
- Versioned schema migration and task create/read/update/status/archive operations.
- Local task event history.
- Responsive Today dashboard and five-module navigation.
- Search, quick capture and task edit modal.
- PWA manifest, offline asset caching and prompted service-worker updates.
- TypeScript, ESLint, Vitest and Playwright quality gates.

## Not yet implemented

Native Android/Capacitor project, Android private file workspace, encrypted backup/restore, database encryption, vector search, Gmail OAuth/sync/MCP, Android background work, native widgets and production release workflow.

## Storage and privacy

The current web app uses PGlite's IndexedDB filesystem. This is persistent browser-origin storage, not a user-visible folder and not a substitute for encrypted backups. Clearing browser/site data or uninstalling a browser profile can remove it. The app does not currently claim end-to-end encryption.

The Android shell will add an app-private DayFlow workspace and native backup/export support. OPFS will be evaluated separately for compatible Chromium runtimes; it is not assumed to work across every browser.

Do not enter PHFI participant or child study data into DayFlow.

## Development

Requirements: Node.js 22.13+ and npm.

```bash
npm install
npm run dev
```

Quality gates:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## Release policy

The V3 migration is developed on `architecture/v3-local-first-gmail-mcp`. The legacy `main` branch and its archive are preserved until the V3 build, local persistence, browser tests and Vercel preview are verified. Do not switch production framework settings or remove legacy files before those gates pass.

## Architecture

See [docs/architecture-v3-local-first.md](docs/architecture-v3-local-first.md).
