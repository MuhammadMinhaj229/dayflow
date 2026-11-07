# DayFlow V3 — implementation status

**Branch:** `architecture/v3-local-first-gmail-mcp`  
**Updated:** 7 November 2026

This page distinguishes implemented code from future target architecture. A green CI result proves the paths exercised by CI; it does not imply signed-store readiness or that unimplemented product modules are complete.

## Implemented in the current branch

### Web application and local data
- React + TypeScript + Vite SPA with the five DayFlow module areas.
- PGlite database in a dedicated worker, using IndexedDB persistence and versioned migrations.
- Task CRUD, atomic status/field changes, projects, project-linked tasks, subtasks, due dates, estimates, progress, next action, blocker and notes.
- Cycle and hierarchy validation in repository transactions.
- Task/project event history, reversible task and project archive batches, and restore.
- Cross-tab change notifications; changes are broadcast only after a successful commit, without broadcasting user content.
- Today, overdue, Inbox, Upcoming and Archive views.
- Project/task activity timelines and responsive desktop/mobile workspace.

### Recovery and offline
- AES-256-GCM encrypted backup files with PBKDF2-SHA-256 key derivation and versioned restore support.
- Restore validates the complete relational structure before replacing data and executes the replacement in a single database transaction.
- Browser storage health and persistent-storage request state are visible in Settings.
- PWA installation, safe service-worker update flow and an offline precache that includes PGlite JavaScript, WASM and data files.
- Playwright coverage for offline reload, task persistence and cross-tab consistency.

### Android foundation
- Capacitor Android shell generated reproducibly from checked-in native source.
- First-launch app-private `DayFlow/` directory with backups, exports, imports, attachments, diagnostics and update manifests.
- Android Keystore AES-GCM secret primitives.
- Android Storage Access Framework for user-selected import/export destinations.
- Listing and restoring encrypted backups stored in the app-private backup directory.
- GitHub Actions assembles a debug APK. The Android emulator smoke test is being added and is not considered passed until its CI result is green.

### Engineering and security gates
- Committed npm lockfile and CI installation using `npm ci`.
- `npm audit --audit-level=low`.
- TypeScript, ESLint, Vitest database/domain tests, production build and Playwright.
- Production-browser test uses the restrictive CSP policy configured for Vercel and does not add `unsafe-eval`.
- Android debug build and artifact checksum/upload.
- Node 24-compatible, SHA-pinned GitHub Actions.

## Not implemented yet

These items remain in the V3 target architecture or earlier product scope but are not shipped:

1. Gmail Google OAuth, Gmail history-cursor incremental metadata sync, local MCP server and scheduled/background sync.
2. pgvector semantic search, embedding model download/management and local RAG.
3. Full milestone and time-block workflows.
4. Dedicated Career Operations screens for contacts, opportunities, outreach events and referrals.
5. Complete Systems & Access workflows for subscription and integration inventory.
6. Native app-bundle update/rollback pipeline and native home-screen widget.
7. Signed Android release/Play Store distribution and physical-device acceptance.
8. Transparent encryption of the primary PGlite database at rest, biometric app lock and key-recovery UX.

## Important storage/security boundaries

- The PWA's PGlite database is stored in browser-origin IndexedDB. It is not a normal visible Android folder and is not transparently encrypted at rest.
- The Android shell's app-private `DayFlow/` directory holds files and backups; it is not a separate primary task database.
- Browser/site data, app-private data or device storage can be cleared. Keep a verified encrypted backup outside the device.
- Do not enter PHFI participant, child, identifiable research or study-response data into DayFlow.
- DayFlow does not connect task records to a hosted database or to ChatGPT. Gmail integration is not enabled in this build.

## Validation evidence

The latest fully green web/PWA run on an earlier V3 commit is [run 42356154018](https://github.com/MuhammadMinhaj229/dayflow/actions/runs/42356154018). It passed dependency audit, type check, lint, unit/database tests, production build and browser tests under the configured CSP. The Android debug build also passed in that run.

A newer commit adds Android emulator launch and private-directory smoke checks; treat that newer Android gate as pending until its own Actions run reports success. Use the current branch's latest CI run as the authoritative release evidence.
