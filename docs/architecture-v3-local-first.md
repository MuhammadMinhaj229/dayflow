# DayFlow V3 — Local-First Personal Operations OS

**Architecture decision record and implementation blueprint**  
**Research date:** 7 November 2026  
**Status:** Active V3 implementation; see `docs/implementation-status.md` for verified scope and `docs/release-checklist.md` for release gates  
**Product continuity:** Preserve the DayFlow V2 product scope and five existing modules  
**Data policy:** Local-first; no MongoDB, no hosted task database, no direct ChatGPT integration

---

## Implementation note

This document records the target architecture and design decisions. It is not evidence that every proposed module or native capability has shipped. The live implementation status, automated test coverage and outstanding release blockers are tracked separately in `docs/implementation-status.md` and `docs/release-checklist.md`.

---

## 1. Executive decision

DayFlow V3 remains the personal operations workspace defined in the V2 specification. This revision changes the storage and mobile integration layers; it does not introduce a new product or redefine its module structure.

### Confirmed product surface

- **Today:** daily agenda, urgent tasks, overdue tasks, module progress and next actions.
- **Module Deck:** five large Coverflow/Card cards.
- **Quick Capture:** create a task, note, lead or reminder and assign it to an existing module.
- **Workspace:** complete editing of projects, milestones, tasks, subtasks, timelines, notes, priorities, statuses, recurrence and progress.
- **Refresh App:** automatic release detection, safe download and application update.
- **Settings:** local storage, backup/restore, integrations, Gmail sync, security and update state.

### Non-negotiable principles

1. The device is the source of truth for DayFlow records.
2. No MongoDB, Atlas, hosted Postgres or remote task database.
3. GitHub stores source code only; Vercel serves application releases only.
4. The PWA must work offline after its assets and local data have been initialized.
5. The app creates its private data workspace on first launch without asking for shared-storage permission.
6. Database, vector index, task history, notes and Gmail sync metadata remain local.
7. Backups are encrypted, portable and restorable; app-private storage alone is not a backup.
8. Gmail is connected using explicit Google OAuth and the Gmail API, through a device-resident integration service.
9. An on-device MCP server exposes a deliberately narrow Gmail toolset. It is not connected to ChatGPT.
10. Updates must not interrupt an active edit, transaction, migration or Gmail sync.
11. The existing PHFI research boundary remains: DayFlow may track project-level work but must not contain child/participant records, research responses or identifiable study data.

---

## 2. Platform decision: one React application, PWA plus Android shell

### Shared application

- React + TypeScript + Vite static application.
- One shared domain model, component library, design system and repository/service layer.
- Vercel hosts the web PWA.
- The same web build is packaged in a Capacitor Android shell for native filesystem, secure credential, background-work and local-MCP capabilities.

This avoids maintaining two independent frontend applications. The browser PWA remains useful on desktop and mobile browsers; the Android package adds native capabilities that a browser-installed PWA cannot provide.

### Important filesystem boundary

A browser PWA cannot silently create a normal, user-visible folder in Android shared storage. The browser's Origin Private File System (OPFS) is automatically accessible to the origin, but it is private to the app origin and is not shown as an ordinary folder in Android Files. Shared Downloads/Documents access requires the Android Storage Access Framework/file picker and user permission.

Therefore DayFlow uses two clearly defined locations:

**A. Primary database workspace**

- PGlite database in the browser/WebView's origin-private storage.
- Preferred filesystem: PGlite OPFS AHP, running inside a Web Worker when supported.
- Fallback filesystem: PGlite IndexedDB VFS.
- Logical database namespace: `dayflow-v3`.
- Database and vector index are the primary source of truth.

**B. Native app-private file workspace**

Created by the Capacitor Android layer on first launch:

```text
Android app-private files/
└── DayFlow/
    ├── backups/
    ├── exports/
    ├── imports/
    ├── attachments/
    ├── diagnostics/
    └── update-manifests/
```

This location is for encrypted database snapshots, file attachments, imports, exports and diagnostics. It is not a second competing task database. The Android app-private directory is not generally available to other apps and is removed when the application is uninstalled. Users must export a recovery archive to a location they control (for example, Downloads or Drive) before uninstalling or changing devices.

**User-visible folder:** provide an explicit “Choose backup folder” action using the Storage Access Framework. Do not silently request broad storage access.

### Storage feature detection

At first launch:

1. Detect secure context, OPFS, Web Worker and storage APIs.
2. Call `navigator.storage.persist()` where supported and display whether persistent storage was granted.
3. Record `navigator.storage.estimate()` usage/quota and warn before space becomes critical.
4. Initialize PGlite in a worker with `opfs-ahp://dayflow-v3/` when supported.
5. Fall back to `idb://dayflow-v3` when OPFS is not available.
6. Run schema migrations transactionally.
7. Create the native private `DayFlow/` file workspace through the Android bridge.
8. Verify a write/read/delete round-trip before showing the app as ready.

PGlite OPFS AHP is worker-based and currently documented for Chrome and Firefox, not Safari. The Android WebView build must be tested on the actual target device; keep the IndexedDB fallback even if OPFS passes the first test.

---

## 3. Data engine: PGlite + pgvector

### Selected engine

**PGlite + pgvector** is the selected local database and vector-search engine.

Why:

- PostgreSQL relational model supports projects, tasks, dependencies, event history, integrations and structured search.
- pgvector stores embeddings alongside their source records.
- PGlite runs in WebAssembly inside the browser without a separate database daemon.
- It supports persistent browser filesystems, including IndexedDB and OPFS.
- Its worker/multi-tab design handles a single database instance shared by browser tabs.
- It prevents us from introducing one local database for tasks and another unrelated vector store for search.

Do not run a hosted Postgres service. Do not send local database contents to Vercel.

### Data access architecture

UI components must never import PGlite directly.

```text
React screens
    ↓
Domain use-cases / application services
    ↓
Repository interfaces
    ↓
PGlite adapter
    ├── relational SQL
    ├── pgvector search
    ├── live/reactive queries
    └── schema migrations
```

Use typed repository contracts and validated input schemas. Keep all writes transactional. Generate UUIDs on-device. Record edits in an append-only task event/audit table. Use soft delete with undo for ordinary deletion; provide explicit permanent deletion in settings.

### Core schema

The original V2 data model remains the base. Add fields only where needed by implementation.

- `modules`: existing five module definitions and display order.
- `projects`: name, objective, owner, module, state, priority, target date, links, progress method and metadata.
- `milestones`: project, due date, weight, status, acceptance criteria.
- `tasks`: module/project, parent task, title, description, status, priority, due/start/end times, recurrence, estimate, weight, source, completion timestamps.
- `task_events`: append-only created/updated/completed/rescheduled/deleted events with before/after values.
- `checklist_items`: ordered task checklist rows.
- `time_blocks`: scheduled work blocks and actual time.
- `tags`, `task_tags`: flexible organisation and filtering.
- `contacts`, `opportunities`, `outreach_events`, `referrals`: Career and business tracking.
- `subscriptions`, `integrations`: inventory and connection states.
- `vault_items`: encrypted local secret payloads; never plaintext API keys.
- `documents`: project notes, decision records, meeting notes and selected user-saved content.
- `document_chunks`: deterministic text chunks with source metadata.
- `embeddings`: vector, model ID/version, source ID, chunk ID and metadata.
- `gmail_accounts`, `gmail_sync_state`, `gmail_messages`, `gmail_threads`, `gmail_labels`: local Gmail metadata and sync cursor.

Do not add PHFI participant/child records, trial responses or identifiable research datasets to these tables.

### Vector-search behaviour

- Local embedding model runs using Transformers.js.
- Prefer WebGPU where available; use WASM fallback.
- Download model assets only on first opt-in use; cache them locally.
- Keep the embedding model/version recorded with each vector.
- Start with exact/flat vector search for small collections; benchmark before adding HNSW tuning.
- Combine PostgreSQL full-text search and vector similarity using a hybrid ranking strategy.
- Semantic search is optional. Task creation, completion, editing and filtering must work without the model installed.
- Do not embed Gmail bodies, secrets or restricted research data by default.

### Multi-tab and recovery

- Run PGlite in a Worker; use the supported multi-tab worker pattern.
- Serialize writes and expose transaction state to the update manager.
- Use schema migrations with explicit version numbers.
- Never clear OPFS/IndexedDB on application update.
- On startup, verify schema version and the latest completed migration.
- If startup or migration fails, preserve the old snapshot and enter recovery mode rather than silently resetting the user's data.

---

## 4. Android storage and native bridge

### Native layer: Capacitor + Kotlin

Capacitor is the bridge between the shared Vite/React UI and Android services.

Native capabilities:

- Create and manage the private `DayFlow/` folder tree.
- Save encrypted backup files and user-requested exports.
- Import a backup through Android's system file picker.
- Store OAuth credentials and device secrets using Android Keystore-backed secure storage.
- Run WorkManager jobs for best-effort background sync.
- Host the local Gmail MCP server.
- Publish local sync/update status to the shared UI.
- Manage app lifecycle, network state and native notifications where enabled.

Avoid broad storage permissions. Use app-private storage for working files and Storage Access Framework for files the user intentionally shares.

### Database encryption boundary

Android app-private internal storage is protected by Android's application sandbox and device encryption, but the browser database itself is not automatically equivalent to a SQLCipher database. We must not advertise the PGlite store as transparently database-encrypted.

Required protections:
- OS/device encryption and app-private storage.
- Encrypted backup archives using AES-GCM and a user-controlled recovery passphrase.
- Encrypt vault payloads separately; keep keys in Android Keystore where native.
- Do not persist OAuth access tokens or refresh tokens in normal task tables.
- PWA browser tokens remain short-lived/in memory; request renewed consent when required.
- Lock screen/biometric protection can be added to the Android shell without claiming it protects against a compromised device or malicious application update.

If transparent per-file database encryption becomes a hard requirement, run a separate technical spike on native SQLCipher plus a supported vector extension before changing the selected data engine. Do not introduce a second primary database without a proven migration path.

---

## 5. Gmail integration: local MCP + Gmail API

### What “local Gmail MCP” means

The installed Gmail Android application does not expose its private local database to DayFlow. DayFlow must connect to the user's Google account through explicit OAuth authorisation and use the official Gmail API. This is safer and more supportable than trying to read Gmail's private app files or notification internals.

MCP is the tool protocol; it is not the email synchronisation engine. The actual synchronisation is performed by a Gmail Sync Service using Gmail API list/get/history operations. The MCP server exposes a controlled local tool interface to that service.

### On-device service layout

```text
Capacitor Android app
    ├── Google OAuth / Android secure token provider
    ├── GmailSyncService
    │     ├── initial metadata sync
    │     ├── incremental history sync
    │     ├── reply/draft/sent classification
    │     └── local PGlite writes
    ├── WorkManager background trigger
    └── Local MCP server (Kotlin SDK + Ktor)
          ├── gmail.profile
          ├── gmail.sync_now
          ├── gmail.sync_status
          ├── gmail.list_recent
          ├── gmail.search_local
          ├── gmail.get_thread_metadata
          └── dayflow.create_follow_up_task
```

The MCP server binds to loopback only, uses a per-install random local authentication secret, and is not exposed on the public network. DayFlow's own Android UI should use the native bridge to reach the same service; an optional Streamable HTTP MCP endpoint allows another explicitly authorised local MCP client to connect while the service is running.

No ChatGPT endpoint, bearer token, plan-import endpoint or ChatGPT connector is part of this architecture.

### OAuth permissions

Start with the least data required:

1. Initial phase: Gmail metadata only (headers, labels and IDs; no message bodies).
2. The Gmail metadata scope does not permit the Gmail search `q` parameter, so local filtering or label-based list requests are required.
3. If Gmail-native query syntax or message bodies are genuinely necessary, request the broader read-only scope separately and complete Google's OAuth verification requirements.
4. No send, trash, permanent delete, mark-read or label-modification tools in the first release.
5. Add draft creation only in a later phase, with a separate scope request and explicit user confirmation.

The Gmail metadata and read-only scopes are restricted scopes. Approval/verification requirements must be reviewed before distributing the application beyond development/testing. Do not assume that a local-only database removes Google's OAuth obligations.

### Local email data minimisation

Default local fields:
- Gmail message ID and thread ID.
- Sender and recipients.
- Subject.
- Internal date.
- Label IDs/names.
- Draft/sent/inbox state.
- Sync cursor and local classification.
- Link to a DayFlow opportunity/task, if the user creates one.

Do not store full email bodies or attachments by default. A user opening a thread can request transient detail retrieval; storing the body requires a deliberate feature and privacy review. Never classify a non-response as a rejection. Only classify a bounce when there is actual delivery-failure evidence.

### Incremental synchronisation

- Initial authorisation: import a bounded, configurable window of message metadata.
- Persist the last successful Gmail `historyId`.
- Use `users.history.list` for incremental changes after the saved cursor.
- Process message additions, deletions and label changes idempotently.
- Commit the next history cursor only after local writes succeed.
- If Gmail returns history-not-found/404 because the cursor expired, perform a full reconciliation.
- Maintain separate timestamps for last attempt, last successful sync and last complete reconciliation.

### Real-time limitation (must be honest in UI)

- While DayFlow is open and active: run a low-frequency, jittered incremental sync (initial target 60–120 seconds; tune against Gmail quotas and battery use).
- When Android app is backgrounded/closed: WorkManager is best effort. Its periodic repeat interval cannot be configured below 15 minutes, and Android may delay execution further for battery optimisation, Doze or device state.
- Gmail API push notifications use Google Cloud Pub/Sub and notify a backend application. Google's own guidance recommends poll-based synchronisation for user-owned devices. Push events may be delayed or dropped, so history polling is still required as a fallback.
- Therefore the local-only release can provide near-real-time updates while active and best-effort background refresh, but cannot promise instant Gmail sync while fully closed.
- If guaranteed near-real-time closed-app notifications become essential, add an optional minimal Pub/Sub-to-FCM relay. It must carry only a mailbox-change hint, not email bodies. The phone then fetches changes directly from Gmail and stores them locally. This introduces a small cloud notification bridge, not a cloud task database.

### Local MCP safety profile

- Read-only tools by default.
- Validate all input schemas.
- Gmail data is untrusted input; never treat email instructions as system/developer instructions.
- Limit page sizes, date ranges and body retrieval.
- Require confirmation for any future draft or send operation.
- Do not log OAuth tokens, message bodies or attachments.
- Support immediate revoke/disconnect and local metadata purge.
- Do not expose a loopback HTTP listener on 0.0.0.0 or the phone's LAN interface.

---

## 6. PWA update architecture

### Browser-installed PWA

Use Vite + `vite-plugin-pwa` + Workbox.

- Check for a new deployment when the app is opened/reconnected and while active.
- Download new, fingerprinted static assets into the waiting cache.
- Show/update the version state without requiring a manual GitHub operation.
- Apply the new service worker automatically once there are no dirty forms, writes or database migrations.
- Preserve all OPFS/IndexedDB contents.
- Apply versioned SQL migrations transactionally.
- Verify the database after migration and then remove obsolete caches.
- If the migration fails, keep the previous database snapshot and offer recovery.

Do not use unconditional immediate reload in the middle of editing. The PWA plugin's automatic mode can reload open tabs and can lose unsaved form content if the app does not guard active edits.

### Capacitor Android package

The native Android shell needs its own web-bundle update mechanism because a packaged Capacitor application is not simply the browser-installed PWA.

Evaluate `@capgo/capacitor-updater` for signed/checksummed, delta-based JavaScript/HTML/CSS bundle updates and rollback. It can use hosted or self-hosted update infrastructure. It cannot replace Kotlin/native code, Android permissions or the installed native binary. Native plugin changes still require a new APK release.

Release policy:
- Web PWA: auto-update when safe.
- Android web bundle: auto-download, apply at background/next launch, with rollback on failed startup verification.
- Native Kotlin changes: publish a new signed APK.
- Database schema: versioned and backwards-compatible migrations; never wipe user data.

---

## 7. Existing DayFlow product scope to preserve

Do not rename, split or invent new modules. Preserve all five V2 modules:

1. **PHFI Research:** Kannada Word Reading prototype, Data Programmer presentation and FieldTrack project tracking. No participant records or research response data in DayFlow.
2. **Career Operations:** opportunity pipeline, Gmail activity tracking and referrals.
3. **AGM Studio / Business:** Noman Brothers, business outreach, client delivery and future CRM/billing opportunities.
4. **Projects Lab:** technical and personal project registry.
5. **Systems & Access:** subscriptions, integrations and encrypted credential inventory.

Each card retains the existing priority/deadline/progress/blocker/next-action pattern. Progress remains weighted and explainable:

`progress = completed active weights / total active weights × 100`

Cancelled/archived records are excluded. A percentage must not be fabricated when the module has no defined weighted tasks/milestones.

---

## 8. UI and interaction architecture

Preserve the V2 visual direction:
- Warm ivory, sage, forest green and restrained muted gold.
- Large thumb-friendly controls, clean typography and line icons.
- Today dashboard as the daily command centre.
- Five prominent Module Deck cards with partial neighbouring cards.
- Horizontal gesture for module changes; vertical scrolling within a workspace.
- Project detail cards with priority, target date, weighted progress, blocker and next action.
- Quick Capture always available.
- Settings kept compact rather than adding more top-level navigation.

Use Swiper React Coverflow/Cards for the lightweight 3D card movement. Keep transforms light for Android GPUs and respect `prefers-reduced-motion` with a flat-card fallback. Do not add Three.js or a heavy real-time 3D scene engine.

### Every-editable requirement

Every editable entity must support:
- Create.
- View.
- Edit.
- Complete/reopen where applicable.
- Reschedule.
- Reorder.
- Archive.
- Delete with undo.
- Permanent delete through an explicit recovery-aware action.
- Activity history showing what changed and when.

The Gmail mirror is intentionally different: Gmail-origin fields are read-only in the first release, while DayFlow annotations, follow-up tasks, local tags and notes remain editable.

---

## 9. Repository and tool research

### Primary selections

| Resource | Role | Decision |
|---|---|---|
| [electric-sql/pglite](https://github.com/electric-sql/pglite) | Embedded browser PostgreSQL, pgvector, IndexedDB/OPFS | Primary local database; Apache-2.0 |
| [vite-pwa/vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) | Manifest, service worker, Workbox, update lifecycle | Primary PWA update mechanism |
| [modelcontextprotocol/kotlin-sdk](https://github.com/modelcontextprotocol/kotlin-sdk) | Native Kotlin MCP server/client SDK | Primary local MCP SDK; mixed Apache-2.0/MIT history |
| [Cap-go/capacitor-updater](https://github.com/Cap-go/capacitor-updater) | OTA updates for Capacitor web bundle | Android-shell update candidate; MPL-2.0 |
| [microsoftedge/Demos/tree/main/pwa-to-do](https://github.com/MicrosoftEdge/Demos/tree/main/pwa-to-do) | Browser-local SQLite/OPFS implementation reference | Study storage and export patterns |
| [PhuCG/pwa-starter-kit](https://github.com/PhuCG/pwa-starter-kit) | React/Vite/TypeScript local-first PWA with Dexie | Lightweight starter reference, not the product foundation |

### Alternatives reviewed

- **Dexie.js:** mature IndexedDB abstraction. Good browser-only fallback or smaller application store, but not the chosen vector engine.
- **sqlite-vec:** browser/WASM and native-compatible vector extension, but its upstream project explicitly warns it is pre-v1 and may make breaking changes. Do not make a critical production index depend on it without a version-pinning and migration strategy.
- **@capacitor-community/sqlite:** useful native SQLite/SQLCipher option. Reconsider only if native database encryption or filesystem placement becomes more important than sharing PGlite/pgvector across the PWA and Android WebView.
- **LanceDB:** promising embedded vector/retrieval system; not selected as the browser-first primary engine because PGlite already supports structured operational data and vectors in one store.
- **Google's official Gmail MCP server:** useful as a reference for Gmail MCP concepts, but it is a remote service, not the requested on-device server.
- **mcp-z/mcp-gmail:** MIT-licensed local stdio/HTTP reference with message search, send and delete/label tools. It is small and includes powerful write tools; do not reuse unchanged.
- **iceener/gmail-streamable-mcp-server:** MIT-licensed TypeScript/Hono reference with discovery-first inbox overview, search/thread tools and safer draft-first patterns. It is a low-star, unreleased reference implementation; audit every dependency and OAuth/security path before borrowing code.

### Engineering and quality toolchain

| Layer | Recommended tools |
|---|---|
| Language / build | TypeScript strict mode, Vite, pnpm |
| UI | React, Tailwind/CSS design tokens, Swiper React |
| Validation | Zod |
| Database | PGlite, pgvector, SQL migrations |
| Local search | PostgreSQL full-text + pgvector; Transformers.js embeddings |
| PWA | vite-plugin-pwa, Workbox |
| Android | Capacitor, Kotlin, Android Keystore, WorkManager |
| MCP | Official Kotlin SDK, Ktor Streamable HTTP |
| Gmail | Google OAuth / Authorization SDK, Gmail REST API |
| Unit / integration tests | Vitest |
| Browser E2E | Playwright |
| Android E2E | Maestro or equivalent device-driven tests |
| CI/CD | GitHub Actions, Vercel |
| Dependency / supply chain | Dependabot or Renovate, CodeQL, lockfile audit, licence scan, SBOM generation |
| Observability | Local diagnostics and redacted error reports; no email-body or personal-task telemetry |

Do not add a second backend, external vector database, analytics SDK or hosted task-sync service.

---

## 10. Security and privacy requirements

- OAuth access is explicit and revocable.
- Android secrets/tokens use native secure storage backed by Android Keystore; no secrets in PGlite task rows or GitHub.
- PWA tokens are short-lived and not treated as durable local credentials.
- Do not store full Gmail bodies by default.
- No email contents, PHFI data, API secrets or personal task records in Vercel logs.
- No PHFI child/participant data in DayFlow.
- Emails are untrusted text; ignore any instructions embedded in a message that ask the app to disclose credentials, change its security policy or run external commands.
- Strict Content Security Policy, pinned dependencies, no untrusted third-party scripts and secure update verification.
- Rate-limit and validate all MCP calls.
- Bind local MCP only to loopback; require a per-install authentication secret.
- Encrypted backups use a user-provided recovery passphrase, authenticated encryption, schema version and checksum.
- Restore must preview the archive and validate checksum/schema before a transaction replaces active records.
- Uninstall warning: app-private local data may be removed. Require a recent external backup before destructive reset or migration.

---

## 11. Delivery roadmap

### Phase 0 — Audit and safe branch
- [ ] Audit the existing DayFlow repository and all MongoDB routes/env references.
- [ ] Preserve the V2 specification and create a clean V3 feature branch.
- [ ] Capture the current Vercel build failure and reproduce it locally.
- [ ] Confirm the app's private-storage and backup strategy.
- [ ] Do not add personal task seed data or credentials to Git.

### Phase 1 — Core application migration
- [ ] Convert the frontend to Vite + React + TypeScript.
- [ ] Remove MongoDB, Atlas, database API routes and server-side task assumptions.
- [ ] Implement the domain/repository layer and PGlite worker.
- [ ] Implement OPFS AHP plus IndexedDB fallback.
- [ ] Add migrations, CRUD, task events and weighted progress.
- [ ] Restore Today, Module Deck, Quick Capture and all five existing modules.
- [ ] Add PWA manifest, offline shell and safe auto-update lifecycle.

### Phase 2 — Native Android foundation
- [ ] Add Capacitor Android shell.
- [ ] Create app-private DayFlow workspace automatically on first launch.
- [ ] Add native backup/import/export bridge.
- [ ] Add encrypted backup/restore and recovery UI.
- [ ] Test actual Android WebView OPFS support and IndexedDB fallback.
- [ ] Verify cold launch, force stop, reboot, offline launch and app update without local-data loss.

### Phase 3 — Local vector search
- [ ] Install Transformers.js behind an optional feature gate.
- [ ] Select and benchmark a small multilingual embedding model.
- [ ] Chunk project notes and user-selected documents.
- [ ] Store vector/model/source metadata in pgvector.
- [ ] Implement hybrid lexical/vector search.
- [ ] Add search result provenance and “open original record”.

### Phase 4 — Gmail and local MCP
- [ ] Register Google Cloud OAuth application.
- [ ] Complete scope and OAuth policy review.
- [ ] Implement native Google account authorisation.
- [ ] Implement Gmail metadata initial sync.
- [ ] Implement incremental Gmail history sync and full-resync fallback.
- [ ] Persist local Gmail cursor and message/thread metadata.
- [ ] Implement local Kotlin MCP server with read-only toolset.
- [ ] Add local follow-up task creation from a selected thread.
- [ ] Add WorkManager best-effort background sync and sync-state UI.
- [ ] Test token revocation, expiry, account disconnect and local cache retention.
- [ ] Decide whether closed-app near-instant notification relay is worth the additional Google Cloud Pub/Sub/FCM component.

### Phase 5 — Production hardening
- [ ] Playwright PWA suite and Android device-driven suite.
- [ ] Accessibility, reduced-motion and Samsung viewport validation.
- [ ] Test database quota/eviction and persistence requests.
- [ ] Test backup corruption, restore failure and recovery.
- [ ] Test schema migration rollback.
- [ ] Test auto-update during a dirty form and active database transaction.
- [ ] Test Gmail cursor expiration, duplicate history events and offline recovery.
- [ ] Add SBOM, dependency, licence and CodeQL gates.
- [ ] Deploy Vercel production PWA and package signed Android APK.
- [ ] Verify native and web update channels separately.

### Phase 6 — Optional advanced functions
- [ ] Gmail draft creation after separate consent.
- [ ] Optional Pub/Sub-to-FCM bridge for closed-app change notifications.
- [ ] Optional device-to-device encrypted backup transfer.
- [ ] Native Android home-screen widget.
- [ ] More local document formats and semantic-search filters.

---

## 12. Release acceptance criteria

The V3 release is not production-ready until these pass:

1. Create/edit/complete/reschedule/archive/delete tasks with no network.
2. Close the app, force stop it, reboot the device and verify records persist.
3. Install the PWA and Android package on the target Samsung device.
4. Confirm private DayFlow workspace creation without broad storage permission.
5. Confirm database startup in OPFS and verified fallback in IndexedDB.
6. Confirm app storage quota and persistence status are visible.
7. Export an encrypted backup, clear a test database and restore it successfully.
8. Validate backup checksum and archive version before restore.
9. Update the web app automatically while connected, without losing active edits or local data.
10. Update the Capacitor web bundle and confirm rollback after a deliberately failed startup test.
11. Confirm native APK updates are not incorrectly treated as web-bundle updates.
12. Connect Gmail using explicit OAuth; verify metadata-only local sync.
13. Apply incremental history sync, deduplicate events and recover from an expired history cursor.
14. Verify the local MCP endpoint is loopback-only and cannot be reached over the LAN.
15. Verify all Gmail MCP tools are read-only in the first release.
16. Verify disconnected Gmail does not delete the user's locally cached DayFlow tasks.
17. Confirm no Gmail message body, OAuth token, personal task or PHFI participant data appears in logs, analytics, source maps or Git.
18. Verify reduced-motion mode and all module navigation without 3D transitions.

---

## 13. Known constraints and decisions still requiring a technical spike

- PGlite OPFS AHP must be verified in the exact Android WebView version used by the packaged app. IndexedDB is the fallback.
- OPFS is a private origin filesystem, not a user-visible folder. The Capacitor app-private folder is for archives and files. User-visible Downloads access requires an explicit picker.
- PGlite browser persistence is not itself transparent database encryption. Device encryption, app-private storage, encrypted backups and a dedicated vault are separate protections.
- Gmail metadata-only scope does not support Gmail's `q` search parameter. Broader read-only scope requires a separate privacy/OAuth decision.
- Gmail push notifications are server-mediated and may be dropped or delayed. A local-only device implementation cannot guarantee instant sync when the app is closed.
- Android WorkManager's minimum periodic interval is 15 minutes and execution may be delayed. It is not a real-time scheduler.
- Capgo updates web assets, not native Kotlin code or permissions.
- No direct ChatGPT connector, MCP endpoint or task-import API is part of V3.

## 14. Research references

- PGlite: https://github.com/electric-sql/pglite
- PGlite filesystems: https://pglite.dev/docs/filesystems
- PGlite worker / multi-tab: https://pglite.dev/docs/multi-tab-worker
- PGlite extensions / pgvector: https://pglite.dev/extensions/
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- Browser storage quotas and persistence: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Vite PWA: https://github.com/vite-pwa/vite-plugin-pwa
- Vite PWA auto-update guidance: https://vite-pwa-org.netlify.app/guide/auto-update
- Workbox service worker lifecycle: https://developer.chrome.com/docs/workbox/service-worker-lifecycle
- Android storage overview: https://developer.android.com/training/data-storage
- Android app-specific files: https://developer.android.com/training/data-storage/app-specific
- Android WorkManager periodic work: https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work
- Capacitor SQLite alternative: https://github.com/capacitor-community/sqlite
- Capacitor updater: https://github.com/Cap-go/capacitor-updater
- Kotlin MCP SDK: https://github.com/modelcontextprotocol/kotlin-sdk
- Gmail API sync: https://developers.google.com/workspace/gmail/api/guides/sync
- Gmail API push: https://developers.google.com/workspace/gmail/api/guides/push
- Gmail API scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Google OAuth token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Gmail MCP reference: https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server
- Gmail MCP sample (reference only): https://github.com/iceener/gmail-streamable-mcp-server
- Local Gmail MCP sample (reference only): https://github.com/mcp-z/mcp-gmail
- OPFS PWA demo: https://github.com/MicrosoftEdge/Demos/tree/main/pwa-to-do
- Dexie PWA starter reference: https://github.com/PhuCG/pwa-starter-kit

---

**Implementation rule:** this document is the target architecture. Build in small verified phases on a feature branch. Do not replace `main`, change the production deployment or introduce personal data until the matching acceptance gates pass.
