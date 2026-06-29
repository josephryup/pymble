import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type OpsSubcontractorKind = "company" | "general";

export type OpsSubcontractorStatus =
  | "prospect"
  | "kyc_pending"
  | "approved"
  | "suspended"
  | "blacklisted";

export type OpsSubcontractorAssignmentStatus =
  | "planned"
  | "active"
  | "completed"
  | "cancelled";

export type OpsSubcontractorPaymentType =
  | "advance"
  | "interim"
  | "retention_release"
  | "final";

export type OpsSubcontractorPaymentStatus =
  | "pending"
  | "approved"
  | "paid"
  | "rejected";

export type OpsSubcontractor = {
  id: string;
  kind: OpsSubcontractorKind;
  company_name: string;
  trade_specialty: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  tpin: string;
  registration_number: string;
  bank_name: string;
  bank_account_number: string;
  status: OpsSubcontractorStatus;
  kyc_notes: string;
  performance_rating: number | null;
  performance_notes: string;
  retention_percent: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type OpsSubcontractorAssignment = {
  id: string;
  subcontractor_id: string;
  site_id: string;
  project_task_id: string | null;
  scope: string;
  agreed_amount: number;
  start_date: string;
  end_date: string | null;
  status: OpsSubcontractorAssignmentStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  site: { id: string; code: string; name: string } | null;
  project_task: { id: string; title: string } | null;
};

export type OpsSubcontractorPayment = {
  id: string;
  assignment_id: string;
  payment_type: OpsSubcontractorPaymentType;
  amount: number;
  retention_held: number;
  reference: string;
  status: OpsSubcontractorPaymentStatus;
  scheduled_for: string | null;
  paid_at: string | null;
  requested_by: string | null;
  approved_by: string | null;
  notes: string;
  created_at: string;
};

type Relation<T> = T | T[] | null;

function pickRel<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const SUB_SELECT =
  "id, kind, company_name, trade_specialty, contact_name, contact_phone, contact_email, tpin, registration_number, bank_name, bank_account_number, status, kyc_notes, performance_rating, performance_notes, retention_percent, created_at, updated_at, archived_at";

const ASSIGNMENT_SELECT = [
  "id",
  "subcontractor_id",
  "site_id",
  "project_task_id",
  "scope",
  "agreed_amount",
  "start_date",
  "end_date",
  "status",
  "notes",
  "created_at",
  "updated_at",
  "archived_at",
  "site:sites!subcontractor_assignments_site_id_fkey(id, code, name)",
  "project_task:project_tasks!subcontractor_assignments_project_task_id_fkey(id, title)",
].join(", ");

const PAYMENT_SELECT =
  "id, assignment_id, payment_type, amount, retention_held, reference, status, scheduled_for, paid_at, requested_by, approved_by, notes, created_at";

type RawAssignment = Omit<
  OpsSubcontractorAssignment,
  "site" | "project_task"
> & {
  site: Relation<NonNullable<OpsSubcontractorAssignment["site"]>>;
  project_task: Relation<NonNullable<OpsSubcontractorAssignment["project_task"]>>;
};

export async function fetchOpsSubcontractors() {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("subcontractors")
    .select(SUB_SELECT)
    .is("archived_at", null)
    .order("company_name", { ascending: true });
  if (error) {
    logOpsServerError(error, {
      module: "subcontractors",
      action: "fetchOpsSubcontractors",
    });
    throw error;
  }
  return (data ?? []) as OpsSubcontractor[];
}

export async function fetchOpsSubcontractorById(id: string) {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("subcontractors")
    .select(SUB_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logOpsServerError(error, {
      module: "subcontractors",
      action: "fetchOpsSubcontractorById",
      entityId: id,
    });
    throw error;
  }
  return data ? (data as OpsSubcontractor) : null;
}

export async function fetchOpsSubcontractorAssignments(subcontractorId: string) {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("subcontractor_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("subcontractor_id", subcontractorId)
    .is("archived_at", null)
    .order("start_date", { ascending: false });
  if (error) {
    logOpsServerError(error, {
      module: "subcontractor_assignments",
      action: "fetchOpsSubcontractorAssignments",
      entityId: subcontractorId,
    });
    throw error;
  }
  return ((data ?? []) as unknown as RawAssignment[]).map((row) => ({
    ...row,
    site: pickRel(row.site),
    project_task: pickRel(row.project_task),
  })) as OpsSubcontractorAssignment[];
}

export async function fetchOpsSubcontractorPayments(assignmentIds: string[]) {
  if (assignmentIds.length === 0) return [] as OpsSubcontractorPayment[];
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("subcontractor_payments")
    .select(PAYMENT_SELECT)
    .in("assignment_id", assignmentIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    logOpsServerError(error, {
      module: "subcontractor_payments",
      action: "fetchOpsSubcontractorPayments",
    });
    throw error;
  }
  return (data ?? []) as OpsSubcontractorPayment[];
}

export type OpsSubcontractorFinancials = {
  agreedTotal: number;
  approvedPaid: number;
  pendingApprovals: number;
  retentionHeld: number;
};

export function computeOpsSubcontractorFinancials(
  assignments: OpsSubcontractorAssignment[],
  payments: OpsSubcontractorPayment[],
): OpsSubcontractorFinancials {
  const agreedTotal = assignments.reduce(
    (sum, a) => sum + Number(a.agreed_amount ?? 0),
    0,
  );
  let approvedPaid = 0;
  let pendingApprovals = 0;
  let retentionHeld = 0;
  for (const payment of payments) {
    if (payment.status === "paid") approvedPaid += Number(payment.amount);
    if (payment.status === "pending") pendingApprovals += Number(payment.amount);
    retentionHeld += Number(payment.retention_held);
  }
  return {
    agreedTotal: Math.round(agreedTotal * 100) / 100,
    approvedPaid: Math.round(approvedPaid * 100) / 100,
    pendingApprovals: Math.round(pendingApprovals * 100) / 100,
    retentionHeld: Math.round(retentionHeld * 100) / 100,
  };
}
