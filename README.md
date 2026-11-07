# DayFlow

**DayFlow V3 — Personal Operations OS**

DayFlow is a local-first personal workspace with one shared React + TypeScript codebase for the browser PWA and the Capacitor Android shell. The device owns task and project records; the web deployment serves static application assets only.

## Product and data principles

- No MongoDB, hosted task database, account-based task sync or direct ChatGPT integration.
- Five existing modules: PHFI Research, Career Operations, AGM Studio / Business, Projects Lab, and Systems & Access.
- PGlite provides the local PostgreSQL-compatible database. The current web and Android WebView build uses IndexedDB persistence.
- Task and project data stay in the device/browser origin. They are not sent to the DayFlow Vercel deployment.
- Do not enter PHFI participant or child study data, identifiable research records or responses into DayFlow.
- Gmail metadata sync/MCP is a planned optional integration and is not part of the current release.

## Implemented in this branch

- React 19 + TypeScript + Vite application, responsive Today dashboard and five-module navigation.
- PGlite database in a dedicated worker, versioned migrations and local task/project repositories.
- Task editing for module, project, subtask parent, priority, due date, start time, estimate, progress, next action, blocker and notes.
- Task status history, project history, hierarchy validation, reversible task/project archive batches and restore.
- Encrypted workspace export/import using AES-256-GCM with a PBKDF2-SHA-256 passphrase-derived key.
- PWA manifest and project-owned service worker. The offline precache includes the PGlite JavaScript, WASM and .data assets, so the database can initialise after a cold offline reload.
- Android Capacitor shell bootstrap, app-private DayFlow workspace, Android system file picker for backup import/export, and Android Keystore AES-GCM primitives for device secrets.
- GitHub Actions gates for dependency audit, TypeScript, ESLint, unit/database tests, production build, Playwright offline and multi-tab persistence under CSP, Android debug APK compilation, and Android emulator launch/private-workspace smoke tests.

## Known release gaps

These are not represented as completed features:

- Gmail OAuth, incremental metadata sync, local MCP server and Android background sync.
- Vector/semantic search and local embedding model lifecycle.
- Dedicated milestone, time-block, contacts/opportunities/referrals, subscription and integration-management data screens beyond the current task/project workspace.
- A signed Android release, Play Store distribution, native web-bundle updater/rollback, physical-device acceptance tests and store signing/secret configuration.
- Transparent database encryption at rest. The PGlite database in browser-origin IndexedDB is **not** a SQLCipher-equivalent encrypted database.
- A biometric app lock and native home-screen widget.

## Storage and recovery boundaries

### Browser PWA

The primary database is stored in browser-origin IndexedDB. It is private to the site origin, not a normal user-visible folder. The browser persistent-storage request may reduce automatic eviction where granted, but it does not prevent a user, browser, profile reset or device reset from clearing the data.

The app reports browser storage usage/quota and persistence state. Keep regular encrypted backups outside this device. The encrypted backup is portable; the database itself is not transparently encrypted at rest.

### Android shell

On first native launch, DayFlow creates an app-private DayFlow directory for backups, exports, imports, attachments, diagnostics and update manifests. It uses Android's Storage Access Framework when the user explicitly chooses an external backup location. It does not request broad shared-storage permissions.

The primary PGlite database still resides in the WebView's browser-origin storage. App-private backup files are not a second task database. Android app-private data is removed when the app is uninstalled; export a recovery backup before uninstalling or changing devices.

## Development

Requirements: Node.js 22.13+ and npm.

```bash
npm ci
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
npm run android:bootstrap
npx cap sync android
cd android && ./gradlew :app:assembleDebug
```

## Release workflow

Development happens on the architecture/v3-local-first-gmail-mcp branch. The legacy main branch and its archive remain untouched as rollback sources.

A Vercel preview is intentionally deferred until the required web and native changes are complete and CI is green. Do not switch the Vercel production framework/root-directory settings or change production environment variables as part of the preview build.

See docs/architecture-v3-local-first.md for the target architecture.
