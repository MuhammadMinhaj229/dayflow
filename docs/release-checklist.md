# DayFlow V3 — release checklist

**Release rule:** Do not create a Vercel preview or modify production deployment settings until all applicable gates below are complete and the user-approved release scope has been delivered.

## 1. Source and change control

- [ ] Work is committed to `architecture/v3-local-first-gmail-mcp`.
- [ ] `main` and `archive/pre-v3-main-2026-11-07` remain intact as rollback sources until the migration is accepted.
- [ ] A reviewable pull request exists and the final diff is checked for secrets, participant data, generated files and unrelated changes.
- [ ] Architecture and implementation-status docs match the shipped code.

## 2. Web/PWA release gates

- [ ] `npm ci` from the committed lockfile.
- [ ] `npm audit --audit-level=low` reports zero findings.
- [ ] `npm run typecheck` and `npm run lint` pass.
- [ ] All Vitest domain, migration, lifecycle and backup/restore tests pass.
- [ ] `npm run build` completes without a fatal bundle error.
- [ ] Playwright uses the built production preview, not the development server.
- [ ] CSP test verifies no `unsafe-eval` in `script-src`.
- [ ] Offline test installs the service worker, goes offline, reloads and reads local data.
- [ ] Multi-tab test confirms a committed change in one tab refreshes another tab.
- [ ] Task status and fields save atomically and audit history remains ordered.
- [ ] Backup round-trip, wrong-passphrase rejection, damaged-file rejection and relational integrity checks pass.

## 3. Android release gates

- [ ] Capacitor project generation and `cap sync` succeed from a clean checkout.
- [ ] Gradle builds `app-debug.apk`.
- [ ] Emulator installs and launches the APK.
- [ ] Emulator verifies the app-private `DayFlow/` directory and all six subfolders.
- [ ] No fatal startup exception appears in logcat.
- [ ] Private backup save/list/read and SAF import/export are exercised on an emulator/device.
- [ ] Physical-device acceptance covers Android WebView database startup, offline persistence, backup restore, interruption and low-storage cases.
- [ ] A signed release build uses user-controlled signing credentials held in GitHub/Vercel secret stores, not committed to the repository.
- [ ] Package identity, versionCode/versionName, app icon, adaptive icon, splash, privacy disclosures and Play Store metadata are reviewed.

## 4. Product-scope decisions still required

These are target-architecture items, not current shipped functionality:
- Gmail OAuth, Gmail metadata sync and local MCP server.
- pgvector semantic search and local embedding lifecycle.
- Milestone/time-block workflows and the remaining Career Operations and Systems & Access screens.
- Native updater/rollback, widget and biometric lock.
- Transparent encryption-at-rest for the primary database.

A product release cannot be described as fully matching the target architecture while these items remain out of scope or unimplemented. Gmail also requires a valid Google OAuth client configuration and consent/scope setup; signing and store release require user-owned credentials.

## 5. Vercel preview — last step only

Only after sections 1–4 are resolved or explicitly approved as deferred:

- [ ] Verify Vercel project settings and ensure preview changes do not alter production settings.
- [ ] Set preview build to `npm ci`, `npm run build`, output directory `dist`.
- [ ] Confirm no MongoDB/task database environment variables are required.
- [ ] Create a preview deployment only.
- [ ] Verify CSP, PWA install, service worker, cold offline restart and local database creation on the preview URL.
- [ ] Verify the deployment does not emit task/project data to Vercel or third-party analytics.
- [ ] Keep production domain and production deployment unchanged until a separate release decision.

## 6. Rollback

- [ ] Keep the previous `main` deployment as a rollback reference during migration.
- [ ] Do not delete the archive/rollback branch before user acceptance.
- [ ] A rollback must not overwrite or delete local database files. Backup/export guidance must be shown before changing origins or uninstalling the Android app.
