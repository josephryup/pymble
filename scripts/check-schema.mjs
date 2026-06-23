#!/usr/bin/env node
/**
 * Pre-deploy schema check.
 *
 * Connects to the target Supabase Postgres (via env vars) and confirms every
 * table / column the application currently relies on actually exists. If any
 * piece is missing, exits with code 1 so the deploy halts.
 *
 * Usage (locally or in CI):
 *   SUPABASE_DB_URL=postgres://... node scripts/check-schema.mjs
 *   # or
 *   npm run check-schema
 *
 * The required-schema manifest is kept in this file so it can be updated as
 * part of each migration PR — single source of truth.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ------------------------------------------------------------------
// Required schema manifest
// ------------------------------------------------------------------
const REQUIRED_COLUMNS = [
  // Per-item supplier model (Sprint 3/4)
  ["material_request_items", "supplier_id"],
  ["material_request_items", "supplier_name_freeform"],
  ["material_request_items", "actual_unit_cost"],
  ["material_request_items", "actual_total"],
  ["boq_line_items", "supplier_id"],
  ["boq_line_items", "supplier_name_freeform"],
  ["rfq_items", "supplier_id"],
  ["rfq_items", "supplier_name_freeform"],
  ["rfq_items", "actual_unit_cost"],
  ["rfq_items", "actual_total"],
  // Leadership-only actual project budget on sites
  ["sites", "actual_budget_zmw"],
  // General (office) vs site requisitions / material requests
  ["rfqs", "scope"],
  ["rfqs", "archived_at"],
  ["rfqs", "archived_by"],
  ["material_requests", "scope"],
  ["purchase_orders", "scope"],
  ["purchase_order_items", "supplier_id"],
  ["purchase_order_items", "supplier_name_freeform"],

  // Archive + cancel pattern (Phase I/J + J2 backlog)
  ["boq_documents", "archived_at"],
  ["boq_documents", "archived_by"],
  ["material_requests", "archived_at"],
  ["material_requests", "archived_by"],
  ["material_requests", "cancelled_at"],
  ["material_requests", "cancelled_by"],
  ["material_requests", "priced_at"],
  ["material_requests", "priced_by"],
  ["invoices", "archived_at"],
  ["invoices", "archived_by"],
  ["invoices", "cancelled_at"],
  ["invoices", "cancelled_by"],
  ["payment_requests", "archived_at"],
  ["payment_requests", "archived_by"],
  ["daily_site_reports", "archived_at"],
  ["daily_site_reports", "archived_by"],
  ["daily_site_reports", "cancelled_at"],
  ["daily_site_reports", "cancelled_by"],
  ["payroll_runs", "archived_at"],
  ["payroll_runs", "archived_by"],
  ["payroll_runs", "cancelled_at"],
  ["payroll_runs", "cancelled_by"],
  ["workers", "archived_at"],
  ["cash_advances", "archived_at"],
  ["cash_advances", "archived_by"],
  ["attendance_records", "archived_at"],
  ["attendance_records", "cancelled_at"],
  ["equipment", "archived_at"],
  ["equipment_requests", "archived_at"],
  ["goods_received_notes", "archived_at"],
  ["site_instructions", "archived_at"],

  // @mentions on record comments (Phase Q)
  ["record_comments", "mentioned_user_ids"],

  // Sprint 10 offline-first idempotency keys
  ["daily_site_reports", "client_id"],
  ["attendance_records", "client_id"],
  ["material_requests", "client_id"],
  ["hse_incidents", "client_id"],

  // Sprint 15 — project schedule
  ["project_tasks", "site_id"],
  ["project_tasks", "status"],
  ["project_tasks", "planned_start_date"],
  ["project_tasks", "planned_end_date"],
  ["project_tasks", "completion_percent"],
  ["project_tasks", "assigned_to"],

  // Sprint 16 — department reporting
  ["department_reports", "department"],
  ["department_reports", "period"],
  ["department_reports", "status"],
  ["department_reports", "submitted_by"],
  ["department_reports", "reviewed_by"],

  // Sprint 17 — subcontractor workflow
  ["subcontractors", "company_name"],
  ["subcontractors", "status"],
  ["subcontractors", "retention_percent"],
  ["subcontractor_assignments", "subcontractor_id"],
  ["subcontractor_assignments", "site_id"],
  ["subcontractor_assignments", "status"],
  ["subcontractor_payments", "assignment_id"],
  ["subcontractor_payments", "payment_type"],
  ["subcontractor_payments", "status"],
];

const REQUIRED_TABLES = [
  "hse_weekly_reports", // Phase K2
  "invoice_number_counters", // Sprint 9 — ZRA-compliant invoice sequence
  "audit_events_archive", // Sprint 11 — retention policy
  "notifications_archive", // Sprint 11 — retention policy
  "project_tasks", // Sprint 15 — project schedule
  "department_reports", // Sprint 16 — department reporting
  "subcontractors", // Sprint 17
  "subcontractor_assignments", // Sprint 17
  "subcontractor_payments", // Sprint 17
];

const REQUIRED_FUNCTIONS = [
  "ops_next_invoice_number",
  "ops_archive_audit_events",
  "ops_archive_notifications",
];

const REQUIRED_REALTIME_PUBLICATIONS = [
  "notifications",
  "approval_requests",
  "record_comments",
  "boq_documents",
  "material_requests",
  "invoices",
  "payment_requests",
  "daily_site_reports",
  "hse_incidents",
  "hse_weekly_reports",
  "project_tasks", // Sprint 15
  "department_reports", // Sprint 16
  "subcontractors", // Sprint 17
  "subcontractor_assignments", // Sprint 17
  "subcontractor_payments", // Sprint 17
];

// ------------------------------------------------------------------
// Implementation
// ------------------------------------------------------------------
async function ensurePg() {
  try {
    return await import("pg");
  } catch {
    console.error(
      "Schema check requires the 'pg' package. Install with:\n  npm install --save-dev pg",
    );
    process.exit(2);
  }
}

function loadDbUrl() {
  const url =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (url && url.trim().length > 0) return url;

  // Last resort: peek at .env.local
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(here, "..", ".env.local");
    const content = readFileSync(envPath, "utf8");
    const match = content.match(/^(?:SUPABASE_DB_URL|DATABASE_URL|POSTGRES_URL)=(.+)$/m);
    if (match) return match[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {
    // ignore
  }

  console.error(
    "No database URL found. Set SUPABASE_DB_URL (or DATABASE_URL) before running this script.",
  );
  process.exit(2);
}

async function main() {
  const { default: pkg } = await ensurePg();
  const { Client } = pkg;
  const url = loadDbUrl();

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const issues = [];

  // 1. Required columns
  for (const [table, column] of REQUIRED_COLUMNS) {
    const { rows } = await client.query(
      `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [table, column],
    );
    if (rows.length === 0) {
      issues.push(`MISSING COLUMN: public.${table}.${column}`);
    }
  }

  // 2. Required tables
  for (const table of REQUIRED_TABLES) {
    const { rows } = await client.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = $1`,
      [table],
    );
    if (rows.length === 0) {
      issues.push(`MISSING TABLE: public.${table}`);
    }
  }

  // 3. Required functions
  for (const fnName of REQUIRED_FUNCTIONS) {
    const { rows } = await client.query(
      `select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = $1`,
      [fnName],
    );
    if (rows.length === 0) {
      issues.push(`MISSING FUNCTION: public.${fnName}`);
    }
  }

  // 4. Realtime publication
  const { rows: publishedRows } = await client.query(
    `select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'`,
  );
  const publishedSet = new Set(publishedRows.map((r) => r.tablename));
  for (const table of REQUIRED_REALTIME_PUBLICATIONS) {
    if (!publishedSet.has(table)) {
      issues.push(`MISSING REALTIME PUBLICATION: public.${table}`);
    }
  }

  await client.end();

  if (issues.length === 0) {
    console.log(
      `[check-schema] OK — ${REQUIRED_COLUMNS.length} columns, ${REQUIRED_TABLES.length} tables, ${REQUIRED_FUNCTIONS.length} functions, ${REQUIRED_REALTIME_PUBLICATIONS.length} realtime publications confirmed.`,
    );
    process.exit(0);
  }

  console.error(`[check-schema] FAILED — ${issues.length} issue(s):`);
  for (const issue of issues) console.error("  • " + issue);
  console.error(
    "\nApply outstanding migrations from supabase/migrations/ before deploying.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[check-schema] Unexpected error:", err.message);
  process.exit(2);
});
