# Pymble Operations — documentation index

Every doc that ships with the codebase, with a one-line summary so you know which one to open first.

## Start here

| Doc | What's inside |
|-|-|
| [pymble-ops-setup.md](pymble-ops-setup.md) | First-time setup for a developer — env vars, Supabase, R2, local run |
| [pymble-ops-walkthrough.md](pymble-ops-walkthrough.md) | Tour of the whole workspace for a new engineer joining the team |
| [pymble-ops-user-guide.md](pymble-ops-user-guide.md) | End-user guide for Pymble staff — what each page does |

## Operating

| Doc | What's inside |
|-|-|
| [pymble-ops-operations-guide.md](pymble-ops-operations-guide.md) | Day-to-day operations playbook |
| [production-deployment-checklist.md](production-deployment-checklist.md) | Step-by-step deploy gate; run through this every release |
| [pymble-ops-production-launch-checklist.md](pymble-ops-production-launch-checklist.md) | Pre-launch readiness checklist for the initial go-live |
| [pymble-ops-vercel-firewall.md](pymble-ops-vercel-firewall.md) | Vercel firewall rules + WAF setup |
| [backup-and-recovery.md](backup-and-recovery.md) | Supabase PITR + R2 versioning + migration rollback runbook |
| [sentry-setup.md](sentry-setup.md) | Sentry wiring + env vars + verify endpoint + breadcrumb model |

## Compliance

| Doc | What's inside |
|-|-|
| [zambian-compliance.md](zambian-compliance.md) | ZRA PAYE bands, NAPSA, WCF, VAT — how rates live in code and how to update them annually |
| [two-factor-authentication.md](two-factor-authentication.md) | TOTP 2FA policy for leadership + finance accounts and enrolment procedure |

## Workflow + design

| Doc | What's inside |
|-|-|
| [pymble-ops-workflow-design.md](pymble-ops-workflow-design.md) | Master design doc — phases H through R + Parts 1-17 covering every workflow decision |
| [pymble-ops-workflow-guide.md](pymble-ops-workflow-guide.md) | Reader-friendly summary of the workflow design |
| [pymble-ops-workflow-infographic.svg](pymble-ops-workflow-infographic.svg) | Visual map of the operations module |
| [pymble-ops-design-system.md](pymble-ops-design-system.md) | UI tokens, spacing, color, typography conventions |
| [pymble-ops-role-permission-matrix.md](pymble-ops-role-permission-matrix.md) | Per-role access matrix across every module |
| [pymble-ops-ui-consistency-audit.md](pymble-ops-ui-consistency-audit.md) | UI/UX audit findings and remediation status |

## Planning

| Doc | What's inside |
|-|-|
| [pymble-ops-audit-and-roadmap.md](pymble-ops-audit-and-roadmap.md) | Full system audit + 7-sprint remediation plan |
| [pymble-ops-erp-roadmap.md](pymble-ops-erp-roadmap.md) | Longer-horizon ERP feature roadmap |
| [pymble-ops-uat-plan.md](pymble-ops-uat-plan.md) | User acceptance testing plan |

## How to extend this index

When you add a new doc to `/docs`, add a one-line entry above in the right section. Group docs by purpose, not by file name. Keep summaries under 100 chars so the table stays scannable.
