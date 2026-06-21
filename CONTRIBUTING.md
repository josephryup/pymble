# Contributing to Pymble Operations

This document is the onboarding map for the next developer joining the project. It covers the day-one setup, the conventions the codebase already follows, and the recipes for the changes you'll actually make.

## First-day setup

1. Read [docs/pymble-ops-setup.md](docs/pymble-ops-setup.md) end-to-end — env vars, Supabase project, R2 storage, local dev
2. Read [docs/pymble-ops-walkthrough.md](docs/pymble-ops-walkthrough.md) for a tour of the workspace
3. Read [docs/pymble-ops-workflow-design.md](docs/pymble-ops-workflow-design.md) — the master design doc; you don't need to memorise it but you should know it exists and roughly what's in each Part
4. Run `npm install`, set up `.env.local`, run `npm run dev`, log in as the seeded developer account
5. Run the verification pipeline once so you know what green looks like:
   ```
   npm run verify           # tsc + eslint + tests
   npm run check-schema     # confirms dev DB matches the manifest
   ```

## Branch + commit conventions

- Branch name: `feature/<short-slug>` or `fix/<short-slug>`
- Commit message: first line ≤72 chars in imperative ("add invoice PDF route"); explain *why* in the body if non-obvious
- Squash before merge — one PR = one commit on `main`

## Code conventions

- **TypeScript everywhere.** No raw JS in `src/`.
- **No comments that just restate the code.** Add a comment only when the *why* is non-obvious.
- **Server actions live in `src/lib/ops/*-actions.ts`**. Public ones are `export async function ...Action()`. Each redirects on error via a tiny `*Error()` helper.
- **Data fetchers live in `src/lib/ops/*.ts`** (no `-actions` suffix). Pure read-side.
- **Permissions live in `src/lib/ops/permissions.ts` and `src/lib/ops/*-permissions.ts`** — one helper per privileged check (`canEditX`, `canArchiveX`).
- **Every UI string user-facing should spell abbreviations out** — write "Bill of Quantities" not "BOQ" except inside the glossary entry itself.

## Recipes

### Add a new migration

1. Use the Supabase MCP to apply it to dev first:
   ```ts
   mcp__b5de0317-6e51-45b0-8891-0f34dec5254a__apply_migration({
     project_id: "zuezxgyhhrhklrhqsvvs",
     name: "pymble_ops_<short_slug>",
     query: "..."
   })
   ```
2. Mirror the SQL into `supabase/migrations/YYYYMMDDHHMMSS_pymble_ops_<short_slug>.sql`
3. Update `scripts/check-schema.mjs` manifest if the migration adds a required column, table, or function
4. In production, run `npm run check-schema` against the prod DB before deploying — the script blocks the deploy if production is behind

### Add a new server-side action

1. Pick the matching `src/lib/ops/*-actions.ts` (or create one if it's a new module)
2. Use Zod for input parsing
3. Use `getOpsSupabaseServiceClient()` for privileged writes; `await requireOpsUser()` for the actor
4. Wrap throws with `logOpsServerError({...})` so Sentry has context
5. Call `recordOpsAuditEvent({...})` on success — this also emits a Sentry breadcrumb
6. Call `revalidatePath('/ops/...')` for any page the action affects
7. `redirect(...)` to the new state at the end

### Add a new permission

1. Permission helpers are stateless functions in `src/lib/ops/*-permissions.ts`
2. Function name: `canVerbX(role, ...optional context)` returns boolean
3. Default deny — only return true for the explicit allow list
4. If the change tightens an existing permission, add a row to `tests/role-isolation.test.ts` so a regression fails the test suite

### Add a new dashboard module

1. Add the module to `OPS_MODULES` in `src/lib/ops/constants.ts` (title, href, group, navigation/page roles)
2. Build the page under `src/app/ops/(workspace)/<slug>/page.tsx`
3. Use `OpsPageHeader`, `OpsEmptyState`, `OpsListControls` for the standard layout
4. Add a Workspace Timeline scope in `src/lib/ops/activity-scoping.ts` if the module emits audit events the relevant roles should see

### Add a notification

Use the fanout helpers in `src/lib/ops/notification-fanout.ts`:
```ts
const recipients = await fanoutToOpsRoles(
  ["projects_manager", "engineering_manager", "managing_director"],
  { excludeUserIds: [profile.id] },
);
await Promise.all(
  recipients.map((recipient) =>
    queueOpsNotification({
      actionHref: `/ops/...`,
      body: `...`,
      idempotencyKey: `<event>:<entity-id>:${recipient.id}`,
      moduleKey: "...",
      recipientId: recipient.id,
      sourceId: entity.id,
      sourceTable: "...",
      title: "...",
    }).catch(() => null),
  ),
);
```

The fallback chain in `notification-fanout.ts` covers vacant org seats — never bypass it.

### Add a PDF document

1. Templates live under `src/lib/ops/pdf/<DocumentName>Pdf.tsx`
2. Re-use `BrandHeader`, `Field`, `Table`, `TotalsBlock`, `SignatureRow`, `PageFooter` from `src/lib/ops/pdf/components.tsx`
3. Org snapshot type is `PymblePdfOrgSnapshot` from `src/lib/ops/pdf/theme.ts`
4. Build the download route at `src/app/api/ops/pdf/<entity>/[id]/route.ts`
5. Role-gate it. Record an `audit_events` row per download with `action: "<entity>.pdf_downloaded"`

### Add an analytics event

1. Add the new name to the `OpsEventName` union in `src/lib/ops/analytics.ts`
2. Call `trackOpsEvent("<name>", { ... })` at the right point in the action
3. Don't rename existing events — they break dashboards

### Add a Vercel cron job

1. Build the route at `src/app/api/ops/cron/<slug>/route.ts`
2. Guard with `request.headers.get("authorization") === \`Bearer ${process.env.CRON_SECRET}\``
3. Add the schedule to `vercel.json` under `crons`

## What NOT to do

- Don't introduce a new role without updating `tests/role-isolation.test.ts`
- Don't hard-code Pymble's bank details or TPIN — those live on the `organization_profile` row
- Don't put `service_role` keys anywhere a client component can see (`NEXT_PUBLIC_*` is browser-visible)
- Don't query `audit_events` directly from a page render — it's huge and grows fast; use `audit_events_archive` for old data
- Don't add a server-side `console.log` in production code paths — use `logOpsServerError` so it's structured

## Verifying before you ship

Before opening a PR:

```bash
npm run verify          # tsc + eslint + tests
npm run check-schema    # only meaningful against prod DB
npm run build           # production build
npm run check-bundle-size   # after build, catches accidental bundle bloat
```

PRs without `verify` passing won't be merged.

## Where to look when you're stuck

- This repo's [docs/](docs/) folder — start at [docs/README.md](docs/README.md) which indexes everything
- The original audit + remediation plan: [docs/pymble-ops-audit-and-roadmap.md](docs/pymble-ops-audit-and-roadmap.md)
- The master workflow doc: [docs/pymble-ops-workflow-design.md](docs/pymble-ops-workflow-design.md) (now 17 Parts)
- Supabase project: `zuezxgyhhrhklrhqsvvs` (dev). Production project id is in your env.
