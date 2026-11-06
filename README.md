# DayFlow — Personal Productivity OS

A Samsung One UI-inspired personal planner: one structured task model, a calm daily command center, MongoDB-backed persistence, and a path to a real Android home-screen widget.

> Initial MVP scaffold. MongoDB Atlas and production authentication require environment setup and verification before live use.

## Product direction
- Glance: today's progress and next actions.
- Plan: ordered tasks, priorities, time blocks and project context.
- Review: completed work, carry-over and next actions.
- Sync: explicit, idempotent import of finalized plans from ChatGPT or another trusted client.
- Mobile: responsive web app/PWA first; native Android Glance widget is Phase 2.

## Stack
- Next.js 16 App Router, React 19, TypeScript
- MongoDB Node.js driver 7 / MongoDB Atlas
- Tailwind CSS, custom Samsung One UI-inspired design system
- Vercel hosting
- Playwright E2E tests and GitHub Actions CI
- Kotlin + Jetpack Glance for the future native widget

## Local development
Requirements: Node.js 20.9+ (Node 22 recommended), npm, and a MongoDB Atlas connection string.

```bash
cp .env.example .env.local
npm install
npm run dev
```

For UI-only preview, `DAYFLOW_DEMO_MODE=true` stores tasks in browser localStorage. This mode is not synced or durable and must not be used as production persistence.

## Production environment
Set the following in Vercel Project Settings → Environment Variables:
- `MONGODB_URI`
- `MONGODB_DB` (recommended: `dayflow`)
- `DAYFLOW_ADMIN_EMAIL`
- `DAYFLOW_ADMIN_PASSWORD_HASH`
- `DAYFLOW_AUTH_SECRET` (random secret, 32+ characters)
- `DAYFLOW_SYNC_TOKEN` (for authenticated plan imports)
- `DAYFLOW_DEMO_MODE=false`

Generate secrets locally; never commit `.env.local` or expose credentials in client code. Run `npm run db:indexes` against the intended database before production.

## API overview
- `GET /api/health`
- `GET /api/tasks?date=YYYY-MM-DD`
- `POST /api/tasks`
- `PATCH /api/tasks/:taskId`
- `DELETE /api/tasks/:taskId`
- `GET /api/plans`
- `POST /api/integrations/plans/import`

See `docs/architecture.md`, `docs/plan-sync.md`, `docs/research-and-decisions.md`, and `docs/release-checklist.md`.

## Quality gates
```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Run the checks and verify database-backed authentication before enabling production access.