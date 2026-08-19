import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsMaterialRequestStatus } from "@/lib/ops/types";

/**
 * The material request state machine — one declaration, one writer.
 *
 * ── Why this module exists (workflow audit F2, F9, F10) ───────────────────
 * A material request's status was written from ten places across five files.
 * Each decided for itself which prior states were legal, and most decided
 * nothing at all. Three consequences, all of them live in production:
 *
 *   • TWO rival writers advanced a request to `ordered`. One wrote the
 *     committed cost entry and relieved the reservation; the other wrote
 *     neither. Whichever screen the user happened to be on decided whether the
 *     money was recorded — and all eight purchase orders in the database
 *     produced zero cost entries because the silent one is the common path.
 *
 *   • `syncMaterialRequestApprovalStatus` wrote the status with NO prior-state
 *     filter at all, so a stale or re-decided approval could throw a priced,
 *     approved or ordered request back to `pricing_pending`.
 *
 *   • Converting a requisition into DRAFT purchase orders closed the request
 *     outright, which is how four requests came to be `closed` on 1 July while
 *     the orders they were closed for sat unapproved for the next seven weeks.
 *
 * The fix is not more guards scattered further. It is: every edge is declared
 * once, here, and every writer goes through `transitionMaterialRequest`.
 *
 * ── The guarantee ─────────────────────────────────────────────────────────
 * The update is conditional on the current status being one this edge accepts.
 * A request that has moved on is left ALONE, and the caller is told the
 * transition did not apply rather than silently overwriting newer state. That
 * turns the class of bug above from data corruption into a no-op plus an audit
 * row.
 */

/** Every legal edge in the request lifecycle, named for what a person does. */
export type MaterialRequestEdge =
  | "submit"
  | "operations_review"
  | "operations_approved"
  | "operations_rejected"
  | "priced"
  | "cost_md_review"
  | "cost_approved"
  | "cost_rejected"
  | "ordered"
  | "partially_ordered"
  | "delivered"
  | "closed"
  | "cancelled";

type EdgeSpec = {
  /** Statuses this edge may be taken from. */
  from: OpsMaterialRequestStatus[];
  to: OpsMaterialRequestStatus;
  /** Human phrasing for the audit trail when the edge is refused. */
  label: string;
};

/**
 * The transition table.
 *
 * Read it as the whole workflow: Operations approves, Procurement prices,
 * Finance (then the MD, for IT) approves the cost, Procurement orders, the
 * site confirms delivery, Stores closes.
 *
 * Two deliberate shapes worth noting:
 *   • `ordered` accepts `partially_ordered`, because a second procurement
 *     round completing the request is the normal path, not an anomaly.
 *   • `closed` does NOT accept `approved`. A request that has been approved
 *     but never ordered has nothing to close — that path existed only through
 *     the RFQ-conversion bug and is deliberately removed.
 */
export const MATERIAL_REQUEST_TRANSITIONS: Record<MaterialRequestEdge, EdgeSpec> = {
  submit: {
    from: ["draft", "rejected"],
    to: "submitted",
    label: "submitted for approval",
  },
  operations_review: {
    from: ["submitted"],
    to: "in_review",
    label: "taken into operations review",
  },
  operations_approved: {
    from: ["submitted", "in_review"],
    to: "pricing_pending",
    label: "approved by Operations",
  },
  operations_rejected: {
    from: ["submitted", "in_review"],
    to: "rejected",
    label: "rejected by Operations",
  },
  priced: {
    from: ["pricing_pending", "priced"],
    to: "priced",
    label: "priced by Procurement",
  },
  cost_md_review: {
    from: ["priced"],
    to: "md_review",
    label: "sent to the MD for final approval",
  },
  cost_approved: {
    from: ["priced", "md_review"],
    to: "approved",
    label: "cost approved",
  },
  cost_rejected: {
    from: ["priced", "md_review"],
    to: "rejected",
    label: "cost rejected",
  },
  ordered: {
    from: ["approved", "partially_ordered", "ordered"],
    to: "ordered",
    label: "fully ordered",
  },
  partially_ordered: {
    from: ["approved", "partially_ordered"],
    to: "partially_ordered",
    label: "partially ordered",
  },
  delivered: {
    from: ["ordered", "partially_ordered", "delivered"],
    to: "delivered",
    label: "confirmed as delivered",
  },
  closed: {
    from: ["ordered", "partially_ordered", "delivered"],
    to: "closed",
    label: "closed",
  },
  cancelled: {
    from: [
      "draft",
      "submitted",
      "in_review",
      "pricing_pending",
      "priced",
      "md_review",
      "approved",
      "partially_ordered",
      "rejected",
    ],
    to: "cancelled",
    label: "cancelled",
  },
};

/** Statuses from which nothing further may happen. */
export const TERMINAL_MATERIAL_REQUEST_STATUSES: OpsMaterialRequestStatus[] = [
  "closed",
  "cancelled",
];

export type TransitionResult = {
  /** False when the request had already moved past this edge. */
  applied: boolean;
  /** The status now on the row, whether or not this call changed it. */
  status: OpsMaterialRequestStatus | null;
  to: OpsMaterialRequestStatus;
};

/**
 * Take one edge of the lifecycle, conditionally on the request still being
 * somewhere this edge accepts.
 *
 * `patch` carries the columns that belong WITH the status — `ordered_at`,
 * `cost_approved_by` and so on — so a stamp can never be written by a call
 * whose status change was refused. That pairing is the whole point: the two
 * used to be separate updates, and a refused transition still left its
 * timestamps behind.
 *
 * Returns rather than throws. A refused transition is usually a double submit
 * or a stale tab, which is not an error worth showing anyone — but it IS worth
 * recording, so it lands in the audit trail where the integrity report can see
 * it.
 */
export async function transitionMaterialRequest(input: {
  requestId: string;
  edge: MaterialRequestEdge;
  actorUserId: string | null;
  /** Extra columns written atomically with the status. */
  patch?: Record<string, unknown>;
  /**
   * Narrow the accepted prior states further than the table allows. Used where
   * a caller knows more than the edge does — e.g. only settling a request the
   * caller has already read as `approved`.
   */
  restrictFrom?: OpsMaterialRequestStatus[];
  /** Context for the audit row when the transition is refused. */
  reason?: string;
}): Promise<TransitionResult> {
  const spec = MATERIAL_REQUEST_TRANSITIONS[input.edge];
  const allowedFrom = input.restrictFrom
    ? spec.from.filter((status) => input.restrictFrom?.includes(status))
    : spec.from;

  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("material_requests")
    .update({ ...(input.patch ?? {}), status: spec.to })
    .eq("id", input.requestId)
    .in("status", allowedFrom)
    .select("id, status")
    .maybeSingle<{ id: string; status: OpsMaterialRequestStatus }>();

  if (error) {
    throw error;
  }

  if (data) {
    return { applied: true, status: data.status, to: spec.to };
  }

  // Refused. Read the row back so the audit says what it actually found, then
  // leave everything as it is.
  const { data: current } = await supabase
    .from("material_requests")
    .select("status, request_number")
    .eq("id", input.requestId)
    .maybeSingle<{ status: OpsMaterialRequestStatus; request_number: string }>();

  await recordOpsAuditEvent({
    action: "material_request.transition_refused",
    actorUserId: input.actorUserId,
    entityId: input.requestId,
    entityType: "material_request",
    metadata: {
      edge: input.edge,
      to: spec.to,
      allowed_from: allowedFrom,
      found_status: current?.status ?? null,
      reason: input.reason ?? null,
    },
    moduleKey: "material_requests",
    sourceId: input.requestId,
    sourceTable: "material_requests",
    summary: `${current?.request_number ?? "A material request"} could not be ${spec.label} — it is ${current?.status ?? "gone"}.`,
  }).catch(() => null);

  return { applied: false, status: current?.status ?? null, to: spec.to };
}

/**
 * Withdraw whatever approval a request has open.
 *
 * Terminal transitions must release everything the request was holding, and
 * that includes queue items — not only the budget reservation the cancel path
 * already relieved. Without this, a cancelled request left a live approval
 * whose steps stayed `pending`, so its approvers kept an item asking them to
 * authorise something that no longer existed (23 such steps had accumulated by
 * 19 Aug 2026).
 */
export async function withdrawOpenMaterialRequestApprovals(input: {
  requestId: string;
  resolvedAtIso: string;
}): Promise<number> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: open } = await supabase
    .from("approval_requests")
    .select("id")
    .eq("source_table", "material_requests")
    .eq("source_id", input.requestId)
    .in("status", ["draft", "submitted", "in_review"]);

  const ids = ((open ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) {
    return 0;
  }

  await supabase
    .from("approval_steps")
    .update({ status: "cancelled" })
    .in("approval_request_id", ids)
    .eq("status", "pending");

  await supabase
    .from("approval_requests")
    .update({ status: "cancelled", resolved_at: input.resolvedAtIso })
    .in("id", ids);

  return ids.length;
}
