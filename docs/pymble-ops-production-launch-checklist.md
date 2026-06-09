# Pymble Ops Production Launch Checklist

Last updated: 2026-06-07

This checklist covers launch items 2-8: final role permissions, production infrastructure, security hardening, real workflow UAT, performance, layout polish, and production readiness.

## Launch Gate

Run these before every production release:

```txt
npm run ops:readiness
npm run test
npm run lint
npm run build
```

After Vercel/Supabase production environment variables are pulled into a trusted local shell, run:

```txt
npm run ops:readiness -- --strict-env
```

## 2. Final Role Permissions

Status: Implemented baseline, requires UAT sign-off.

- Developer is technical superadmin, hidden from the access register, and cannot be deleted or deactivated in the app.
- Managing Director is the single operational superuser and can access every ready module except deleting Developer.
- General Manager can create and deactivate staff except Managing Director and Developer.
- Human Resource can create and deactivate staff except Managing Director, General Manager, and Developer.
- Other staff roles have module access only and cannot manage staff accounts.
- Source of truth: `docs/pymble-ops-role-permission-matrix.md` and `src/lib/ops/role-policy.ts`.
- Regression coverage: `tests/ops-production-readiness.test.ts` and `tests/ops-permissions.test.ts`.

## 3. Production Infrastructure

Status: Code checks implemented; dashboard settings require manual confirmation.

Required Vercel production variables:

- `NEXT_PUBLIC_OPS_HOST`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `CF_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `RESEND_API_KEY`

Email sender variables:

- Set `OPS_EMAIL_FROM` or `RESEND_FROM_EMAIL`.
- Set `OPS_EMAIL_REPLY_TO` before final go-live; otherwise the app uses the Pymble support email fallback.

Monitoring variables for final monitored go-live:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

Manual checks:

- Supabase project is the Pymble-only project, not SitePilot.
- Auth redirect URLs include production and localhost callback URLs.
- Public sign-up remains disabled.
- Resend SMTP is configured in Supabase Auth.
- R2 bucket is private and Pymble-only.
- Vercel cron points to `/api/ops/cron/hse-escalations`.
- `CRON_SECRET` is a long random server-only value.
- Supabase backups/PITR policy is confirmed for the production tier.
- Git pipeline deploys to Vercel; no direct manual deploy is used.

Protected readiness endpoint:

```txt
GET /api/ops/health?mode=readiness
Authorization: Bearer <CRON_SECRET>
```

## 4. Security Hardening

Status: Baseline implemented; exhaustive security scan remains a separate launch authorization.

Implemented:

- Ops responses receive `no-store` cache headers.
- Ops pages/API responses are marked `noindex`.
- Ops pages deny iframe embedding.
- Ops response headers set `nosniff`, referrer policy, and restrictive permissions policy.
- Detailed readiness checks require `CRON_SECRET`.
- Service role key is restricted to server helpers by readiness checks.
- Client components are checked for server-secret references.
- Retired setup/signup/register routes remain blocked by proxy.
- RLS remains enabled on exposed Supabase tables.

Manual launch checks:

- Run Supabase database advisors in the dashboard.
- Configure Vercel Firewall rate-limit rules from `docs/pymble-ops-vercel-firewall.md`.
- Confirm the Vercel Firewall has active rules for login, password reset, ops API writes, and document downloads.
- Confirm no service role key exists in browser bundles, Vercel preview logs, or screenshots.
- Confirm R2 bucket has no public object listing.
- Confirm production errors are sent to Sentry.
- Authorize and complete an exhaustive repository security scan before final go-live.

## 5. Real Workflow UAT

Status: UAT plan created; employee sign-off required.

Use `docs/pymble-ops-uat-plan.md`. At minimum, complete:

- Sign-in/session/profile/sign-out for every role.
- Role sidebar and module visibility for every role.
- Site, map, and headquarters settings.
- Document upload/download.
- Approval submission and decision.
- Material request to RFQ/PO to GRN to stock movement.
- Delivery exception lifecycle.
- Budget/payment/invoice/commercial handoff.
- Fleet/logistics and operator compliance.
- HSE incident/compliance/email alert flow.
- Employee/leave/HR document self-service.
- Executive dashboard for Developer, Managing Director, and General Manager.

## 6. Performance Pass

Status: Baseline command and browser smoke required before launch.

Targets:

- `npm run build` must pass.
- No route should hang on auth refresh.
- Overview, Suppliers, RFQ/PO, Stores, HSE, Employees, Commercial, Fleet, and Executive should load without runtime errors.
- High-volume lists must stay paginated or capped.
- Expensive dashboards should use fallback/snapshot helpers until SQL/RPC snapshots are added.
- If any route feels slow in UAT, record route, role, browser, number of records, and approximate load time.

Recommended smoke routes:

- `/ops`
- `/ops/modules`
- `/ops/sites`
- `/ops/material-requests`
- `/ops/rfq-po`
- `/ops/stores-inventory`
- `/ops/hse`
- `/ops/employees`
- `/ops/commercial`
- `/ops/fleet-logistics`
- `/ops/executive`

## 7. Layout Polish

Status: Design system captured; final visual UAT required.

Checks:

- Desktop sidebar is fixed and profile stays anchored at the bottom.
- Mobile drawer opens/closes by menu, backdrop, close button, Escape, and nav click.
- Page order follows title/action toolbar, KPIs/summary, main data, collapsed forms.
- No setup requirements page or signup/register CTA appears inside ops.
- No generic ERP or SitePilot wording appears in ops UI.
- Text does not overlap buttons, cards, or tables on mobile.
- Buttons and controls meet visible focus requirements.
- Tables either collapse to cards or use controlled horizontal scrolling.
- Loading states use the Pymble mark.

## 8. Production Readiness

Status: Local automation implemented; external sign-offs required.

Ready to launch when:

- All automated checks pass.
- Latest migrations are applied to the Pymble Supabase project.
- Vercel production env vars are complete.
- Supabase Auth/SMTP/redirect settings are confirmed.
- R2 production bucket access is confirmed.
- Cron readiness endpoint succeeds with `CRON_SECRET`.
- Real workflow UAT is signed off by department owners.
- Rollback plan is agreed: revert Git commit/PR and redeploy through pipeline.
- Monitoring owner is assigned for first 48 hours after launch.
