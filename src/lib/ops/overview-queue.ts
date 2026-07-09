import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsQueueItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "default" | "warn";
};

const LEADERSHIP: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
];
const PROCUREMENT: OpsUserRole[] = [
  ...LEADERSHIP,
  "procurement_manager",
  "procurement",
  "procurement_assistant",
];
const FINANCE: OpsUserRole[] = [...LEADERSHIP, "finance_manager", "accountant"];
const HR: OpsUserRole[] = [...LEADERSHIP, "human_resource", "hr", "admin_receptionist"];
const APPROVERS: OpsUserRole[] = [
  ...LEADERSHIP,
  "finance_manager",
  "procurement_manager",
  "operations_manager",
];
// Mirrors canApproveMaterialRequestMdReview (material-request-permissions.ts) — the
// MD is the final gate on confidential IT-scoped material requests.
const MD_REVIEWERS: OpsUserRole[] = ["developer", "owner", "managing_director"];
// Equipment + transport request approvals (EQUIPMENT_REVIEW_ROLES /
// FLEET_LOGISTICS_DECISION_ROLES minus the HR-only seats).
const OPERATIONS_APPROVERS: OpsUserRole[] = [
  ...LEADERSHIP,
  "operations_manager",
  "projects_manager",
];
// Commercial certification/approval decisions (COMMERCIAL_DECISION_ROLES).
const COMMERCIAL_DECIDERS: OpsUserRole[] = [
  ...LEADERSHIP,
  "projects_manager",
  "quantity_surveyor",
  "finance_manager",
];

type QueueTask = {
  key: string;
  label: string;
  href: string;
  tone: "default" | "warn";
  run: Promise<number>;
};

/**
 * Builds a small, role-scoped "what needs my attention" queue from open records.
 * Each query is a head count; only items with a count > 0 are returned so the
 * widget stays focused. Failures degrade to 0 rather than breaking the overview.
 */
/**
 * Counts approvals that are actionable by this viewer RIGHT NOW. Every step in
 * a chain is inserted as `pending` at submission, so a plain pending-steps
 * count would summon later-step approvers before the chain reaches them —
 * they'd click through only to find "waiting for the assigned approver".
 * Actionable = pending step assigned to me/my role AND the request is open
 * AND the chain's current step is this step.
 */
async function countActionableApprovals(
  supabase: ReturnType<typeof getOpsSupabaseServiceClient>,
  role: OpsUserRole,
  userId: string,
) {
  type Row = {
    approval_request_id: string;
    step_number: number;
    approval_requests:
      | { current_step_number: number }
      | { current_step_number: number }[]
      | null;
  };

  const { data, error } = await supabase
    .from("approval_steps")
    .select("approval_request_id, step_number, approval_requests!inner(current_step_number)")
    .eq("status", "pending")
    .or(`approver_user_id.eq.${userId},approver_role.eq.${role}`)
    .in("approval_requests.status", ["submitted", "in_review"])
    .limit(500);

  if (error || !data) return 0;

  const actionableRequestIds = new Set(
    (data as Row[])
      .filter((row) => {
        const request = Array.isArray(row.approval_requests)
          ? row.approval_requests[0]
          : row.approval_requests;
        return request && row.step_number === request.current_step_number;
      })
      .map((row) => row.approval_request_id),
  );

  return actionableRequestIds.size;
}

export async function fetchOpsMyQueue(role: OpsUserRole, userId: string): Promise<OpsQueueItem[]> {
  const supabase = getOpsSupabaseServiceClient();
  const count = (builder: PromiseLike<{ count: number | null }>) =>
    Promise.resolve(builder)
      .then((result) => result.count ?? 0)
      .catch(() => 0);

  const tasks: QueueTask[] = [];

  if (APPROVERS.includes(role)) {
    tasks.push({
      key: "approvals",
      label: "Approvals awaiting your decision",
      href: "/ops/approvals",
      tone: "warn",
      run: countActionableApprovals(supabase, role, userId).catch(() => 0),
    });
  }

  if (PROCUREMENT.includes(role)) {
    tasks.push({
      key: "to_procure",
      label: "Approved requests to turn into RFQs",
      href: "/ops/material-requests?status=approved",
      tone: "warn",
      run: count(
        supabase
          .from("material_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
      ),
    });
    tasks.push({
      key: "po_pending",
      label: "Purchase orders pending approval",
      href: "/ops/rfq-po",
      tone: "default",
      run: count(
        supabase
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "approval_pending"),
      ),
    });
  }

  if (FINANCE.includes(role)) {
    tasks.push({
      key: "payments",
      label: "Payment requests to review",
      href: "/ops/payment-requests",
      tone: "warn",
      run: count(
        supabase
          .from("payment_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "finance_review"]),
      ),
    });
    // Material requests priced by Procurement wait on a Finance cost decision —
    // a bespoke status-column transition, not an approval_steps row, so it
    // never surfaced via countActionableApprovals above. Previously the only
    // signal Finance got was a one-time notification when it was priced.
    tasks.push({
      key: "material_requests_priced",
      label: "Material requests — cost approval needed",
      href: "/ops/material-requests?status=priced",
      tone: "warn",
      run: count(
        supabase
          .from("material_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "priced"),
      ),
    });
    // Subcontractor payments live in their own table (subcontractor_payments),
    // disconnected from payment_requests — see
    // docs/pymble-ops-subcontractor-payments-audit.md. Without this, a pending
    // payment was only visible by opening /ops/subcontractors directly.
    tasks.push({
      key: "subcontractor_payments_pending",
      label: "Subcontractor payments to review",
      href: "/ops/subcontractors",
      tone: "warn",
      run: count(
        supabase
          .from("subcontractor_payments")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .is("archived_at", null),
      ),
    });
  }

  if (MD_REVIEWERS.includes(role)) {
    // Confidential IT-scoped material requests: Finance approves the cost,
    // then the MD is the final gate (md_review status) before Procurement can
    // order. See docs/pymble-ops-it-material-requests-... — same visibility
    // gap as the Finance cost-approval stage above.
    tasks.push({
      key: "md_review",
      label: "IT requests awaiting your approval",
      href: "/ops/material-requests?status=md_review",
      tone: "warn",
      run: count(
        supabase
          .from("material_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "md_review"),
      ),
    });
  }

  if (OPERATIONS_APPROVERS.includes(role)) {
    tasks.push({
      key: "equipment_requests",
      label: "Equipment requests to approve",
      href: "/ops/equipment?status=submitted#equipment-request-register",
      tone: "warn",
      run: count(
        supabase
          .from("equipment_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ),
    });
    tasks.push({
      key: "transport_requests",
      label: "Transport requests to approve",
      href: "/ops/fleet-logistics?status=submitted#transport-register",
      tone: "warn",
      run: count(
        supabase
          .from("transport_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ),
    });
  }

  if (COMMERCIAL_DECIDERS.includes(role)) {
    tasks.push({
      key: "commercial_decisions",
      label: "Commercial records awaiting decision",
      href: "/ops/commercial",
      tone: "warn",
      run: Promise.all([
        count(
          supabase
            .from("commercial_ipcs")
            .select("id", { count: "exact", head: true })
            .eq("status", "submitted"),
        ),
        count(
          supabase
            .from("commercial_variations")
            .select("id", { count: "exact", head: true })
            .in("status", ["submitted", "priced"]),
        ),
        count(
          supabase
            .from("commercial_claims")
            .select("id", { count: "exact", head: true })
            .in("status", ["submitted", "under_review"]),
        ),
        count(
          supabase
            .from("commercial_valuations")
            .select("id", { count: "exact", head: true })
            .eq("status", "submitted"),
        ),
        count(
          supabase
            .from("commercial_retention_releases")
            .select("id", { count: "exact", head: true })
            .eq("status", "submitted"),
        ),
      ]).then((counts) => counts.reduce((sum, value) => sum + value, 0)),
    });
  }

  if ([...LEADERSHIP, "general_manager"].includes(role)) {
    tasks.push({
      key: "payroll_runs",
      label: "Payroll runs awaiting approval",
      href: "/ops/payroll",
      tone: "warn",
      run: Promise.all([
        count(
          supabase
            .from("payroll_runs")
            .select("id", { count: "exact", head: true })
            .eq("status", "draft"),
        ),
        count(
          supabase
            .from("staff_payroll_runs")
            .select("id", { count: "exact", head: true })
            .eq("status", "draft"),
        ),
      ]).then((counts) => counts.reduce((sum, value) => sum + value, 0)),
    });
  }

  if (HR.includes(role)) {
    tasks.push({
      key: "leave",
      label: "Leave requests to approve",
      href: "/ops/employees",
      tone: "default",
      run: count(
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ),
    });
    tasks.push({
      key: "applications",
      label: "New job applications to review",
      href: "/ops/recruitment#applications",
      tone: "default",
      run: count(
        supabase
          .from("job_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "new"),
      ),
    });
  }

  // Personal: drafts the signed-in user still needs to submit.
  tasks.push({
    key: "my_drafts",
    label: "My material requests to submit",
    href: "/ops/material-requests?status=draft",
    tone: "default",
    run: count(
      supabase
        .from("material_requests")
        .select("id", { count: "exact", head: true })
        .eq("requested_by", userId)
        .eq("status", "draft"),
    ),
  });

  const counts = await Promise.all(tasks.map((task) => task.run));

  return tasks
    .map((task, index) => ({
      key: task.key,
      label: task.label,
      count: counts[index],
      href: task.href,
      tone: task.tone,
    }))
    .filter((item) => item.count > 0);
}
