# Decision 0001 — Browser database filesystem

**Date:** 2026-11-07  
**Status:** Accepted for the browser baseline; Android OPFS remains a measured optimization.

## Context

DayFlow uses PGlite as its local PostgreSQL engine. The PGlite filesystem documentation currently recommends IndexedDB for browser use because the OPFS access-handle-pool filesystem is only available inside a Web Worker and is not supported by Safari.

DayFlow must not rely on a browser capability that silently excludes Safari or a future platform.

## Decision

1. Use PGlite's IndexedDB filesystem (`idb://dayflow-v3`) as the cross-browser baseline.
2. Keep the database behind a repository boundary so its filesystem can change without rewriting domain logic.
3. Evaluate OPFS AHP only in a dedicated worker on Chromium-based Android/WebView targets after device testing.
4. If OPFS is added, it must have an explicit compatibility probe and a tested IndexedDB fallback.
5. Keep database persistence separate from encryption and backups; IndexedDB itself is not a transparent encrypted vault.

## Consequences

- The first PWA baseline targets broad browser compatibility.
- The PGlite IndexedDB VFS loads files into memory and flushes them to IndexedDB as queries run.
- Browser-origin data can still be removed by the user or browser storage eviction. A user-visible encrypted backup is a separate release requirement.
- No user-visible Android shared-storage folder is claimed by this browser implementation.

## References

- [PGlite filesystems](https://pglite.dev/docs/filesystems)
- [PGlite API](https://pglite.dev/docs/api)
- [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
