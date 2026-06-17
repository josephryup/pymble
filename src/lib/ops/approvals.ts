import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikePattern,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewSensitiveOpsFoundation } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsApprovalStatus,
  OpsApprovalStepStatus,
  OpsPriority,
  OpsUserRole,
} from "@/lib/ops/types";

type ApprovalUserSummary = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

type ApprovalSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsApprovalRequestSummary = {
  amount: number | null;
  created_at: string;
  currency_code: string;
  current_step_number: number;
  description: string;
  due_at: string | null;
  id: string;
  module_key: string;
  priority: OpsPriority;
  requested_by: string | null;
  requester: ApprovalUserSummary | null;
  resolved_at: string | null;
  site: ApprovalSiteSummary | null;
  site_id: string | null;
  source_id: string;
  source_table: string;
  status: OpsApprovalStatus;
  submitted_at: string | null;
  title: string;
  updated_at: string;
};

export type OpsApprovalStepSummary = {
  approval_request_id: string;
  approver_role: OpsUserRole | null;
  approver_sequence: number;
  approver_user_id: string | null;
  comments: string;
  created_at: string;
  decision_at: string | null;
  decision_by: string | null;
  decision_user?: ApprovalUserSummary | null;
  due_at: string | null;
  id: string;
  status: OpsApprovalStepStatus;
  step_label: string;
  step_number: number;
};

export type OpsApprovalComment = {
  author: ApprovalUserSummary | null;
  author_id: string | null;
  body: string;
  created_at: string;
  id: string;
};

type RawApprovalRequest = Omit<OpsApprovalRequestSummary, "amount"> & {
  amount: number | string | null;
  requester: ApprovalUserSummary | ApprovalUserSummary[] | null;
  site: ApprovalSiteSummary | ApprovalSiteSummary[] | null;
};

type RawApprovalStep = Omit<OpsApprovalStepSummary, "decision_user"> & {
  decision_user: ApprovalUserSummary | ApprovalUserSummary[] | null;
};

type RawApprovalComment = Omit<OpsApprovalComment, "author"> & {
  author: ApprovalUserSummary | ApprovalUserSummary[] | null;
};

export type FetchOpsApprovalRequestsOptions = {
  limit?: number;
  moduleKey?: string;
  moduleKeys?: string[];
  query?: string;
  status?: OpsApprovalStatus | OpsApprovalStatus[];
};

export type FetchPaginatedOpsApprovalRequestsOptions = FetchOpsApprovalRequestsOptions & {
  listState: OpsListState;
};

function normalizeAmount(value: number | string | null) {
  return value === null ? null : Number(value);
}

function normalizeLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 25, 1), 100);
}

function normalizeRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function assignedApprovalRequestIds(userId: string, role: OpsUserRole) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_steps")
    .select("approval_request_id")
    .or(`approver_user_id.eq.${userId},approver_role.eq.${role}`);

  if (error) {
    throw error;
  }

  return Array.from(new Set((data ?? []).map((step) => step.approval_request_id as string)));
}

export async function fetchOpsApprovalRequests(
  options: FetchPaginatedOpsApprovalRequestsOptions,
): Promise<OpsPaginatedResult<OpsApprovalRequestSummary>>;
export async function fetchOpsApprovalRequests(
  options?: FetchOpsApprovalRequestsOptions,
): Promise<OpsApprovalRequestSummary[]>;
export async function fetchOpsApprovalRequests(
  options: FetchOpsApprovalRequestsOptions | FetchPaginatedOpsApprovalRequestsOptions = {},
) {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const limit = normalizeLimit(options.limit);
  const listState = "listState" in options ? options.listState : undefined;

  let query = supabase
    .from("approval_requests")
    .select(
      [
        "id",
        "module_key",
        "source_table",
        "source_id",
        "site_id",
        "title",
        "description",
        "priority",
        "status",
        "amount",
        "currency_code",
        "requested_by",
        "current_step_number",
        "submitted_at",
        "resolved_at",
        "due_at",
        "created_at",
        "updated_at",
        "requester:users!approval_requests_requested_by_fkey(id, full_name, role)",
        "site:sites(id, code, name)",
      ].join(", "),
      listState ? { count: "exact" } : undefined,
    )
    .order("created_at", { ascending: false });

  if (options.moduleKey) {
    query = query.eq("module_key", options.moduleKey);
  }

  if (options.moduleKeys && options.moduleKeys.length > 0) {
    query = query.in("module_key", options.moduleKeys);
  }

  if (Array.isArray(options.status)) {
    query = query.in("status", options.status);
  } else if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchPattern = opsIlikePattern(options.query ?? "");

  if (searchPattern) {
    query = query.ilike("title", searchPattern);
  }

  if (!canViewSensitiveOpsFoundation(profile.role)) {
    const assignedIds = await assignedApprovalRequestIds(profile.id, profile.role);

    query =
      assignedIds.length > 0
        ? query.or(`requested_by.eq.${profile.id},id.in.(${assignedIds.join(",")})`)
        : query.eq("requested_by", profile.id);
  }

  const { data, error, count } = await (listState
    ? query.range(listState.from, listState.to)
    : query.limit(limit));

  if (error) {
    throw error;
  }

  const items = ((data ?? []) as unknown as RawApprovalRequest[]).map((request) => ({
    ...request,
    amount: normalizeAmount(request.amount),
    requester: normalizeRelation(request.requester),
    site: normalizeRelation(request.site),
  }));

  return listState ? toOpsPaginatedResult(items, count, listState) : items;
}

export async function fetchOpsApprovalRequest(approvalRequestId: string) {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select(
      [
        "id",
        "module_key",
        "source_table",
        "source_id",
        "site_id",
        "title",
        "description",
        "priority",
        "status",
        "amount",
        "currency_code",
        "requested_by",
        "current_step_number",
        "submitted_at",
        "resolved_at",
        "due_at",
        "created_at",
        "updated_at",
        "requester:users!approval_requests_requested_by_fkey(id, full_name, role)",
        "site:sites(id, code, name)",
      ].join(", "),
    )
    .eq("id", approvalRequestId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const request = data as unknown as RawApprovalRequest;

  if (!canViewSensitiveOpsFoundation(profile.role) && request.requested_by !== profile.id) {
    const assignedIds = await assignedApprovalRequestIds(profile.id, profile.role);

    if (!assignedIds.includes(approvalRequestId)) {
      return null;
    }
  }

  return {
    ...request,
    amount: normalizeAmount(request.amount),
    requester: normalizeRelation(request.requester),
    site: normalizeRelation(request.site),
  } satisfies OpsApprovalRequestSummary;
}

export async function fetchOpsApprovalSteps(approvalRequestId: string) {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  if (!canViewSensitiveOpsFoundation(profile.role)) {
    const allowedRequestIds = await assignedApprovalRequestIds(profile.id, profile.role);
    const canAccess = allowedRequestIds.includes(approvalRequestId);

    if (!canAccess) {
      const { count, error } = await supabase
        .from("approval_requests")
        .select("id", { count: "exact", head: true })
        .eq("id", approvalRequestId)
        .eq("requested_by", profile.id);

      if (error) {
        throw error;
      }

      if ((count ?? 0) === 0) {
        return [];
      }
    }
  }

  const { data, error } = await supabase
    .from("approval_steps")
    .select(
      "id, approval_request_id, step_number, approver_sequence, step_label, approver_role, approver_user_id, status, decision_by, decision_at, due_at, comments, created_at, decision_user:users!approval_steps_decision_by_fkey(id, full_name, role)",
    )
    .eq("approval_request_id", approvalRequestId)
    .order("step_number", { ascending: true })
    .order("approver_sequence", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawApprovalStep[]).map((step) => ({
    ...step,
    decision_user: normalizeRelation(step.decision_user),
  }));
}

export async function fetchOpsApprovalComments(approvalRequestId: string) {
  await requireOpsUser();

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_comments")
    .select(
      "id, author_id, body, created_at, author:users!approval_comments_author_id_fkey(id, full_name, role)",
    )
    .eq("approval_request_id", approvalRequestId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawApprovalComment[]).map((comment) => ({
    ...comment,
    author: normalizeRelation(comment.author),
  }));
}

/**
 * Lightweight count of open approval requests (submitted + in_review) bucketed
 * by module_key. Used by the approvals page to show per-department tab badges
 * without re-running the full paginated query for each tab.
 */
export async function fetchOpsOpenApprovalCountsByModule(): Promise<Record<string, number>> {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("module_key")
    .in("status", ["submitted", "in_review"]);

  if (error) {
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ module_key: string | null }>) {
    if (!row.module_key) continue;
    counts[row.module_key] = (counts[row.module_key] ?? 0) + 1;
  }
  return counts;
}
