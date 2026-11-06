# Finalized plan import API

Endpoint: `POST /api/integrations/plans/import`

Authentication: `Authorization: Bearer ${DAYFLOW_SYNC_TOKEN}`
Content-Type: `application/json`

Example:

```json
{
  "externalKey": "personal-2026-11-06-v1",
  "date": "2026-11-06",
  "title": "Friday plan",
  "timezone": "Asia/Kolkata",
  "tasks": [
    { "key": "noman-site-build", "title": "Build Noman Brothers website", "priority": "high", "start": "09:00", "end": "11:00", "project": "Client work", "labels": ["Delivery"] },
    { "key": "phfi-deck", "title": "Prepare PHFI presentation", "priority": "high", "start": "11:15", "end": "12:15", "project": "PHFI", "labels": ["Career"] }
  ]
}
```

Response:

```json
{
  "success": true,
  "planId": "...",
  "revision": 1,
  "importedTasks": 2,
  "message": "Plan synchronised. Existing completion states are preserved."
}
```

## Integration behavior

- The `externalKey` identifies a logical plan and must be stable across retries.
- Each task should have a stable `key`; title/time-derived keys are a fallback only.
- Repeated import is idempotent for plan and task records.
- Completion status is preserved if an existing imported task is re-sent.
- Removed non-completed tasks are cancelled; completed tasks remain completed.
- A plan import creates or revises a structured plan; it does not interpret an arbitrary chat transcript. The caller must first finalise the intended plan and map it into this schema.

## ChatGPT connection path

For the first release, export this JSON from the planning conversation and submit it from the authenticated integration workflow. A future custom MCP server can expose tools such as `finalize_plan`, `list_today`, `update_task` and `complete_task` over this same domain service. Do not expose a no-auth MCP server or reuse the admin browser cookie as an integration credential.
