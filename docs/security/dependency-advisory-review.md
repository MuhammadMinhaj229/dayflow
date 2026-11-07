# DayFlow dependency security review

**Reviewed:** 7 November 2026  
**Branch:** `architecture/v3-local-first-gmail-mcp`  
**Lockfile:** npm lockfile v3, 299 package entries at the reviewed commit  
**Automated check:** `npm audit --audit-level=low`

## Result

<badge>Zero known npm audit vulnerabilities</badge>

The current locked dependency tree passed the full npm audit, including low and moderate severities, in GitHub Actions run [42351346939](https://github.com/MuhammadMinhaj229/dayflow/actions/runs/42351346939). The audit completed with:

```text
found 0 vulnerabilities
```

The previously recorded low/moderate findings were removed by updating the dependency graph and applying compatible, tested package overrides. The reviewed lockfile contains:

| Package | Locked version | Finding |
|---|---:|---|
| `minimatch` | `11.0.1` | Patched release |
| `glob` | `14.0.4` | Patched release |
| `deepmerge` | Not present | No locked package |

## Controls

- CI uses `npm ci` and audits the committed lockfile. It does not resolve unpinned dependency ranges during the validation job.
- CI fails on any npm audit finding at low severity or above.
- Dependabot checks npm dependencies and GitHub Actions weekly.
- Dependency overrides are retained only while the full TypeScript, lint, unit, production build, Playwright and Android build checks remain green.
- GitHub Actions uses immutable commit SHAs for third-party actions.

## Re-review policy

Re-run the audit after every dependency or lockfile update and review upstream advisories before changing overrides. A zero-vulnerability audit is a point-in-time result, not a guarantee that future vulnerabilities will not be disclosed.

The build pipeline also runs without uploading application task data, research records, Gmail metadata or backup contents. The Android APK artifact contains only the debug application binary and its checksum.
