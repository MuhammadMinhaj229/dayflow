# Release checklist

## Before first preview

- [ ] Push this complete source to the GitHub repository and connect it to Vercel.
- [ ] Confirm the Vercel project uses Node.js 22.x and Mumbai (`bom1`) for server functions.
- [ ] Keep `DAYFLOW_DEMO_MODE=true` on Preview only; never enable it in Production.
- [ ] Install dependencies and commit the generated `package-lock.json` before accepting CI as reproducible.
- [ ] Run typecheck, lint, build and Playwright tests in CI.

## Before production database use

- [ ] Create a dedicated MongoDB Atlas database user with read/write access only to the `dayflow` database.
- [ ] Add the Vercel application's outbound network path to Atlas access rules. Prefer Vercel Static IP or another restricted network path; do not casually allow `0.0.0.0/0`.
- [ ] Set `MONGODB_URI` and `MONGODB_DB=dayflow` in Vercel Production and Preview as appropriate.
- [ ] Set `DAYFLOW_ADMIN_EMAIL`.
- [ ] Generate a bcrypt password hash locally and set `DAYFLOW_ADMIN_PASSWORD_HASH` in Vercel only.
- [ ] Generate a random `DAYFLOW_AUTH_SECRET` of at least 32 characters.
- [ ] Keep `DAYFLOW_DEMO_MODE=false` in Production.
- [ ] Run `npm run db:indexes` once against the intended database.
- [ ] Verify `/api/health` reports `database: connected`.
- [ ] Verify login, task creation, completion, reopening and deletion.
- [ ] Verify a repeated plan import is a no-op and a new revision preserves completed tasks.
- [ ] Verify data cannot be read or mutated without a valid session/token.
- [ ] Confirm backups, retention and recovery procedure in Atlas.

## Before Android widget release

- [ ] Implement authenticated device pairing and revocable device tokens.
- [ ] Implement `/api/widget/today` scoped to the paired device's workspace.
- [ ] Build the Kotlin/Jetpack Glance module.
- [ ] Test small, medium and large widget sizes on a Samsung device.
- [ ] Test stale/offline states, manual refresh, widget taps and task completion.
- [ ] Verify Android background refresh behavior and battery impact.
