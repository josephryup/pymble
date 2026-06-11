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
const APPROVERS: OpsUserRole[] = [...LEADERSHIP, "finance_manager", "procurement_manager"];

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
      label: "Approvals awaiting a decision",
      href: "/ops/approvals",
      tone: "warn",
      run: count(
        supabase
          .from("approval_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "in_review"]),
      ),
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
