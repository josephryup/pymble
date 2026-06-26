# Pymble Ops — IT Module Audit & Implementation Plan

> Status: **Built & migrated — Phases IT-1, IT-2, IT-3 shipped.**
> Scope: a self-contained Information Technology area inside the ops workspace,
> visible only to the **IT Manager** and **Managing Director** (plus the
> Developer for maintenance). Includes a fully internal IT ticketing/help desk.
>
> **Delivered:** `it_manager` role; the `it` nav group with IT Overview, Asset
> Management, Help Desk (+ all-staff ticket raising), Software & Licenses,
> Access Register, Onboarding/Offboarding checklists, IT Policies, Credential
> Register (metadata only), Network & Infrastructure, Security & Backups,
> Knowledge Base, and IT department reports. 15 `it_*` tables across three
> migrations applied to the live Supabase project; ticket notifications wired;
> glossary + role-matrix updated. All behind deny-all RLS + server-side gates.
> `npm run verify` (tsc + eslint + 226 tests) green.
>
> **Still open:** SLA / licence-expiry / warranty cron jobs, PDF exports
> (asset register, ticket report), a staff-facing policy-acknowledgement and
> knowledge-base surface, and the §7 password-vault sign-off (built the safe
> metadata-only Credential Register by default).

---

## 1. Purpose & guiding principles

The company has defined a standalone **IT Personnel** role (see
`IT_Personnel_Responsibilities.docx`). This is a real operational role, distinct
from the existing `developer` role:

| | `developer` (exists) | `it_manager` (new) |
|---|---|---|
| Who | The person building/maintaining the software | Company IT staff member |
| Concern | The codebase, deployments, system internals | Company hardware, networks, accounts, support |
| Visibility | Everything (super-admin) | The IT module only + own profile/helpdesk |

**Principles for this build**

1. **Role isolation.** Every IT module is gated to a small role set. Non-IT staff
   never see IT dashboards (the *one* exception is raising a help-desk ticket —
   see §5).
2. **Reuse the existing spine.** The ops platform already has activity logging,
   notifications, approvals, cron escalations, PDF export, offline support,
   archive/restore, and department reports. IT plugs into all of these rather
   than reinventing them.
3. **Security model = deny-all RLS + server-side gates.** Every ops table uses
   `using (false)` RLS and is reached only via the service role behind
   server-side permission checks. IT tables follow the same pattern — *no*
   role logic in RLS; all access decisions live in `permissions.ts` and the
   `lib/ops/*` + server actions layer.
4. **Don't store secrets you don't have to** (see §7 — password management).

---

## 2. Access model (the spine)

A new role and one shared role set drive the whole module.

```
it_manager  → new value in OpsUserRole
OPS_IT_ROLES = [developer, managing_director, owner, it_manager]
```

- **Developer** and **MD/owner** are included so the system is never locked out
  and leadership retains oversight, matching how `OPS_LEADERSHIP_ROLES` works
  elsewhere.
- `general_manager` is **deliberately excluded** by default — IT reports to the
  MD per the org structure. (Flag for confirmation; trivial to add.)

**Permission helpers** (new, in `permissions.ts`):

| Function | Allows | Roles |
|---|---|---|
| `canViewIT(role)` | See the IT area & dashboards | `OPS_IT_ROLES` |
| `canManageAssets(role)` | Create/edit/retire assets | `OPS_IT_ROLES` |
| `canManageITTickets(role)` | See full queue, assign, close | `OPS_IT_ROLES` |
| `canRaiseITTicket(role)` | Submit a support request | **all authenticated staff** |
| `canManageCredentials(role)` | Credential register | `it_manager`, `managing_director`, `developer` |
| `canManagePolicies(role)` | Publish/version IT policies | `OPS_IT_ROLES` |
| `isItManagerRole(role)` | Role predicate (in `roles.ts`) | — |

---

## 3. Traceability — company duties → where they live

Every line from the company document is accounted for. Nothing is dropped.

| # | Company duty (from .docx) | Covered by |
|---|---|---|
| 1 | Maintain computers, laptops, printers, IT equipment | **Asset Management** |
| 2 | Provide technical support, resolve IT issues | **Help Desk / Ticketing** (§5) |
| 3 | Manage network, internet, Wi-Fi | **Network & Infrastructure** |
| 4 | Install, update, troubleshoot software | **Software & Licenses** + asset software list |
| 5 | Manage email accounts & user access permissions | **Access Register** + on/offboarding checklists |
| 6 | Data backup & security of company information | **Backup & Security register** + IT Policies |
| 7 | Maintain IT inventory & asset records | **Asset Management** |
| 8 | Support project teams with tech on site | Help Desk (site-tagged tickets) + Infrastructure (site links) |
| 9 | Monitor system performance, recommend improvements | **IT Overview** dashboard + **IT Reports** |
| 10 | Maintain website, cloud storage, digital platforms | **Digital Services register** |
| 11 | Liaise with external IT service providers | **Vendors / Service Providers** (part of Digital Services) |
| 12 | Compliance with IT policies & cybersecurity | **IT Policies** + acknowledgements |
| 13 | Support construction & project-management software | Software & Licenses + Help Desk categories |
| 14 | Project document storage & digital records | Existing **Documents** module (no duplication) |

**Gaps the brief didn't mention but a real IT function needs** (added below):
security-incident logging, preventive-maintenance scheduling, asset disposal /
e-waste, a self-service knowledge base, and licence/warranty expiry alerting.

---

## 4. Module catalogue

New nav group `it` ("Information Technology"), placed just before `executive`.
All modules gated to `OPS_IT_ROLES` unless noted.

| Module | href | Phase | Purpose |
|---|---|---|---|
| **IT Overview** | `/ops/it` | IT-1 | Open tickets, SLA pressure, asset health, expiring licences/warranties, onboarding queue — one screen. |
| **Asset Management** | `/ops/it/assets` | IT-1 | Register of all hardware: serial, type, assigned staff, site, purchase/warranty dates, condition, status (in-use / spare / repair / retired / disposed). |
| **Help Desk** | `/ops/it/helpdesk` | IT-1 | Internal ticketing. Full queue is IT-only; ticket creation open to all staff (§5). |
| **Access Register** | `/ops/it/access` | IT-2 | Who has which accounts/permissions (email, ERP, portals). Drives offboarding revocation. *(Duty 5)* |
| **Employee IT Checklists** | `/ops/it/checklists` | IT-2 | On/offboarding runbooks per employee — accounts, kit handout/recovery, access grant/revoke, data backup. |
| **IT Policies** | `/ops/it/policies` | IT-2 | Versioned policy docs (acceptable use, password, BYOD, cyber, data retention) + staff acknowledgement tracking. |
| **Software & Licenses** | `/ops/it/licenses` | IT-2 | Subscriptions/licences: vendor, seats, assigned users, cost, renewal date, expiry alerts. |
| **Credential Register** | `/ops/it/credentials` | IT-2 | Metadata for shared/service accounts — *pointer to Bitwarden, not secrets* (§7). |
| **Network & Infrastructure** | `/ops/it/infrastructure` | IT-3 | Routers, switches, APs, servers, ISP links per site; maintenance log; uptime notes. |
| **Security & Backups** | `/ops/it/security` | IT-3 | Backup job status, security-incident log, antivirus/patch posture. *(Duties 6, 12)* |
| **Knowledge Base** | `/ops/it/kb` | IT-3 | Self-service how-to articles to deflect repeat tickets. |
| **IT Reports** | `/ops/department-reports/d/it` | IT-3 | Monthly IT report → MD, via existing department-report engine (add `it` dept). |

> **Disposal / e-waste, preventive maintenance schedule, and asset audits** are
> features *inside* Asset Management and Security & Backups rather than separate
> nav items, to keep the sidebar lean.

---

## 5. Internal IT ticketing / Help Desk (the centrepiece)

Fully in-app — no external help-desk tool needed for go-live. This is the answer
to "can we build internal ticketing just for IT issues": **yes**, and here is the
design.

### 5.1 Who does what

- **Any authenticated staff** → a lightweight **"Get IT Help"** entry (a global
  button in the shell + page `/ops/it/helpdesk/new`). They can create a ticket
  and see / comment on **their own** tickets only. They never see the queue or
  other people's tickets.
- **IT Manager / MD / Developer** → the full **queue** at `/ops/it/helpdesk`:
  triage, assign, prioritise, change status, add **internal notes**, resolve,
  close, and report.

### 5.2 Lifecycle

```
open ──▶ in_progress ──▶ resolved ──▶ closed
  │           │
  │           ├──▶ on_hold (waiting on parts/vendor)
  │           └──▶ awaiting_user (waiting on requester reply)
  └──────────────────────▶ cancelled
```

### 5.3 Ticket fields

- Human reference (e.g. `IT-2026-0042`), title, description.
- **Category**: hardware · software · network · email · access · printing ·
  site_connectivity · security · other.
- **Priority**: low · normal · high · urgent.
- Optional links: **site** (`sites`) and **asset** (`it_assets`) — so "laptop
  won't boot" ties to the actual machine, "no Wi-Fi at Site B" ties to the site.
- Audit fields: raised_by, assigned_to, first_response_at, resolved_at,
  closed_at, resolution_notes, satisfaction_rating (1–5, optional).

### 5.4 SLA & escalation

- SLA targets per priority, configurable in **Settings** (sensible defaults:
  urgent 4h response / 8h resolve · high 8h / 1 day · normal 1 day / 3 days ·
  low 3 days / 5 days).
- A **cron job** (reuse `/api/ops/cron/escalations` pattern) flags tickets past
  SLA and notifies the IT Manager.

### 5.5 Comments & notifications

- Reuse existing **comments + @mentions** infra (`comments.ts`, `mentions.ts`)
  with an `is_internal` flag so IT-only notes stay hidden from the requester.
- Reuse **notifications** (`notifications.ts`, `notification-fanout.ts`):
  ticket assigned, status changed, new public comment, SLA breach.
- Every state change feeds the existing **activity log**.

### 5.6 Permissions

`canRaiseITTicket()` → all; `canViewITQueue(role)` / `canManageITTickets(role)`
→ `OPS_IT_ROLES`; `canViewTicket(role, ticket, userId)` → manager **or** own
ticket. Internal notes filtered server-side.

---

## 6. Recommended IT stack (external tools)

In-app modules cover records/workflow; these are the operational tools IT runs.

| Need | Recommended | Why |
|---|---|---|
| Password manager | **Bitwarden Teams** (or self-hosted Vaultwarden) | Open-source, audited, cheap per-seat; ops stores only a *pointer*, never secrets. |
| Remote support | **AnyDesk** | Light, no agent, good for supporting site staff; cheaper than TeamViewer. |
| Uptime monitoring | **UptimeRobot** (free 50 monitors) | Alerts on site/server/website downtime; feed status into IT Overview. |
| Backup | **Cloudflare R2** (already used, see `r2.ts`) **+ on-site NAS** | Satisfies 3-2-1 rule (duty 6). |
| Endpoint AV/EDR | **Microsoft Defender** (built-in) managed via Intune/GPO | Zero extra licence cost on Windows. |
| Network discovery | **Angry IP Scanner** (free) | On-demand device audits for the infrastructure register. |
| Ticketing | **In-app Help Desk (§5)** | Built here; Freshdesk free tier only as fallback. |
| Documentation | **In-app IT Policies + Knowledge Base** | Native versioning, acknowledgement, audit trail. |

---

## 7. Password / credential management — security decision ⚠️

**Recommendation: do _not_ store recoverable secrets in the ops database.**
A web app holding plaintext or reversibly-encrypted passwords is a high-value
breach target and a liability.

**Safe default (recommended):** Bitwarden Teams is the system of record for
secrets. The ops **Credential Register** stores only *metadata* — account name,
system, owner, where it lives, last-rotated date, rotation due date — and links
out to the Bitwarden item. Ops gains visibility and rotation tracking; secrets
never touch our DB.

**If in-DB secrets are truly required later:** must be envelope-encrypted with a
KMS-held key (not an app env var), decrypt server-side only, mandatory access
logging on every reveal, and access limited to `it_manager` + MD. Higher risk —
needs explicit sign-off.

> **This is the one genuine decision to lock before building the Credential
> Register.** Everything else has a sensible default.

---

## 8. Data model (new Supabase tables)

All tables: `archived_at`/`archived_by` columns, `set_updated_at` trigger,
deny-all RLS (`using (false)`), and added to `supabase_realtime`, mirroring
`department_reports`.

| Table | Holds |
|---|---|
| `it_assets` | Hardware register (one row per device). |
| `it_asset_assignments` | History of who held an asset and when. |
| `it_asset_maintenance` | Service/repair log + preventive-maintenance schedule. |
| `it_tickets` | Help-desk tickets. |
| `it_ticket_comments` | Public + internal ticket notes (`is_internal`). |
| `it_access_grants` | Per-employee account/permission register (duty 5). |
| `it_checklist_templates` | On/offboarding runbook templates. |
| `it_checklist_runs` | A template instantiated for one employee event. |
| `it_checklist_items` | Individual steps + completion state per run. |
| `it_policies` | Versioned IT policy documents. |
| `it_policy_acknowledgements` | Staff sign-off per policy version. |
| `it_software_licenses` | Subscriptions/licences + renewal dates. |
| `it_credentials` | Credential **metadata** (no secrets — see §7). |
| `it_network_devices` | Infrastructure inventory per site. |
| `it_security_incidents` | Cybersecurity incident log. |
| `it_kb_articles` | Knowledge-base articles. |

Enums: `it_ticket_status`, `it_ticket_category`, `it_asset_status`,
`it_asset_type`, `it_checklist_kind` (`onboarding`/`offboarding`), and add `it`
to the existing `ops_department_key` enum.

---

## 9. Existing files to update

| File | Change |
|---|---|
| `src/lib/ops/types.ts` | Add `"it_manager"` to `OpsUserRole`; add IT status/enum types. |
| `src/lib/ops/roles.ts` | Label "IT Manager"; `isItManagerRole()`; add to `OPS_STAFF_ROLE_OPTIONS`/`_VALUES`. |
| `src/lib/ops/constants.ts` | `OPS_IT_ROLES`; new `it` module group; the IT module entries. |
| `src/lib/ops/nav-icons.ts` | Lucide icons for every `/ops/it/*` href (test enforces coverage). |
| `src/lib/ops/permissions.ts` | New IT permission helpers (§2). |
| `src/lib/ops/department-report-permissions.ts` | Add `it` to `OpsDepartmentKey`, `OPS_DEPARTMENT_LABELS`, `ROLE_DEPARTMENT_MAP`, `DEPARTMENT_HEAD_ROLES`. |
| `supabase/migrations/` | New migration `..._pymble_ops_it_module.sql` (§8). |
| `src/app/ops/(workspace)/it/...` | New route pages per module. |
| `src/app/api/ops/cron/` | IT escalation/expiry cron (SLA, licence, warranty). |
| Glossary | Add IT abbreviations (SLA, EDR, NAS, BYOD, KB). |
| `docs/pymble-ops-role-permission-matrix.md` | Add the IT role row. |

---

## 10. Cross-cutting integrations (don't rebuild these)

- **Activity log** — every IT create/update/assign/close feeds `activity-log.ts`.
- **Notifications** — ticket + expiry alerts via `notification-fanout.ts`.
- **Cron** — SLA breach, licence expiry, warranty expiry, overdue offboarding.
- **Archive/restore** — IT records archive and restore like everything else.
- **PDF export** — asset register + monthly ticket report via existing PDF infra.
- **Offline** — site staff raising tickets offline (existing offline support).
- **Department reports** — IT monthly report reuses the report engine.
- **Approvals** — IT purchase requests can route through existing approvals.

---

## 11. Implementation phases (sequenced)

**Phase IT-1 — Foundation & core (highest value, maps to duties 1, 2, 7, 9)**
1. Role plumbing: `it_manager` in types/roles/constants/permissions + staff options.
2. `it` nav group + IT Overview shell page.
3. Asset Management (table, list, create/edit, assignment history).
4. Help Desk: tickets, comments, "Get IT Help" entry for all staff, IT queue.
5. Wire activity log + notifications for the above.

**Phase IT-2 — Governance (duties 4, 5, 6, 12)**
6. Software & Licenses + expiry cron.
7. Access Register + Employee IT Checklists (on/offboarding).
8. IT Policies + acknowledgements.
9. Credential Register (after §7 decision).

**Phase IT-3 — Infrastructure & oversight (duties 3, 8, 10, 11)**
10. Network & Infrastructure (with per-site links).
11. Security & Backups (incident log, backup status, AV posture).
12. Knowledge Base.
13. IT department report (add `it` department).
14. SLA/warranty escalation cron; PDF exports; glossary + matrix docs.

---

## 12. Decisions to confirm before building

1. **Password/credential approach** — metadata-only register + Bitwarden
   (recommended) vs encrypted in-DB secrets. *(§7 — blocks Credential Register.)*
2. **Does the General Manager get IT visibility,** or MD-only alongside IT?
3. **SLA default targets** — confirm the per-priority response/resolve hours.
4. **Ticket creation surface** — global "Get IT Help" button for all staff
   (recommended) vs email-to-ticket later.

## 13. Out of scope (now) / future

Email-to-ticket ingestion · automated device enrolment (Intune/MDM sync) ·
network auto-discovery into the infra register · asset barcode/QR scanning ·
self-service password reset portal.
