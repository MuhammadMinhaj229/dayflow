# DayFlow dependency advisory review

**Reviewed:** 7 November 2026  
**Scope:** V3 migration branch dependency graph from `package-lock.json`  
**Policy:** Do not use `npm audit fix --force` as a substitute for compatibility review.

## Summary

The current lockfile contains no high- or critical-severity findings according to the CI gate:

```bash
npm audit --audit-level=high
```

The full audit also reports low/moderate advisories in the development/build toolchain. The current action is deliberately not to claim a clean dependency tree and not to force major-version overrides that may break the build. The residual findings are reviewed below.

## Findings

| Package and locked version | Dependency path | Advisory | Assessment |
|---|---|---|---|
| `deepmerge@4.3.1` | `vite-plugin-pwa → workbox-build → @rollup/plugin-node-resolve → deepmerge` | [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | Low severity. The advisory currently lists no patched release. This is a build-time dependency; DayFlow does not expose deepmerge operations to workspace data or user-supplied objects. |
| `glob@11.1.0` | `vite-plugin-pwa → workbox-build → glob` | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | Moderate severity. Patched in glob 14.0.2. Workbox declares glob 11.x; forcing a major override without verifying Workbox API compatibility is not accepted. This is used during the build, not by the browser application. |
| `minimatch@10.2.6` | ESLint 10 and typescript-eslint 8 via their declared semver ranges | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | Moderate severity. Patched in minimatch 11.0.1. ESLint's current dependency range still selects 10.x, and an upstream compatibility issue records breaking API differences between minimatch 10 and 11. No global override is applied until ESLint and typescript-eslint officially support the patched major. |

The lockfile also contains `minimatch@5.1.9` under `filelist`, which is outside the advisory's affected range, and `minimatch@11.0.5` under `rimraf`, which is patched.

## Exposure controls

- All three findings are in development/build tooling; none is imported by DayFlow's browser runtime or Android application code.
- Workbox glob patterns are fixed in source configuration (including the explicit static asset extensions). User task/project values do not become filesystem glob patterns.
- DayFlow does not expose ESLint or TypeScript parser operations as a user-facing or network-facing service.
- CI runs dependency installation and security review separately from user data. No task database, email metadata or backup contents are uploaded to GitHub Actions.
- The high/critical audit gate remains mandatory. A moderate/low finding is not hidden; this file records the exact packages and why a forced upgrade is not yet safe.

## Remediation and re-review

1. Re-check the upstream advisories and package ranges whenever `vite-plugin-pwa`, Workbox, ESLint or typescript-eslint is upgraded.
2. Upgrade Workbox and/or its glob dependency when a compatible upstream release removes the vulnerable 11.x glob path.
3. Move ESLint and typescript-eslint to releases that adopt a patched minimatch range. Until then, do not globally override minimatch 10 to 11 without running the full lint/typecheck/test/build pipeline.
4. Re-run `npm audit`, `npm ls glob minimatch deepmerge`, all CI gates and a fresh production build after every dependency change.

This is a time-bounded residual risk acceptance for build tooling, not a statement that the dependency graph has zero advisories. Re-review before a public production release.
