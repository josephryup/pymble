import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewAllOpsMaterialRequests } from "@/lib/ops/material-request-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsApprovalStatus,
  OpsMaterialRequestStatus,
  OpsPriority,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsMaterialRequestSiteSummary = {
  code: string;
  id: string;
  location: string;
  name: string;
};

export type OpsMaterialRequestUserSummary = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsMaterialRequestItem = {
  actual_total: number;
  actual_unit_cost: number;
  created_at: string;
  estimated_total: number;
  estimated_unit_cost: number;
  id: string;
  item_name: string;
  line_number: number;
  notes: string;
  quantity: number;
  request_id: string;
  specification: string;
  supplier_id: string | null;
  supplier_name: string | null;
  unit: string;
};

export type OpsMaterialRequestSummary = {
  actual_total: number;
  approval_request_id: string | null;
  approval_status: OpsApprovalStatus | null;
  approved_at: string | null;
  closed_at: string | null;
  created_at: string;
  description: string;
  estimated_total: number;
  id: string;
  items: OpsMaterialRequestItem[];
  needed_by: string | null;
  ordered_at: string | null;
  priced_at: string | null;
  priced_by: string | null;
  priority: OpsPriority;
  rejected_at: string | null;
  request_number: string;
  requested_by: string | null;
  requester: OpsMaterialRequestUserSummary | null;
  site: OpsMaterialRequestSiteSummary | null;
  site_id: string;
  status: OpsMaterialRequestStatus;
  submitted_at: string | null;
  title: string;
  updated_at: string;
};

export type FetchOpsMaterialRequestsOptions = {
  limit?: number;
  query?: string;
  status?: OpsMaterialRequestStatus;
};

export type FetchPaginatedOpsMaterialRequestsOptions = FetchOpsMaterialRequestsOptions & {
  listState: OpsListState;
};

export type OpsChainStepDescriptor = {
  key: string;
  label: string;
  state: "done" | "current" | "pending" | "rejected";
  caption: string | null;
  href: string | null;
};

function chainDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(value));
}

/**
 * Maps a material request to its position in the
 * Request → Submit → Approve → Procure (RFQ/PO) → Close chain.
 * Derived entirely from the request's own status + timestamps (no extra query).
 */
export function buildMaterialRequestChainSteps(
  request: Pick<
    OpsMaterialRequestSummary,
    | "status"
    | "request_number"
    | "created_at"
    | "submitted_at"
    | "approved_at"
    | "rejected_at"
    | "ordered_at"
    | "closed_at"
    | "priced_at"
  >,
): OpsChainStepDescriptor[] {
  const s = request.status;

  if (s === "cancelled") {
    return [
      {
        key: "requested",
        label: "Requested",
        state: "done",
        caption: chainDate(request.created_at),
        href: null,
      },
      { key: "cancelled", label: "Cancelled", state: "rejected", caption: null, href: null },
    ];
  }

  const submittedDone = [
    "submitted",
    "in_review",
    "pricing_pending",
    "priced",
    "approved",
    "ordered",
    "closed",
  ].includes(s);
  const operationsApprovedDone = [
    "pricing_pending",
    "priced",
    "approved",
    "ordered",
    "closed",
  ].includes(s);
  const pricedDone = ["priced", "approved", "ordered", "closed"].includes(s);
  const financeApprovedDone = ["approved", "ordered", "closed"].includes(s);
  const orderedDone = ["ordered", "closed"].includes(s);
  const rejected = s === "rejected";

  return [
    {
      key: "requested",
      label: "Requested",
      state: "done",
      caption: chainDate(request.created_at),
      href: null,
    },
    {
      key: "submitted",
      label: "Submitted",
      state: submittedDone ? "done" : s === "draft" ? "current" : "pending",
      caption: chainDate(request.submitted_at) ?? (s === "draft" ? "Awaiting submission" : null),
      href: null,
    },
    {
      key: "operations_approved",
      label: rejected ? "Rejected" : "Operations approved",
      state: rejected
        ? "rejected"
        : operationsApprovedDone
          ? "done"
          : ["submitted", "in_review"].includes(s)
            ? "current"
            : "pending",
      caption: rejected
        ? chainDate(request.rejected_at)
        : (chainDate(request.approved_at) ??
          (["submitted", "in_review"].includes(s) ? "Awaiting Operations" : null)),
      href: null,
    },
    {
      key: "priced",
      label: "Priced by Procurement",
      state: pricedDone
        ? "done"
        : s === "pricing_pending"
          ? "current"
          : "pending",
      caption:
        chainDate(request.priced_at) ??
        (s === "pricing_pending" ? "Procurement attaching prices" : null),
      href: null,
    },
    {
      key: "finance_approved",
      label: "Finance approved",
      state: financeApprovedDone
        ? "done"
        : s === "priced"
          ? "current"
          : "pending",
      caption: financeApprovedDone
        ? "Cost approved"
        : s === "priced"
          ? "Awaiting Finance"
          : null,
      href: null,
    },
    {
      key: "procured",
      label: "Procured (RFQ / Purchase Order)",
      state: orderedDone ? "done" : s === "approved" ? "current" : "pending",
      caption: chainDate(request.ordered_at) ?? (s === "approved" ? "Ready to procure" : null),
      href: orderedDone || s === "approved" ? "/ops/rfq-po" : null,
    },
    {
      key: "closed",
      label: "Closed",
      state: s === "closed" ? "done" : "pending",
      caption: chainDate(request.closed_at),
      href: null,
    },
  ];
}

type RawMaterialRequest = Omit<
  OpsMaterialRequestSummary,
  "actual_total" | "approval_status" | "estimated_total" | "items" | "requester" | "site"
> & {
  requester: OpsMaterialRequestUserSummary | OpsMaterialRequestUserSummary[] | null;
  site: OpsMaterialRequestSiteSummary | OpsMaterialRequestSiteSummary[] | null;
};

type RawMaterialRequestItem = Omit<
  OpsMaterialRequestItem,
  "actual_total" | "actual_unit_cost" | "estimated_total" | "estimated_unit_cost" | "quantity" | "supplier_name"
> & {
  actual_total: number | string;
  actual_unit_cost: number | string;
  estimated_total: number | string;
  estimated_unit_cost: number | string;
  quantity: number | string;
  supplier_name_freeform: string | null;
  supplier: { name: string } | { name: string }[] | null;
};

type RawMaterialRequestApproval = {
  created_at: string;
  id: string;
  source_id: string;
  status: OpsApprovalStatus;
};

function normalizeMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 25, 1), 100);
}

function normalizeRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function groupItemsByRequestId(items: RawMaterialRequestItem[]) {
  const grouped = new Map<string, OpsMaterialRequestItem[]>();

  items.forEach((item) => {
    const supplierRel = Array.isArray(item.supplier) ? item.supplier[0] ?? null : item.supplier;
    const supplierName =
      supplierRel?.name ??
      (item.supplier_name_freeform && item.supplier_name_freeform.trim().length > 0
        ? item.supplier_name_freeform
        : null);
    const { supplier: _ignoredSupplier, supplier_name_freeform: _ignoredFreeform, ...rest } = item;
    void _ignoredSupplier;
    void _ignoredFreeform;
    const normalized: OpsMaterialRequestItem = {
      ...rest,
      actual_total: normalizeMoney(item.actual_total),
      actual_unit_cost: normalizeMoney(item.actual_unit_cost),
      estimated_total: normalizeMoney(item.estimated_total),
      estimated_unit_cost: normalizeMoney(item.estimated_unit_cost),
      quantity: normalizeMoney(item.quantity),
      supplier_name: supplierName,
    };

    grouped.set(item.request_id, [...(grouped.get(item.request_id) ?? []), normalized]);
  });

  return grouped;
}

function latestApprovalBySourceId(approvals: RawMaterialRequestApproval[]) {
  const grouped = new Map<string, RawMaterialRequestApproval>();

  approvals.forEach((approval) => {
    if (!grouped.has(approval.source_id)) {
      grouped.set(approval.source_id, approval);
    }
  });

  return grouped;
}

export function calculateOpsMaterialRequestTotal(
  items: Array<Pick<OpsMaterialRequestItem, "estimated_total">>,
) {
  return items.reduce((sum, item) => sum + normalizeMoney(item.estimated_total), 0);
}

export function calculateOpsMaterialRequestActualTotal(
  items: Array<Pick<OpsMaterialRequestItem, "actual_total">>,
) {
  return items.reduce((sum, item) => sum + normalizeMoney(item.actual_total), 0);
}

async function fetchMaterialRequestItems(requestIds: string[]) {
  if (requestIds.length === 0) {
    return new Map<string, OpsMaterialRequestItem[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_request_items")
    .select(
      "id, request_id, line_number, item_name, specification, unit, quantity, estimated_unit_cost, estimated_total, actual_unit_cost, actual_total, notes, created_at, supplier_id, supplier_name_freeform, supplier:suppliers!material_request_items_supplier_id_fkey(name)",
    )
    .in("request_id", requestIds)
    .order("line_number", { ascending: true });

  if (error) {
    throw error;
  }

  return groupItemsByRequestId((data ?? []) as unknown as RawMaterialRequestItem[]);
}

async function fetchMaterialRequestApprovals(requestIds: string[]) {
  if (requestIds.length === 0) {
    return new Map<string, RawMaterialRequestApproval>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("id, source_id, status, created_at")
    .eq("module_key", "material_requests")
    .eq("source_table", "material_requests")
    .in("source_id", requestIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return latestApprovalBySourceId((data ?? []) as unknown as RawMaterialRequestApproval[]);
}

async function fetchOpsMaterialRequestItems(
  options: FetchOpsMaterialRequestsOptions = {},
  listState?: OpsListState,
) {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  let requestQuery = supabase
    .from("material_requests")
    .select(
      [
        "id",
        "request_number",
        "site_id",
        "requested_by",
        "title",
        "description",
        "priority",
        "status",
        "needed_by",
        "approval_request_id",
        "submitted_at",
        "approved_at",
        "rejected_at",
        "ordered_at",
        "closed_at",
        "priced_at",
        "priced_by",
        "created_at",
        "updated_at",
        "requester:users!material_requests_requested_by_fkey(id, full_name, role)",
        "site:sites(id, code, name, location)",
      ].join(", "),
      listState ? { count: "exact" } : undefined,
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (options.status) {
    requestQuery = requestQuery.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["request_number", "title", "description"],
    options.query ?? "",
  );

  if (searchFilter) {
    requestQuery = requestQuery.or(searchFilter);
  }

  if (!canViewAllOpsMaterialRequests(profile.role)) {
    requestQuery = requestQuery.eq("requested_by", profile.id);
  }

  const { data, error, count } = await (listState
    ? requestQuery.range(listState.from, listState.to)
    : requestQuery.limit(normalizeLimit(options.limit)));

  if (error) {
    throw error;
  }

  const requests = (data ?? []) as unknown as RawMaterialRequest[];
  const requestIds = requests.map((request) => request.id);
  const [itemsByRequestId, approvalsByRequestId] = await Promise.all([
    fetchMaterialRequestItems(requestIds),
    fetchMaterialRequestApprovals(requestIds),
  ]);

  return {
    count,
    items: requests.map((request) => {
      const items = itemsByRequestId.get(request.id) ?? [];
      const approval = approvalsByRequestId.get(request.id);

      return {
        ...request,
        actual_total: calculateOpsMaterialRequestActualTotal(items),
        approval_request_id: request.approval_request_id ?? approval?.id ?? null,
        approval_status: approval?.status ?? null,
        estimated_total: calculateOpsMaterialRequestTotal(items),
        items,
        requester: normalizeRelation(request.requester),
        site: normalizeRelation(request.site),
      } satisfies OpsMaterialRequestSummary;
    }),
  };
}

export async function fetchOpsMaterialRequests(
  options: FetchOpsMaterialRequestsOptions = {},
) {
  const result = await fetchOpsMaterialRequestItems(options);
  return result.items;
}

export async function fetchPaginatedOpsMaterialRequests(
  options: FetchPaginatedOpsMaterialRequestsOptions,
): Promise<OpsPaginatedResult<OpsMaterialRequestSummary>> {
  const result = await fetchOpsMaterialRequestItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}
