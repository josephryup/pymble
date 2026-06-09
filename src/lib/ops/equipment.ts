import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewOpsEquipment } from "@/lib/ops/equipment-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsEquipmentAllocationStatus,
  OpsEquipmentOwnership,
  OpsEquipmentRequestStatus,
  OpsEquipmentStatus,
  OpsFuelLogStatus,
  OpsMaintenanceJobStatus,
  OpsMaintenanceJobType,
  OpsPriority,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsEquipmentSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsEquipmentCategorySummary = {
  category_code: string;
  default_daily_rate: number;
  description: string;
  id: string;
  is_active: boolean;
  name: string;
};

export type OpsEquipmentSummary = {
  base_location: string;
  category: Pick<OpsEquipmentCategorySummary, "category_code" | "id" | "name"> | null;
  category_id: string;
  current_site: OpsEquipmentSiteSummary | null;
  current_site_id: string | null;
  daily_rate: number;
  equipment_code: string;
  fuel_tracking_enabled: boolean;
  id: string;
  name: string;
  notes: string;
  ownership: OpsEquipmentOwnership;
  registration_number: string;
  serial_number: string;
  status: OpsEquipmentStatus;
};

export type OpsEquipmentAllocationSummary = {
  actual_daily_rate: number;
  allocated_from: string;
  allocated_until: string | null;
  allocation_number: string;
  cost_entry_id: string | null;
  equipment: Pick<OpsEquipmentSummary, "equipment_code" | "id" | "name"> | null;
  equipment_id: string;
  id: string;
  notes: string;
  planned_daily_rate: number;
  request_id: string | null;
  site: OpsEquipmentSiteSummary | null;
  site_id: string;
  status: OpsEquipmentAllocationStatus;
};

export type OpsFuelLogSummary = {
  allocation_id: string | null;
  created_at: string;
  equipment: Pick<OpsEquipmentSummary, "equipment_code" | "id" | "name"> | null;
  equipment_id: string;
  fuel_date: string;
  fuel_log_number: string;
  fuel_type: string;
  id: string;
  notes: string;
  odometer_hours: number;
  quantity_litres: number;
  site: OpsEquipmentSiteSummary | null;
  site_id: string | null;
  status: OpsFuelLogStatus;
  total_amount: number;
  unit_cost: number;
};

export type OpsMaintenanceJobItemSummary = {
  description: string;
  id: string;
  line_number: number;
  line_total: number;
  notes: string;
  quantity: number;
  unit_cost: number;
};

export type OpsMaintenanceJobSummary = {
  actual_cost: number;
  completed_at: string | null;
  cost_entry_id: string | null;
  created_at: string;
  description: string;
  downtime_hours: number;
  equipment: Pick<OpsEquipmentSummary, "equipment_code" | "id" | "name"> | null;
  equipment_id: string;
  estimated_cost: number;
  id: string;
  items: OpsMaintenanceJobItemSummary[];
  job_number: string;
  job_type: OpsMaintenanceJobType;
  next_service_due: string | null;
  notes: string;
  priority: OpsPriority;
  reported_at: string;
  scheduled_for: string | null;
  service_provider: string;
  site: OpsEquipmentSiteSummary | null;
  site_id: string | null;
  started_at: string | null;
  status: OpsMaintenanceJobStatus;
  title: string;
};

export type OpsEquipmentRequestSummary = {
  allocations: OpsEquipmentAllocationSummary[];
  created_at: string;
  description: string;
  equipment_category: Pick<OpsEquipmentCategorySummary, "category_code" | "id" | "name"> | null;
  equipment_category_id: string | null;
  id: string;
  needed_from: string;
  needed_until: string | null;
  preferred_equipment: Pick<OpsEquipmentSummary, "equipment_code" | "id" | "name"> | null;
  preferred_equipment_id: string | null;
  priority: OpsPriority;
  quantity: number;
  request_number: string;
  requested_by: string | null;
  requested_by_user: {
    full_name: string;
    id: string;
    role: OpsUserRole;
  } | null;
  site: OpsEquipmentSiteSummary | null;
  site_id: string;
  status: OpsEquipmentRequestStatus;
  title: string;
};

export type OpsEquipmentStats = {
  activeAllocations: number;
  availableEquipment: number;
  equipmentCount: number;
  fuelLogs: number;
  openMaintenanceJobs: number;
  openRequests: number;
};

export type OpsEquipmentUtilizationAllocationRow = {
  allocated_from: string;
  allocated_until: string | null;
  allocation_number: string;
  daily_rate: number;
  equipment_code: string;
  equipment_id: string;
  equipment_name: string;
  site_code: string;
  site_name: string;
  status: OpsEquipmentAllocationStatus;
};

export type OpsEquipmentMaintenancePressureRow = {
  downtime_hours: number;
  equipment_code: string;
  equipment_name: string;
  estimated_cost: number;
  job_number: string;
  priority: OpsPriority;
  scheduled_for: string | null;
  site_code: string;
  site_name: string;
  status: OpsMaintenanceJobStatus;
  title: string;
};

export type OpsEquipmentUtilizationDashboard = {
  activeEquipmentCount: number;
  allocationRows: OpsEquipmentUtilizationAllocationRow[];
  availabilityPercent: number;
  equipmentCount: number;
  fuelCost30Days: number;
  fuelLitres30Days: number;
  maintenanceRows: OpsEquipmentMaintenancePressureRow[];
  openMaintenanceCost: number;
  openMaintenanceDowntimeHours: number;
  openMaintenanceJobs: number;
  utilizationPercent: number;
};

export type FetchPaginatedOpsEquipmentRequestsOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsEquipmentRequestStatus;
};

type RawRelation<T> = T | T[] | null;

type RawEquipmentCategory = Omit<OpsEquipmentCategorySummary, "default_daily_rate"> & {
  default_daily_rate: number | string;
};

type RawEquipment = Omit<OpsEquipmentSummary, "category" | "current_site" | "daily_rate"> & {
  category: RawRelation<OpsEquipmentSummary["category"]>;
  current_site: RawRelation<OpsEquipmentSiteSummary>;
  daily_rate: number | string;
};

type RawEquipmentAllocation = Omit<
  OpsEquipmentAllocationSummary,
  "actual_daily_rate" | "equipment" | "planned_daily_rate" | "site"
> & {
  actual_daily_rate: number | string;
  equipment: RawRelation<OpsEquipmentAllocationSummary["equipment"]>;
  planned_daily_rate: number | string;
  site: RawRelation<OpsEquipmentSiteSummary>;
};

type RawFuelLog = Omit<
  OpsFuelLogSummary,
  "equipment" | "odometer_hours" | "quantity_litres" | "site" | "total_amount" | "unit_cost"
> & {
  equipment: RawRelation<OpsFuelLogSummary["equipment"]>;
  odometer_hours: number | string;
  quantity_litres: number | string;
  site: RawRelation<OpsEquipmentSiteSummary>;
  total_amount: number | string;
  unit_cost: number | string;
};

type RawMaintenanceJobItem = Omit<
  OpsMaintenanceJobItemSummary,
  "line_total" | "quantity" | "unit_cost"
> & {
  job_id: string;
  line_total: number | string;
  quantity: number | string;
  unit_cost: number | string;
};

type RawMaintenanceJob = Omit<
  OpsMaintenanceJobSummary,
  "actual_cost" | "downtime_hours" | "equipment" | "estimated_cost" | "items" | "site"
> & {
  actual_cost: number | string;
  downtime_hours: number | string;
  equipment: RawRelation<OpsMaintenanceJobSummary["equipment"]>;
  estimated_cost: number | string;
  site: RawRelation<OpsEquipmentSiteSummary>;
};

type RawEquipmentRequest = Omit<
  OpsEquipmentRequestSummary,
  | "allocations"
  | "equipment_category"
  | "preferred_equipment"
  | "quantity"
  | "requested_by_user"
  | "site"
> & {
  equipment_category: RawRelation<OpsEquipmentRequestSummary["equipment_category"]>;
  preferred_equipment: RawRelation<OpsEquipmentRequestSummary["preferred_equipment"]>;
  quantity: number | string;
  requested_by_user: RawRelation<OpsEquipmentRequestSummary["requested_by_user"]>;
  site: RawRelation<OpsEquipmentSiteSummary>;
};

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeLimit(limit: number, max = 250) {
  return Math.min(Math.max(limit, 1), max);
}

export function calculateOpsEquipmentPercent(numerator: number, denominator: number) {
  if (denominator <= 0 || numerator <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((numerator / denominator) * 100));
}

function getDateDaysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(0, days));

  return date.toISOString().slice(0, 10);
}

function isSchemaCacheMiss(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("schema cache")) ||
    Boolean(/equipment_allocations|fuel_logs|maintenance_jobs/i.test(error?.message ?? ""))
  );
}

async function countEquipment(table: string, filter?: { column: string; value: string | boolean }) {
  const supabase = getOpsSupabaseServiceClient();
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return 0;
    }

    throw error;
  }

  return count ?? 0;
}

async function fetchAllocationsForRequests(requestIds: string[]) {
  if (requestIds.length === 0) {
    return new Map<string, OpsEquipmentAllocationSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_allocations")
    .select(
      [
        "id",
        "allocation_number",
        "request_id",
        "equipment_id",
        "site_id",
        "allocated_from",
        "allocated_until",
        "status",
        "planned_daily_rate",
        "actual_daily_rate",
        "cost_entry_id",
        "notes",
        "equipment:equipment!equipment_allocations_equipment_id_fkey(id, equipment_code, name)",
        "site:sites!equipment_allocations_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .in("request_id", requestIds)
    .order("allocated_from", { ascending: false });

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return new Map<string, OpsEquipmentAllocationSummary[]>();
    }

    throw error;
  }

  const grouped = new Map<string, OpsEquipmentAllocationSummary[]>();

  ((data ?? []) as unknown as RawEquipmentAllocation[]).forEach((allocation) => {
    const requestId = allocation.request_id;

    if (!requestId) {
      return;
    }

    grouped.set(requestId, [
      ...(grouped.get(requestId) ?? []),
      {
        ...allocation,
        actual_daily_rate: normalizeNumber(allocation.actual_daily_rate),
        equipment: normalizeRelation(allocation.equipment),
        planned_daily_rate: normalizeNumber(allocation.planned_daily_rate),
        site: normalizeRelation(allocation.site),
      },
    ]);
  });

  return grouped;
}

async function fetchMaintenanceJobItems(jobIds: string[]) {
  if (jobIds.length === 0) {
    return new Map<string, OpsMaintenanceJobItemSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("maintenance_job_items")
    .select("id, job_id, line_number, description, quantity, unit_cost, line_total, notes")
    .in("job_id", jobIds)
    .order("line_number", { ascending: true });

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return new Map<string, OpsMaintenanceJobItemSummary[]>();
    }

    throw error;
  }

  const grouped = new Map<string, OpsMaintenanceJobItemSummary[]>();

  ((data ?? []) as unknown as RawMaintenanceJobItem[]).forEach((item) => {
    grouped.set(item.job_id, [
      ...(grouped.get(item.job_id) ?? []),
      {
        ...item,
        line_total: normalizeNumber(item.line_total),
        quantity: normalizeNumber(item.quantity),
        unit_cost: normalizeNumber(item.unit_cost),
      },
    ]);
  });

  return grouped;
}

export async function fetchEquipmentCategoryOptions(limit = 150) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEquipment(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .select("id, category_code, name, description, default_daily_rate, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(normalizeLimit(limit));

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return [];
    }

    throw error;
  }

  return ((data ?? []) as unknown as RawEquipmentCategory[]).map((category) => ({
    ...category,
    default_daily_rate: normalizeNumber(category.default_daily_rate),
  }));
}

export async function fetchEquipmentOptions(limit = 200, status?: OpsEquipmentStatus) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEquipment(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("equipment")
    .select(
      [
        "id",
        "equipment_code",
        "category_id",
        "name",
        "registration_number",
        "serial_number",
        "ownership",
        "status",
        "base_location",
        "current_site_id",
        "daily_rate",
        "fuel_tracking_enabled",
        "notes",
        "category:equipment_categories!equipment_category_id_fkey(id, category_code, name)",
        "current_site:sites!equipment_current_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .order("name", { ascending: true })
    .limit(normalizeLimit(limit, 500));

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return [];
    }

    throw error;
  }

  return ((data ?? []) as unknown as RawEquipment[]).map((equipment) => ({
    ...equipment,
    category: normalizeRelation(equipment.category),
    current_site: normalizeRelation(equipment.current_site),
    daily_rate: normalizeNumber(equipment.daily_rate),
  }));
}

export async function fetchPaginatedOpsEquipmentRequests(
  options: FetchPaginatedOpsEquipmentRequestsOptions,
): Promise<OpsPaginatedResult<OpsEquipmentRequestSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEquipment(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("equipment_requests")
    .select(
      [
        "id",
        "request_number",
        "site_id",
        "equipment_category_id",
        "preferred_equipment_id",
        "title",
        "description",
        "quantity",
        "needed_from",
        "needed_until",
        "priority",
        "status",
        "requested_by",
        "created_at",
        "site:sites!equipment_requests_site_id_fkey(id, code, name)",
        "equipment_category:equipment_categories!equipment_requests_equipment_category_id_fkey(id, category_code, name)",
        "preferred_equipment:equipment!equipment_requests_preferred_equipment_id_fkey(id, equipment_code, name)",
        "requested_by_user:users!equipment_requests_requested_by_fkey(id, full_name, role)",
      ].join(", "),
      { count: "exact" },
    )
    .order("needed_from", { ascending: true })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["request_number", "title", "description"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return toOpsPaginatedResult([], 0, options.listState);
    }

    throw error;
  }

  const requests = (data ?? []) as unknown as RawEquipmentRequest[];
  const allocationsByRequestId = await fetchAllocationsForRequests(
    requests.map((request) => request.id),
  );

  return toOpsPaginatedResult(
    requests.map((request) => ({
      ...request,
      allocations: allocationsByRequestId.get(request.id) ?? [],
      equipment_category: normalizeRelation(request.equipment_category),
      preferred_equipment: normalizeRelation(request.preferred_equipment),
      quantity: normalizeNumber(request.quantity),
      requested_by_user: normalizeRelation(request.requested_by_user),
      site: normalizeRelation(request.site),
    })),
    count,
    options.listState,
  );
}

export async function fetchRecentEquipmentAllocations(limit = 30) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEquipment(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_allocations")
    .select(
      [
        "id",
        "allocation_number",
        "request_id",
        "equipment_id",
        "site_id",
        "allocated_from",
        "allocated_until",
        "status",
        "planned_daily_rate",
        "actual_daily_rate",
        "cost_entry_id",
        "notes",
        "equipment:equipment!equipment_allocations_equipment_id_fkey(id, equipment_code, name)",
        "site:sites!equipment_allocations_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .order("allocated_from", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return [];
    }

    throw error;
  }

  return ((data ?? []) as unknown as RawEquipmentAllocation[]).map((allocation) => ({
    ...allocation,
    actual_daily_rate: normalizeNumber(allocation.actual_daily_rate),
    equipment: normalizeRelation(allocation.equipment),
    planned_daily_rate: normalizeNumber(allocation.planned_daily_rate),
    site: normalizeRelation(allocation.site),
  }));
}

export async function fetchRecentFuelLogs(limit = 30) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEquipment(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("fuel_logs")
    .select(
      [
        "id",
        "fuel_log_number",
        "equipment_id",
        "allocation_id",
        "site_id",
        "fuel_date",
        "fuel_type",
        "quantity_litres",
        "unit_cost",
        "total_amount",
        "odometer_hours",
        "status",
        "notes",
        "created_at",
        "equipment:equipment!fuel_logs_equipment_id_fkey(id, equipment_code, name)",
        "site:sites!fuel_logs_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .order("fuel_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return [];
    }

    throw error;
  }

  return ((data ?? []) as unknown as RawFuelLog[]).map((log) => ({
    ...log,
    equipment: normalizeRelation(log.equipment),
    odometer_hours: normalizeNumber(log.odometer_hours),
    quantity_litres: normalizeNumber(log.quantity_litres),
    site: normalizeRelation(log.site),
    total_amount: normalizeNumber(log.total_amount),
    unit_cost: normalizeNumber(log.unit_cost),
  }));
}

export async function fetchRecentMaintenanceJobs(limit = 30) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEquipment(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("maintenance_jobs")
    .select(
      [
        "id",
        "job_number",
        "equipment_id",
        "site_id",
        "job_type",
        "status",
        "priority",
        "title",
        "description",
        "reported_at",
        "scheduled_for",
        "started_at",
        "completed_at",
        "estimated_cost",
        "actual_cost",
        "downtime_hours",
        "service_provider",
        "next_service_due",
        "cost_entry_id",
        "notes",
        "created_at",
        "equipment:equipment!maintenance_jobs_equipment_id_fkey(id, equipment_code, name)",
        "site:sites!maintenance_jobs_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return [];
    }

    throw error;
  }

  const jobs = (data ?? []) as unknown as RawMaintenanceJob[];
  const itemsByJobId = await fetchMaintenanceJobItems(jobs.map((job) => job.id));

  return jobs.map((job) => ({
    ...job,
    actual_cost: normalizeNumber(job.actual_cost),
    downtime_hours: normalizeNumber(job.downtime_hours),
    equipment: normalizeRelation(job.equipment),
    estimated_cost: normalizeNumber(job.estimated_cost),
    items: itemsByJobId.get(job.id) ?? [],
    site: normalizeRelation(job.site),
  }));
}

export async function fetchOpsEquipmentStats(): Promise<OpsEquipmentStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEquipment(profile.role)) {
    return {
      activeAllocations: 0,
      availableEquipment: 0,
      equipmentCount: 0,
      fuelLogs: 0,
      openMaintenanceJobs: 0,
      openRequests: 0,
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    equipmentCount,
    availableEquipment,
    { count: openRequests, error: requestError },
    { count: activeAllocations, error: allocationError },
    { count: openMaintenanceJobs, error: maintenanceError },
    { count: fuelLogs, error: fuelError },
  ] = await Promise.all([
    countEquipment("equipment"),
    countEquipment("equipment", { column: "status", value: "available" }),
    supabase
      .from("equipment_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["submitted", "approved", "allocated"]),
    supabase
      .from("equipment_allocations")
      .select("id", { count: "exact", head: true })
      .in("status", ["scheduled", "active"]),
    supabase
      .from("maintenance_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["scheduled", "in_progress"]),
    supabase.from("fuel_logs").select("id", { count: "exact", head: true }).eq("status", "posted"),
  ]);

  const blockingError =
    requestError ??
    allocationError ??
    (isSchemaCacheMiss(maintenanceError) ? null : maintenanceError) ??
    (isSchemaCacheMiss(fuelError) ? null : fuelError);

  if (blockingError) {
    throw blockingError;
  }

  return {
    activeAllocations: activeAllocations ?? 0,
    availableEquipment,
    equipmentCount,
    fuelLogs: isSchemaCacheMiss(fuelError) ? 0 : (fuelLogs ?? 0),
    openMaintenanceJobs: isSchemaCacheMiss(maintenanceError) ? 0 : (openMaintenanceJobs ?? 0),
    openRequests: openRequests ?? 0,
  };
}

export async function fetchOpsEquipmentUtilizationDashboard(): Promise<OpsEquipmentUtilizationDashboard> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEquipment(profile.role)) {
    return {
      activeEquipmentCount: 0,
      allocationRows: [],
      availabilityPercent: 0,
      equipmentCount: 0,
      fuelCost30Days: 0,
      fuelLitres30Days: 0,
      maintenanceRows: [],
      openMaintenanceCost: 0,
      openMaintenanceDowntimeHours: 0,
      openMaintenanceJobs: 0,
      utilizationPercent: 0,
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    equipmentCount,
    availableEquipment,
    { data: allocationData, error: allocationError },
    { data: maintenanceData, error: maintenanceError },
    { data: fuelData, error: fuelError },
  ] = await Promise.all([
    countEquipment("equipment"),
    countEquipment("equipment", { column: "status", value: "available" }),
    supabase
      .from("equipment_allocations")
      .select(
        [
          "id",
          "allocation_number",
          "request_id",
          "equipment_id",
          "site_id",
          "allocated_from",
          "allocated_until",
          "status",
          "planned_daily_rate",
          "actual_daily_rate",
          "cost_entry_id",
          "notes",
          "equipment:equipment!equipment_allocations_equipment_id_fkey(id, equipment_code, name)",
          "site:sites!equipment_allocations_site_id_fkey(id, code, name)",
        ].join(", "),
      )
      .in("status", ["scheduled", "active"])
      .order("allocated_from", { ascending: true })
      .limit(500),
    supabase
      .from("maintenance_jobs")
      .select(
        [
          "id",
          "job_number",
          "equipment_id",
          "site_id",
          "job_type",
          "status",
          "priority",
          "title",
          "description",
          "reported_at",
          "scheduled_for",
          "started_at",
          "completed_at",
          "estimated_cost",
          "actual_cost",
          "downtime_hours",
          "service_provider",
          "next_service_due",
          "cost_entry_id",
          "notes",
          "created_at",
          "equipment:equipment!maintenance_jobs_equipment_id_fkey(id, equipment_code, name)",
          "site:sites!maintenance_jobs_site_id_fkey(id, code, name)",
        ].join(", "),
      )
      .in("status", ["scheduled", "in_progress"])
      .order("scheduled_for", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("fuel_logs")
      .select("quantity_litres, total_amount")
      .eq("status", "posted")
      .gte("fuel_date", getDateDaysAgoIso(30))
      .limit(500),
  ]);

  const blockingError = [allocationError, maintenanceError, fuelError].find(
    (error) => error && !isSchemaCacheMiss(error),
  );

  if (blockingError) {
    throw blockingError;
  }

  const allocations = allocationError
    ? []
    : ((allocationData ?? []) as unknown as RawEquipmentAllocation[]).map((allocation) => ({
        ...allocation,
        actual_daily_rate: normalizeNumber(allocation.actual_daily_rate),
        equipment: normalizeRelation(allocation.equipment),
        planned_daily_rate: normalizeNumber(allocation.planned_daily_rate),
        site: normalizeRelation(allocation.site),
      }));
  const maintenanceJobs = maintenanceError
    ? []
    : ((maintenanceData ?? []) as unknown as RawMaintenanceJob[]).map((job) => ({
        ...job,
        actual_cost: normalizeNumber(job.actual_cost),
        downtime_hours: normalizeNumber(job.downtime_hours),
        equipment: normalizeRelation(job.equipment),
        estimated_cost: normalizeNumber(job.estimated_cost),
        items: [],
        site: normalizeRelation(job.site),
      }));
  const fuelRows = fuelError
    ? []
    : ((fuelData ?? []) as Array<{ quantity_litres: number | string; total_amount: number | string }>);
  const activeEquipmentCount = new Set(allocations.map((allocation) => allocation.equipment_id)).size;
  const priorityWeight: Record<OpsPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  };

  return {
    activeEquipmentCount,
    allocationRows: allocations
      .sort((a, b) => {
        const statusSort = a.status === b.status ? 0 : a.status === "active" ? -1 : 1;

        if (statusSort !== 0) {
          return statusSort;
        }

        return a.allocated_from.localeCompare(b.allocated_from);
      })
      .slice(0, 8)
      .map((allocation) => ({
        allocated_from: allocation.allocated_from,
        allocated_until: allocation.allocated_until,
        allocation_number: allocation.allocation_number,
        daily_rate: allocation.actual_daily_rate || allocation.planned_daily_rate,
        equipment_code: allocation.equipment?.equipment_code ?? "Equipment",
        equipment_id: allocation.equipment_id,
        equipment_name: allocation.equipment?.name ?? "Unlinked equipment",
        site_code: allocation.site?.code ?? "Site",
        site_name: allocation.site?.name ?? "Unlinked site",
        status: allocation.status,
      })),
    availabilityPercent: calculateOpsEquipmentPercent(availableEquipment, equipmentCount),
    equipmentCount,
    fuelCost30Days: fuelRows.reduce(
      (sum, row) => sum + normalizeNumber(row.total_amount),
      0,
    ),
    fuelLitres30Days: fuelRows.reduce(
      (sum, row) => sum + normalizeNumber(row.quantity_litres),
      0,
    ),
    maintenanceRows: maintenanceJobs
      .sort((a, b) => {
        const prioritySort = priorityWeight[a.priority] - priorityWeight[b.priority];

        if (prioritySort !== 0) {
          return prioritySort;
        }

        return (a.scheduled_for ?? "9999-12-31").localeCompare(b.scheduled_for ?? "9999-12-31");
      })
      .slice(0, 6)
      .map((job) => ({
        downtime_hours: job.downtime_hours,
        equipment_code: job.equipment?.equipment_code ?? "Equipment",
        equipment_name: job.equipment?.name ?? "Unlinked equipment",
        estimated_cost: job.estimated_cost,
        job_number: job.job_number,
        priority: job.priority,
        scheduled_for: job.scheduled_for,
        site_code: job.site?.code ?? "No site",
        site_name: job.site?.name ?? "No site",
        status: job.status,
        title: job.title,
      })),
    openMaintenanceCost: maintenanceJobs.reduce(
      (sum, job) => sum + normalizeNumber(job.estimated_cost),
      0,
    ),
    openMaintenanceDowntimeHours: maintenanceJobs.reduce(
      (sum, job) => sum + normalizeNumber(job.downtime_hours),
      0,
    ),
    openMaintenanceJobs: maintenanceJobs.length,
    utilizationPercent: calculateOpsEquipmentPercent(activeEquipmentCount, equipmentCount),
  };
}
