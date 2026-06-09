import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewOpsDeliveryExceptions } from "@/lib/ops/delivery-exception-permissions";
import {
  createOpsDeliveryExceptionAgeingBucketSummaries,
  getOpsDeliveryExceptionAgeDays,
  getOpsDeliveryExceptionAgeingBucket,
  getOpsDeliveryExceptionCalendarDayDelta,
  getOpsDeliveryExceptionTodayIso,
  type OpsDeliveryExceptionAgeingBucket,
  type OpsDeliveryExceptionAgeingBucketSummary,
} from "@/lib/ops/delivery-exception-reporting";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsDeliveryExceptionSeverity,
  OpsDeliveryExceptionStatus,
  OpsDeliveryExceptionType,
  OpsPurchaseOrderStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsDeliveryExceptionSupplierOption = {
  id: string;
  label: string;
  supplier_code: string;
};

export type OpsDeliveryExceptionGrnOption = {
  delivery_reference: string;
  grn_number: string;
  id: string;
  purchase_order: {
    id: string;
    po_number: string;
    status: OpsPurchaseOrderStatus;
  } | null;
  purchase_order_id: string;
  site: {
    code: string;
    id: string;
    name: string;
  } | null;
  site_id: string;
  supplier: {
    id: string;
    legal_name: string;
    supplier_code: string;
  } | null;
  supplier_id: string;
  received_at: string;
};

export type OpsDeliveryExceptionSummary = {
  assigned_to: string | null;
  assigned_to_user: {
    full_name: string;
    id: string;
    role: OpsUserRole;
  } | null;
  cancelled_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by: string | null;
  delivery_reference: string;
  description: string;
  due_at: string | null;
  exception_number: string;
  exception_type: OpsDeliveryExceptionType;
  goods_received_note: {
    delivery_reference: string;
    grn_number: string;
    id: string;
  } | null;
  goods_received_note_id: string | null;
  id: string;
  purchase_order: {
    id: string;
    po_number: string;
    status: OpsPurchaseOrderStatus;
  } | null;
  purchase_order_id: string | null;
  reported_at: string;
  reported_by: string | null;
  reported_by_user: {
    full_name: string;
    id: string;
    role: OpsUserRole;
  } | null;
  resolution_summary: string;
  resolved_at: string | null;
  severity: OpsDeliveryExceptionSeverity;
  site: {
    code: string;
    id: string;
    name: string;
  } | null;
  site_id: string;
  status: OpsDeliveryExceptionStatus;
  supplier: {
    id: string;
    legal_name: string;
    supplier_code: string;
  } | null;
  supplier_id: string;
  supplier_performance_event_id: string | null;
  title: string;
  updated_at: string;
};

export type OpsDeliveryExceptionStats = {
  closed: number;
  criticalOpen: number;
  investigating: number;
  open: number;
  resolved: number;
  total: number;
};

export type OpsDeliveryExceptionAgeingAlert = {
  age_days: number;
  bucket: OpsDeliveryExceptionAgeingBucket;
  days_until_due: number | null;
  due_at: string | null;
  exception_number: string;
  id: string;
  reported_at: string;
  severity: OpsDeliveryExceptionSeverity;
  site: OpsDeliveryExceptionSummary["site"];
  status: OpsDeliveryExceptionStatus;
  supplier: OpsDeliveryExceptionSummary["supplier"];
  title: string;
};

export type OpsDeliveryExceptionSupplierFollowUp = {
  due_soon_count: number;
  high_risk_count: number;
  investigating_count: number;
  latest_exception: Pick<
    OpsDeliveryExceptionAgeingAlert,
    "due_at" | "exception_number" | "id" | "severity" | "status" | "title"
  >;
  oldest_age_days: number;
  open_count: number;
  overdue_count: number;
  stale_no_due_count: number;
  supplier: NonNullable<OpsDeliveryExceptionSummary["supplier"]>;
  total_actionable: number;
};

export type OpsDeliveryExceptionFollowUpDashboard = {
  ageingAlerts: OpsDeliveryExceptionAgeingAlert[];
  asOfDate: string;
  buckets: OpsDeliveryExceptionAgeingBucketSummary[];
  highRiskActionable: number;
  overdueActionable: number;
  staleNoDueActionable: number;
  supplierFollowUps: OpsDeliveryExceptionSupplierFollowUp[];
  totalActionable: number;
};

export type FetchPaginatedOpsDeliveryExceptionsOptions = {
  listState: OpsListState;
  query?: string;
  severity?: OpsDeliveryExceptionSeverity;
  status?: OpsDeliveryExceptionStatus;
};

type RawRelation<T> = T | T[] | null;

type RawDeliveryException = Omit<
  OpsDeliveryExceptionSummary,
  | "assigned_to_user"
  | "goods_received_note"
  | "purchase_order"
  | "reported_by_user"
  | "site"
  | "supplier"
> & {
  assigned_to_user: RawRelation<OpsDeliveryExceptionSummary["assigned_to_user"]>;
  goods_received_note: RawRelation<OpsDeliveryExceptionSummary["goods_received_note"]>;
  purchase_order: RawRelation<OpsDeliveryExceptionSummary["purchase_order"]>;
  reported_by_user: RawRelation<OpsDeliveryExceptionSummary["reported_by_user"]>;
  site: RawRelation<OpsDeliveryExceptionSummary["site"]>;
  supplier: RawRelation<OpsDeliveryExceptionSummary["supplier"]>;
};

type RawDeliveryExceptionReportRow = Pick<
  OpsDeliveryExceptionSummary,
  | "due_at"
  | "exception_number"
  | "id"
  | "reported_at"
  | "severity"
  | "status"
  | "title"
> & {
  site: RawRelation<OpsDeliveryExceptionSummary["site"]>;
  supplier: RawRelation<OpsDeliveryExceptionSummary["supplier"]>;
};

type RawGrnOption = Omit<
  OpsDeliveryExceptionGrnOption,
  "purchase_order" | "site" | "supplier"
> & {
  purchase_order: RawRelation<OpsDeliveryExceptionGrnOption["purchase_order"]>;
  site: RawRelation<OpsDeliveryExceptionGrnOption["site"]>;
  supplier: RawRelation<OpsDeliveryExceptionGrnOption["supplier"]>;
};

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeLimit(limit: number, max = 250) {
  return Math.min(Math.max(limit, 1), max);
}

function isHighRiskSeverity(severity: OpsDeliveryExceptionSeverity) {
  return severity === "high" || severity === "critical";
}

function deliveryExceptionAlertSortScore(alert: OpsDeliveryExceptionAgeingAlert) {
  const bucketScore: Record<OpsDeliveryExceptionAgeingBucket, number> = {
    due_soon: 3,
    due_today: 6,
    on_track: 0,
    overdue: 8,
    stale_no_due: 4,
  };
  const severityScore = isHighRiskSeverity(alert.severity) ? 3 : 0;

  return bucketScore[alert.bucket] + severityScore + Math.min(alert.age_days, 30) / 30;
}

function supplierFollowUpScore(followUp: OpsDeliveryExceptionSupplierFollowUp) {
  return (
    followUp.overdue_count * 8 +
    followUp.high_risk_count * 5 +
    followUp.due_soon_count * 3 +
    followUp.stale_no_due_count * 2 +
    Math.min(followUp.oldest_age_days, 30) / 3
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function countByQuery(
  buildQuery: (
    supabase: ReturnType<typeof getOpsSupabaseServiceClient>,
  ) => PromiseLike<{ count: number | null; error: { message: string } | null }>,
) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await buildQuery(supabase);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchDeliveryExceptionSupplierOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsDeliveryExceptions(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_code, legal_name, trading_name")
    .eq("status", "active")
    .order("legal_name", { ascending: true })
    .limit(normalizeLimit(limit));

  if (error) {
    throw error;
  }

  return (data ?? []).map((supplier) => ({
    id: supplier.id as string,
    label: supplier.trading_name
      ? `${supplier.legal_name as string} (${supplier.trading_name as string})`
      : (supplier.legal_name as string),
    supplier_code: supplier.supplier_code as string,
  })) satisfies OpsDeliveryExceptionSupplierOption[];
}

export async function fetchDeliveryExceptionGrnOptions(limit = 150) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsDeliveryExceptions(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("goods_received_notes")
    .select(
      [
        "id",
        "grn_number",
        "received_at",
        "purchase_order_id",
        "supplier_id",
        "site_id",
        "delivery_reference",
        "purchase_order:purchase_orders!goods_received_notes_purchase_order_id_fkey(id, po_number, status)",
        "supplier:suppliers!goods_received_notes_supplier_id_fkey(id, supplier_code, legal_name)",
        "site:sites!goods_received_notes_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .eq("status", "posted")
    .order("received_at", { ascending: false })
    .limit(normalizeLimit(limit));

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawGrnOption[]).map((grn) => ({
    ...grn,
    purchase_order: normalizeRelation(grn.purchase_order),
    site: normalizeRelation(grn.site),
    supplier: normalizeRelation(grn.supplier),
  }));
}

export async function fetchDeliveryExceptionGrnOptionById(grnId: string) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsDeliveryExceptions(profile.role) || !isUuid(grnId)) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("goods_received_notes")
    .select(
      [
        "id",
        "grn_number",
        "received_at",
        "purchase_order_id",
        "supplier_id",
        "site_id",
        "delivery_reference",
        "purchase_order:purchase_orders!goods_received_notes_purchase_order_id_fkey(id, po_number, status)",
        "supplier:suppliers!goods_received_notes_supplier_id_fkey(id, supplier_code, legal_name)",
        "site:sites!goods_received_notes_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .eq("id", grnId)
    .eq("status", "posted")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const grn = data as unknown as RawGrnOption;

  return {
    ...grn,
    purchase_order: normalizeRelation(grn.purchase_order),
    site: normalizeRelation(grn.site),
    supplier: normalizeRelation(grn.supplier),
  } satisfies OpsDeliveryExceptionGrnOption;
}

export async function fetchPaginatedOpsDeliveryExceptions(
  options: FetchPaginatedOpsDeliveryExceptionsOptions,
): Promise<OpsPaginatedResult<OpsDeliveryExceptionSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsDeliveryExceptions(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("delivery_exceptions")
    .select(
      [
        "id",
        "exception_number",
        "supplier_id",
        "site_id",
        "purchase_order_id",
        "goods_received_note_id",
        "exception_type",
        "severity",
        "status",
        "title",
        "description",
        "delivery_reference",
        "reported_at",
        "due_at",
        "reported_by",
        "assigned_to",
        "resolution_summary",
        "supplier_performance_event_id",
        "resolved_at",
        "closed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "updated_at",
        "supplier:suppliers!delivery_exceptions_supplier_id_fkey(id, supplier_code, legal_name)",
        "site:sites!delivery_exceptions_site_id_fkey(id, code, name)",
        "purchase_order:purchase_orders!delivery_exceptions_purchase_order_id_fkey(id, po_number, status)",
        "goods_received_note:goods_received_notes!delivery_exceptions_goods_received_note_id_fkey(id, grn_number, delivery_reference)",
        "reported_by_user:users!delivery_exceptions_reported_by_fkey(id, full_name, role)",
        "assigned_to_user:users!delivery_exceptions_assigned_to_fkey(id, full_name, role)",
      ].join(", "),
      { count: "exact" },
    )
    .order("reported_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.severity) {
    query = query.eq("severity", options.severity);
  }

  const searchFilter = opsIlikeOrFilter(
    ["exception_number", "title", "description", "delivery_reference", "resolution_summary"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult(
    ((data ?? []) as unknown as RawDeliveryException[]).map((exception) => ({
      ...exception,
      assigned_to_user: normalizeRelation(exception.assigned_to_user),
      goods_received_note: normalizeRelation(exception.goods_received_note),
      purchase_order: normalizeRelation(exception.purchase_order),
      reported_by_user: normalizeRelation(exception.reported_by_user),
      site: normalizeRelation(exception.site),
      supplier: normalizeRelation(exception.supplier),
    })),
    count,
    options.listState,
  );
}

export async function fetchOpsDeliveryExceptionStats(): Promise<OpsDeliveryExceptionStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsDeliveryExceptions(profile.role)) {
    return {
      closed: 0,
      criticalOpen: 0,
      investigating: 0,
      open: 0,
      resolved: 0,
      total: 0,
    };
  }

  const [open, investigating, resolved, closed, criticalOpen, total] = await Promise.all([
    countByQuery((supabase) =>
      supabase.from("delivery_exceptions").select("id", { count: "exact", head: true }).eq("status", "open"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("delivery_exceptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "investigating"),
    ),
    countByQuery((supabase) =>
      supabase.from("delivery_exceptions").select("id", { count: "exact", head: true }).eq("status", "resolved"),
    ),
    countByQuery((supabase) =>
      supabase.from("delivery_exceptions").select("id", { count: "exact", head: true }).eq("status", "closed"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("delivery_exceptions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "investigating"])
        .in("severity", ["high", "critical"]),
    ),
    countByQuery((supabase) =>
      supabase.from("delivery_exceptions").select("id", { count: "exact", head: true }),
    ),
  ]);

  return {
    closed,
    criticalOpen,
    investigating,
    open,
    resolved,
    total,
  };
}

export async function fetchOpsDeliveryExceptionFollowUpDashboard(): Promise<OpsDeliveryExceptionFollowUpDashboard> {
  const asOfDate = getOpsDeliveryExceptionTodayIso();
  const buckets = createOpsDeliveryExceptionAgeingBucketSummaries();
  const { profile } = await requireOpsUser();

  const emptyDashboard = {
    ageingAlerts: [],
    asOfDate,
    buckets,
    highRiskActionable: 0,
    overdueActionable: 0,
    staleNoDueActionable: 0,
    supplierFollowUps: [],
    totalActionable: 0,
  };

  if (!canViewOpsDeliveryExceptions(profile.role)) {
    return emptyDashboard;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("delivery_exceptions")
    .select(
      [
        "id",
        "exception_number",
        "status",
        "severity",
        "title",
        "reported_at",
        "due_at",
        "supplier:suppliers!delivery_exceptions_supplier_id_fkey(id, supplier_code, legal_name)",
        "site:sites!delivery_exceptions_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .in("status", ["open", "investigating"])
    .order("reported_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  const bucketByKey = new Map(buckets.map((bucket) => [bucket.bucket, bucket]));
  const supplierFollowUpById = new Map<string, OpsDeliveryExceptionSupplierFollowUp>();
  const alerts = ((data ?? []) as unknown as RawDeliveryExceptionReportRow[]).map((row) => {
    const bucket = getOpsDeliveryExceptionAgeingBucket({
      dueAt: row.due_at,
      reportedAt: row.reported_at,
      todayDate: asOfDate,
    });
    const ageDays = getOpsDeliveryExceptionAgeDays(row.reported_at, asOfDate);
    const alert = {
      age_days: ageDays,
      bucket,
      days_until_due: getOpsDeliveryExceptionCalendarDayDelta(row.due_at, asOfDate),
      due_at: row.due_at,
      exception_number: row.exception_number,
      id: row.id,
      reported_at: row.reported_at,
      severity: row.severity,
      site: normalizeRelation(row.site),
      status: row.status,
      supplier: normalizeRelation(row.supplier),
      title: row.title,
    } satisfies OpsDeliveryExceptionAgeingAlert;
    const bucketSummary = bucketByKey.get(bucket);

    if (bucketSummary) {
      bucketSummary.count += 1;
    }

    if (alert.supplier) {
      const existing = supplierFollowUpById.get(alert.supplier.id);

      if (existing) {
        existing.total_actionable += 1;
        existing.open_count += alert.status === "open" ? 1 : 0;
        existing.investigating_count += alert.status === "investigating" ? 1 : 0;
        existing.high_risk_count += isHighRiskSeverity(alert.severity) ? 1 : 0;
        existing.overdue_count += alert.bucket === "overdue" ? 1 : 0;
        existing.due_soon_count +=
          alert.bucket === "due_today" || alert.bucket === "due_soon" ? 1 : 0;
        existing.stale_no_due_count += alert.bucket === "stale_no_due" ? 1 : 0;
        existing.oldest_age_days = Math.max(existing.oldest_age_days, alert.age_days);
      } else {
        supplierFollowUpById.set(alert.supplier.id, {
          due_soon_count:
            alert.bucket === "due_today" || alert.bucket === "due_soon" ? 1 : 0,
          high_risk_count: isHighRiskSeverity(alert.severity) ? 1 : 0,
          investigating_count: alert.status === "investigating" ? 1 : 0,
          latest_exception: {
            due_at: alert.due_at,
            exception_number: alert.exception_number,
            id: alert.id,
            severity: alert.severity,
            status: alert.status,
            title: alert.title,
          },
          oldest_age_days: alert.age_days,
          open_count: alert.status === "open" ? 1 : 0,
          overdue_count: alert.bucket === "overdue" ? 1 : 0,
          stale_no_due_count: alert.bucket === "stale_no_due" ? 1 : 0,
          supplier: alert.supplier,
          total_actionable: 1,
        });
      }
    }

    return alert;
  });

  const alertItems = alerts
    .filter((alert) => alert.bucket !== "on_track" || isHighRiskSeverity(alert.severity))
    .sort((first, second) => deliveryExceptionAlertSortScore(second) - deliveryExceptionAlertSortScore(first))
    .slice(0, 8);
  const supplierFollowUps = Array.from(supplierFollowUpById.values())
    .sort((first, second) => supplierFollowUpScore(second) - supplierFollowUpScore(first))
    .slice(0, 6);

  return {
    ageingAlerts: alertItems,
    asOfDate,
    buckets,
    highRiskActionable: alerts.filter((alert) => isHighRiskSeverity(alert.severity)).length,
    overdueActionable: alerts.filter((alert) => alert.bucket === "overdue").length,
    staleNoDueActionable: alerts.filter((alert) => alert.bucket === "stale_no_due").length,
    supplierFollowUps,
    totalActionable: alerts.length,
  };
}
