# Product research and technology decisions

## Evaluated references

| Project | Best ideas to borrow | Why it is not the direct foundation |
|---|---|---|
| Tududi | Areas, projects, tasks, subtasks, recurrence, calm GTD-oriented information architecture, installable mobile UX | Existing Express/SQLite application would require a major backend and data-layer replacement for Vercel + Atlas |
| OpenTodo | Local-first operations, sync log, offline awareness and reconciliation | AGPL-3.0 codebase and Go/SQLite stack; use its sync principles, not its implementation |
| Super Productivity | Timeboxing, task duration, focus, time tracking and mature keyboard workflows | Larger product scope and a different local-first application architecture |
| Vikunja | List/board/table/calendar/Gantt multi-view model | AGPLv3 and a separate Go/server/database stack |
| MongoDB Next.js starter | Next App Router, official MongoDB driver, server-side connection reuse, TypeScript, Vercel and Playwright CI | A minimal foundation rather than a finished productivity product |

## Selected approach

Use a fresh Next.js + MongoDB implementation, informed by the product patterns above. The selected stack is based on the MongoDB-maintained `nextjs-template-mongodb` repository: Next.js App Router, React, TypeScript, MongoDB Node driver, Tailwind, Playwright and Vercel. This DayFlow source was authored as a new implementation; application source files were not copied from the evaluated task-manager repositories.

## Product principle

One task model must serve every surface. The browser planner, ChatGPT import endpoint and future Android widget must not maintain separate task stores. MongoDB is the source of truth for production; browser localStorage is used only for the clearly labelled preview mode.

## Device-widget decision

A PWA home-screen shortcut is not a native resizable Android widget. DayFlow will ship the web/PWA first, then a Kotlin + Jetpack Glance module. Android background refresh is OS-scheduled and best-effort, so the widget must show freshness state and support manual refresh. A device-pairing/token-revocation flow is required before background widget reads or task completion are enabled.

## ChatGPT integration decision

Plan sync is explicit. ChatGPT must first finalise a plan, then provide structured data with a stable external plan key and stable task keys. The API validates, reconciles and stores the plan. Replaying an identical payload is a no-op; changed revisions update tasks without resetting completed status. The web UI provides a session-authenticated JSON import path; an external bearer-token endpoint is available for a future trusted integration. Do not expose unauthenticated MCP write tools.

## Licensing

The DayFlow source is MIT-licensed. OpenTodo and Vikunja are reference projects only; their copyleft code is not included. Review the exact upstream licence before copying any third-party source or assets in future work.
