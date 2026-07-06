import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsFleetLogistics } from "@/lib/ops/fleet-logistics-permissions";
import {
  buildOpsFleetDispatchReport,
  buildOpsFleetOperatorComplianceReport,
  buildOpsFleetProfitabilityReport,
  type OpsFleetDispatchReport,
  type OpsFleetDispatchTransportSource,
  type OpsFleetOperatorComplianceReport,
  type OpsFleetOperatorDocumentSource,
  type OpsFleetProfitabilityReport,
  type OpsFleetProfitabilitySource,
} from "@/lib/ops/fleet-logistics-reporting";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsAccommodationBookingStatus,
  OpsEmployeeStatus,
  OpsFleetOperatorDocumentStatus,
  OpsLabourAllocationStatus,
  OpsPriority,
  OpsTransportRequestStatus,
  OpsTransportRequestType,
  OpsUserRole,
  OpsWorkerType,
} from "@/lib/ops/types";

export type OpsFleetSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsFleetUserSummary = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsFleetEmployeeOption = {
  employee_number: string;
  full_name: string;
  id: string;
  job_title: string;
  status: OpsEmployeeStatus;
};

export type OpsFleetWorkerOption = {
  daily_rate: number;
  full_name: string;
  id: string;
  trade: string;
  worker_code: string;
  worker_type: OpsWorkerType;
};

export type OpsFleetEquipmentOption = {
  equipment_code: string;
  id: string;
  name: string;
  registration_number: string;
  status: string;
};

export type OpsFleetOperatorDocumentType =
  | "driver_license"
  | "operator_permit"
  | "defensive_driving"
  | "medical_certificate"
  | "equipment_authorization"
  | "other";

export type OpsFleetOperatorDocumentSummary = {
  created_at: string;
  document_type: OpsFleetOperatorDocumentType;
  employee: Pick<OpsFleetEmployeeOption, "employee_number" | "full_name" | "id" | "job_title"> | null;
  employee_id: string | null;
  expires_at: string | null;
  id: string;
  issued_at: string | null;
  notes: string;
  reference_number: string;
  reminder_days: number;
  status: OpsFleetOperatorDocumentStatus;
  title: string;
  worker: Pick<OpsFleetWorkerOption, "full_name" | "id" | "trade" | "worker_code"> | null;
  worker_id: string | null;
};

export type OpsTransportRequestSummary = {
  actual_cost: number;
  assigned_equipment: OpsFleetEquipmentOption | null;
  assigned_equipment_id: string | null;
  assigned_operator_employee: Pick<OpsFleetEmployeeOption, "employee_number" | "full_name" | "id" | "job_title"> | null;
  assigned_operator_employee_id: string | null;
  assigned_operator_worker: Pick<OpsFleetWorkerOption, "full_name" | "id" | "trade" | "worker_code"> | null;
  assigned_operator_worker_id: string | null;
  completed_at: string | null;
  cost_entry_id: string | null;
  created_at: string;
  description: string;
  destination: string;
  dispatch_notes: string;
  dispatch_reference: string;
  estimated_cost: number;
  id: string;
  material_description: string;
  notes: string;
  origin: string;
  passenger_count: number;
  priority: OpsPriority;
  rejection_reason: string;
  request_number: string;
  request_type: OpsTransportRequestType;
  requested_by: string | null;
  requested_by_user: OpsFleetUserSummary | null;
  requested_for: string;
  scheduled_at: string | null;
  site: OpsFleetSiteSummary | null;
  site_id: string;
  status: OpsTransportRequestStatus;
  title: string;
  vehicle_requirement: string;
};

export type OpsAccommodationBookingSummary = {
  actual_cost: number;
  booking_number: string;
  check_in_date: string;
  check_out_date: string;
  completed_at: string | null;
  cost_entry_id: string | null;
  created_at: string;
  employee: Pick<OpsFleetEmployeeOption, "employee_number" | "full_name" | "id" | "job_title"> | null;
  employee_id: string | null;
  estimated_cost: number;
  id: string;
  location_name: string;
  notes: string;
  occupant_count: number;
  provider_name: string;
  requested_by: string | null;
  site: OpsFleetSiteSummary | null;
  site_id: string;
  status: OpsAccommodationBookingStatus;
  worker: Pick<OpsFleetWorkerOption, "full_name" | "id" | "trade" | "worker_code"> | null;
  worker_id: string | null;
};

export type OpsLabourAllocationSummary = {
  actual_cost: number;
  actual_days: number;
  allocation_number: string;
  completed_at: string | null;
  cost_entry_id: string | null;
  created_at: string;
  daily_rate: number;
  employee: Pick<OpsFleetEmployeeOption, "employee_number" | "full_name" | "id" | "job_title"> | null;
  employee_id: string | null;
  end_date: string | null;
  estimated_cost: number;
  id: string;
  notes: string;
  planned_days: number;
  requested_by: string | null;
  role_title: string;
  site: OpsFleetSiteSummary | null;
  site_id: string;
  start_date: string;
  status: OpsLabourAllocationStatus;
  trade: string;
  worker: Pick<OpsFleetWorkerOption, "full_name" | "id" | "trade" | "worker_code"> | null;
  worker_id: string | null;
};

export type OpsFleetLogisticsStats = {
  accommodationActive: number;
  completedTransports: number;
  labourActive: number;
  openTransports: number;
  totalEstimatedCost: number;
};

export type OpsFleetPlanningBucket =
  | "overdue"
  | "due_today"
  | "next_7_days"
  | "scheduled"
  | "upcoming";

export type OpsFleetTripPlanningRow = {
  assigned_equipment_code: string;
  assigned_operator_name: string;
  bucket: OpsFleetPlanningBucket;
  destination: string;
  estimated_cost: number;
  origin: string;
  passenger_count: number;
  priority: OpsPriority;
  request_number: string;
  request_type: OpsTransportRequestType;
  requested_for: string;
  scheduled_at: string | null;
  site_code: string;
  site_name: string;
  status: OpsTransportRequestStatus;
  title: string;
};

export type OpsFleetMobilizationSiteRow = {
  active_labour: number;
  active_stays: number;
  estimated_cost: number;
  labour_days: number;
  next_mobilization_date: string | null;
  occupants: number;
  open_transports: number;
  passengers: number;
  scheduled_transports: number;
  site_code: string;
  site_id: string;
  site_name: string;
};

export type OpsFleetMobilizationDashboard = {
  activeLabour: number;
  activeStays: number;
  dueThisWeekTrips: number;
  mobilizationRows: OpsFleetMobilizationSiteRow[];
  overdueTrips: number;
  scheduledTrips: number;
  tripRows: OpsFleetTripPlanningRow[];
};

export type FetchPaginatedOpsTransportRequestsOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsTransportRequestStatus;
};

type RawRelation<T> = T | T[] | null;

type RawTransportRequest = Omit<
  OpsTransportRequestSummary,
  | "actual_cost"
  | "assigned_equipment"
  | "assigned_operator_employee"
  | "assigned_operator_worker"
  | "estimated_cost"
  | "passenger_count"
  | "requested_by_user"
  | "site"
> & {
  actual_cost: number | string;
  assigned_equipment: RawRelation<OpsTransportRequestSummary["assigned_equipment"]>;
  assigned_operator_employee: RawRelation<OpsTransportRequestSummary["assigned_operator_employee"]>;
  assigned_operator_worker: RawRelation<OpsTransportRequestSummary["assigned_operator_worker"]>;
  estimated_cost: number | string;
  passenger_count: number | string;
  requested_by_user: RawRelation<OpsFleetUserSummary>;
  site: RawRelation<OpsFleetSiteSummary>;
};

type RawAccommodationBooking = Omit<
  OpsAccommodationBookingSummary,
  "actual_cost" | "employee" | "estimated_cost" | "occupant_count" | "site" | "worker"
> & {
  actual_cost: number | string;
  employee: RawRelation<OpsAccommodationBookingSummary["employee"]>;
  estimated_cost: number | string;
  occupant_count: number | string;
  site: RawRelation<OpsFleetSiteSummary>;
  worker: RawRelation<OpsAccommodationBookingSummary["worker"]>;
};

type RawLabourAllocation = Omit<
  OpsLabourAllocationSummary,
  | "actual_cost"
  | "actual_days"
  | "daily_rate"
  | "employee"
  | "estimated_cost"
  | "planned_days"
  | "site"
  | "worker"
> & {
  actual_cost: number | string;
  actual_days: number | string;
  daily_rate: number | string;
  employee: RawRelation<OpsLabourAllocationSummary["employee"]>;
  estimated_cost: number | string;
  planned_days: number | string;
  site: RawRelation<OpsFleetSiteSummary>;
  worker: RawRelation<OpsLabourAllocationSummary["worker"]>;
};

type RawFleetOperatorDocument = Omit<
  OpsFleetOperatorDocumentSummary,
  "employee" | "reminder_days" | "worker"
> & {
  employee: RawRelation<OpsFleetOperatorDocumentSummary["employee"]>;
  reminder_days: number | string;
  worker: RawRelation<OpsFleetOperatorDocumentSummary["worker"]>;
};

type OpsFleetProfitabilityEquipmentSummary = Pick<OpsFleetEquipmentOption, "equipment_code" | "id" | "name">;

type RawFleetProfitabilityTransport = {
  actual_cost: number | string;
  assigned_equipment: RawRelation<OpsFleetProfitabilityEquipmentSummary>;
  assigned_equipment_id: string | null;
  completed_at: string | null;
  estimated_cost: number | string;
  requested_for: string;
  site: RawRelation<OpsFleetSiteSummary>;
  site_id: string;
};

type RawFleetProfitabilityEquipmentAllocation = {
  actual_daily_rate: number | string;
  allocated_from: string;
  allocated_until: string | null;
  completed_at: string | null;
  equipment: RawRelation<OpsFleetProfitabilityEquipmentSummary>;
  equipment_id: string;
  planned_daily_rate: number | string;
  site: RawRelation<OpsFleetSiteSummary>;
  site_id: string;
};

type RawFleetProfitabilityFuelLog = {
  equipment: RawRelation<OpsFleetProfitabilityEquipmentSummary>;
  equipment_id: string;
  fuel_date: string;
  site: RawRelation<OpsFleetSiteSummary>;
  site_id: string | null;
  total_amount: number | string;
};

type RawFleetProfitabilityMaintenanceJob = {
  actual_cost: number | string;
  completed_at: string | null;
  equipment: RawRelation<OpsFleetProfitabilityEquipmentSummary>;
  equipment_id: string;
  estimated_cost: number | string;
  reported_at: string;
  site: RawRelation<OpsFleetSiteSummary>;
  site_id: string | null;
};

type RawWorkerOption = Omit<OpsFleetWorkerOption, "daily_rate"> & {
  daily_rate: number | string;
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

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function addDaysIso(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  return new Date(utc).toISOString().slice(0, 10);
}

function getDateDaysAgoIso(days: number, todayDate = todayInLusaka()) {
  return addDaysIso(todayDate, -Math.max(0, days));
}

function getInclusiveDaySpan(startDate: string, endDate: string | null | undefined) {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate) ?? start;

  if (!start || !end) {
    return 1;
  }

  return Math.max(1, getOpsFleetCalendarDayDelta(end, start) + 1);
}

export function getOpsFleetCalendarDayDelta(targetDate: string, todayDate: string) {
  const targetParts = dateOnly(targetDate)?.split("-").map(Number) ?? [];
  const todayParts = dateOnly(todayDate)?.split("-").map(Number) ?? [];

  if (targetParts.length !== 3 || todayParts.length !== 3) {
    return 0;
  }

  const targetUtc = Date.UTC(targetParts[0], targetParts[1] - 1, targetParts[2]);
  const todayUtc = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);

  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

export function getOpsFleetPlanningBucket({
  requestedFor,
  scheduledAt,
  status,
  todayDate = todayInLusaka(),
}: {
  requestedFor: string;
  scheduledAt: string | null;
  status: OpsTransportRequestStatus;
  todayDate?: string;
}): OpsFleetPlanningBucket {
  const targetDate = dateOnly(scheduledAt) ?? dateOnly(requestedFor) ?? todayDate;
  const dayDelta = getOpsFleetCalendarDayDelta(targetDate, todayDate);

  if (dayDelta < 0) {
    return "overdue";
  }

  if (dayDelta === 0) {
    return "due_today";
  }

  if (dayDelta <= 7) {
    return "next_7_days";
  }

  if (status === "scheduled") {
    return "scheduled";
  }

  return "upcoming";
}

function isSchemaCacheMiss(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("schema cache")) ||
    Boolean(
      /transport_requests|accommodation_bookings|labour_allocations|fleet_operator_documents|equipment_allocations|fuel_logs|maintenance_jobs|assigned_equipment_id|assigned_operator_employee_id|assigned_operator_worker_id|dispatch_reference|dispatch_notes/i.test(
        error?.message ?? "",
      ),
    )
  );
}

async function countFleetTable(
  table: "transport_requests" | "accommodation_bookings" | "labour_allocations",
  statuses?: string[],
) {
  const supabase = getOpsSupabaseServiceClient();
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { count, error } = await query;

  if (isSchemaCacheMiss(error)) {
    return 0;
  }

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchFleetLogisticsEmployeeOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, full_name, job_title, status")
    .in("status", ["active", "probation", "on_leave"])
    .order("full_name", { ascending: true })
    .limit(normalizeLimit(limit, 300));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsFleetEmployeeOption[];
}

export async function fetchFleetLogisticsWorkerOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("workers")
    .select("id, worker_code, full_name, trade, daily_rate, worker_type")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(normalizeLimit(limit, 300));

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawWorkerOption[]).map((worker) => ({
    ...worker,
    daily_rate: normalizeNumber(worker.daily_rate),
  }));
}

export async function fetchFleetDispatchEquipmentOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id, equipment_code, name, registration_number, status")
    .neq("status", "inactive")
    .order("equipment_code", { ascending: true })
    .limit(normalizeLimit(limit, 300));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsFleetEquipmentOption[];
}

export async function fetchPaginatedOpsTransportRequests(
  options: FetchPaginatedOpsTransportRequestsOptions,
): Promise<OpsPaginatedResult<OpsTransportRequestSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("transport_requests")
    .select(
      [
        "id",
        "request_number",
        "site_id",
        "request_type",
        "status",
        "priority",
        "title",
        "description",
        "origin",
        "destination",
        "requested_for",
        "passenger_count",
        "material_description",
        "vehicle_requirement",
        "assigned_equipment_id",
        "assigned_operator_employee_id",
        "assigned_operator_worker_id",
        "dispatch_reference",
        "dispatch_notes",
        "estimated_cost",
        "actual_cost",
        "cost_entry_id",
        "requested_by",
        "scheduled_at",
        "completed_at",
        "rejection_reason",
        "notes",
        "created_at",
        "site:sites!transport_requests_site_id_fkey(id, code, name)",
        "assigned_equipment:equipment!transport_requests_assigned_equipment_id_fkey(id, equipment_code, name, registration_number, status)",
        "assigned_operator_employee:employees!transport_requests_assigned_operator_employee_id_fkey(id, employee_number, full_name, job_title)",
        "assigned_operator_worker:workers!transport_requests_assigned_operator_worker_id_fkey(id, worker_code, full_name, trade)",
        "requested_by_user:users!transport_requests_requested_by_fkey(id, full_name, role)",
      ].join(", "),
      { count: "exact" },
    )
    .order("requested_for", { ascending: true })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    [
      "request_number",
      "title",
      "description",
      "origin",
      "destination",
      "material_description",
      "vehicle_requirement",
    ],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (isSchemaCacheMiss(error)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult(
    ((data ?? []) as unknown as RawTransportRequest[]).map((request) => ({
      ...request,
      actual_cost: normalizeNumber(request.actual_cost),
      assigned_equipment: normalizeRelation(request.assigned_equipment),
      assigned_operator_employee: normalizeRelation(request.assigned_operator_employee),
      assigned_operator_worker: normalizeRelation(request.assigned_operator_worker),
      estimated_cost: normalizeNumber(request.estimated_cost),
      passenger_count: normalizeNumber(request.passenger_count),
      requested_by_user: normalizeRelation(request.requested_by_user),
      site: normalizeRelation(request.site),
    })),
    count,
    options.listState,
  );
}

export async function fetchRecentAccommodationBookings(limit = 30) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("accommodation_bookings")
    .select(
      [
        "id",
        "booking_number",
        "site_id",
        "employee_id",
        "worker_id",
        "status",
        "location_name",
        "provider_name",
        "check_in_date",
        "check_out_date",
        "occupant_count",
        "estimated_cost",
        "actual_cost",
        "cost_entry_id",
        "requested_by",
        "completed_at",
        "notes",
        "created_at",
        "site:sites!accommodation_bookings_site_id_fkey(id, code, name)",
        "employee:employees!accommodation_bookings_employee_id_fkey(id, employee_number, full_name, job_title)",
        "worker:workers!accommodation_bookings_worker_id_fkey(id, worker_code, full_name, trade)",
      ].join(", "),
    )
    .order("check_in_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawAccommodationBooking[]).map((booking) => ({
    ...booking,
    actual_cost: normalizeNumber(booking.actual_cost),
    employee: normalizeRelation(booking.employee),
    estimated_cost: normalizeNumber(booking.estimated_cost),
    occupant_count: normalizeNumber(booking.occupant_count),
    site: normalizeRelation(booking.site),
    worker: normalizeRelation(booking.worker),
  }));
}

export async function fetchRecentLabourAllocations(limit = 30) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("labour_allocations")
    .select(
      [
        "id",
        "allocation_number",
        "site_id",
        "employee_id",
        "worker_id",
        "status",
        "role_title",
        "trade",
        "start_date",
        "end_date",
        "planned_days",
        "actual_days",
        "daily_rate",
        "estimated_cost",
        "actual_cost",
        "cost_entry_id",
        "requested_by",
        "completed_at",
        "notes",
        "created_at",
        "site:sites!labour_allocations_site_id_fkey(id, code, name)",
        "employee:employees!labour_allocations_employee_id_fkey(id, employee_number, full_name, job_title)",
        "worker:workers!labour_allocations_worker_id_fkey(id, worker_code, full_name, trade)",
      ].join(", "),
    )
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawLabourAllocation[]).map((allocation) => ({
    ...allocation,
    actual_cost: normalizeNumber(allocation.actual_cost),
    actual_days: normalizeNumber(allocation.actual_days),
    daily_rate: normalizeNumber(allocation.daily_rate),
    employee: normalizeRelation(allocation.employee),
    estimated_cost: normalizeNumber(allocation.estimated_cost),
    planned_days: normalizeNumber(allocation.planned_days),
    site: normalizeRelation(allocation.site),
    worker: normalizeRelation(allocation.worker),
  }));
}

export async function fetchOpsFleetLogisticsStats(): Promise<OpsFleetLogisticsStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return {
      accommodationActive: 0,
      completedTransports: 0,
      labourActive: 0,
      openTransports: 0,
      totalEstimatedCost: 0,
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    openTransports,
    completedTransports,
    accommodationActive,
    labourActive,
    { data: transportCosts, error: transportCostError },
    { data: accommodationCosts, error: accommodationCostError },
    { data: labourCosts, error: labourCostError },
  ] = await Promise.all([
    countFleetTable("transport_requests", ["submitted", "approved", "scheduled"]),
    countFleetTable("transport_requests", ["completed"]),
    countFleetTable("accommodation_bookings", ["requested", "confirmed", "checked_in"]),
    countFleetTable("labour_allocations", ["planned", "active"]),
    supabase
      .from("transport_requests")
      .select("estimated_cost")
      .in("status", ["submitted", "approved", "scheduled"]),
    supabase
      .from("accommodation_bookings")
      .select("estimated_cost")
      .in("status", ["requested", "confirmed", "checked_in"]),
    supabase
      .from("labour_allocations")
      .select("estimated_cost")
      .in("status", ["planned", "active"]),
  ]);

  const costError = [transportCostError, accommodationCostError, labourCostError].find(
    (error) => error && !isSchemaCacheMiss(error),
  );

  if (costError) {
    throw costError;
  }

  const totalEstimatedCost = [
    ...(transportCostError ? [] : (transportCosts ?? [])),
    ...(accommodationCostError ? [] : (accommodationCosts ?? [])),
    ...(labourCostError ? [] : (labourCosts ?? [])),
  ].reduce((sum, row) => sum + normalizeNumber(row.estimated_cost as number | string), 0);

  return {
    accommodationActive,
    completedTransports,
    labourActive,
    openTransports,
    totalEstimatedCost,
  };
}

export async function fetchOpsFleetMobilizationDashboard(): Promise<OpsFleetMobilizationDashboard> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return {
      activeLabour: 0,
      activeStays: 0,
      dueThisWeekTrips: 0,
      mobilizationRows: [],
      overdueTrips: 0,
      scheduledTrips: 0,
      tripRows: [],
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    { data: transportData, error: transportError },
    { data: accommodationData, error: accommodationError },
    { data: labourData, error: labourError },
  ] = await Promise.all([
    supabase
      .from("transport_requests")
      .select(
        [
          "id",
          "request_number",
          "site_id",
          "request_type",
          "status",
          "priority",
          "title",
          "description",
          "origin",
          "destination",
          "requested_for",
          "passenger_count",
          "material_description",
          "vehicle_requirement",
          "assigned_equipment_id",
          "assigned_operator_employee_id",
          "assigned_operator_worker_id",
          "dispatch_reference",
          "dispatch_notes",
          "estimated_cost",
          "actual_cost",
          "cost_entry_id",
          "requested_by",
          "scheduled_at",
          "completed_at",
          "rejection_reason",
          "notes",
          "created_at",
          "site:sites!transport_requests_site_id_fkey(id, code, name)",
          "assigned_equipment:equipment!transport_requests_assigned_equipment_id_fkey(id, equipment_code, name, registration_number, status)",
          "assigned_operator_employee:employees!transport_requests_assigned_operator_employee_id_fkey(id, employee_number, full_name, job_title)",
          "assigned_operator_worker:workers!transport_requests_assigned_operator_worker_id_fkey(id, worker_code, full_name, trade)",
          "requested_by_user:users!transport_requests_requested_by_fkey(id, full_name, role)",
        ].join(", "),
      )
      .in("status", ["submitted", "approved", "scheduled"])
      .order("requested_for", { ascending: true })
      .limit(300),
    supabase
      .from("accommodation_bookings")
      .select(
        [
          "id",
          "booking_number",
          "site_id",
          "employee_id",
          "worker_id",
          "status",
          "location_name",
          "provider_name",
          "check_in_date",
          "check_out_date",
          "occupant_count",
          "estimated_cost",
          "actual_cost",
          "cost_entry_id",
          "requested_by",
          "completed_at",
          "notes",
          "created_at",
          "site:sites!accommodation_bookings_site_id_fkey(id, code, name)",
          "employee:employees!accommodation_bookings_employee_id_fkey(id, employee_number, full_name, job_title)",
          "worker:workers!accommodation_bookings_worker_id_fkey(id, worker_code, full_name, trade)",
        ].join(", "),
      )
      .in("status", ["requested", "confirmed", "checked_in"])
      .order("check_in_date", { ascending: true })
      .limit(300),
    supabase
      .from("labour_allocations")
      .select(
        [
          "id",
          "allocation_number",
          "site_id",
          "employee_id",
          "worker_id",
          "status",
          "role_title",
          "trade",
          "start_date",
          "end_date",
          "planned_days",
          "actual_days",
          "daily_rate",
          "estimated_cost",
          "actual_cost",
          "cost_entry_id",
          "requested_by",
          "completed_at",
          "notes",
          "created_at",
          "site:sites!labour_allocations_site_id_fkey(id, code, name)",
          "employee:employees!labour_allocations_employee_id_fkey(id, employee_number, full_name, job_title)",
          "worker:workers!labour_allocations_worker_id_fkey(id, worker_code, full_name, trade)",
        ].join(", "),
      )
      .in("status", ["planned", "active"])
      .order("start_date", { ascending: true })
      .limit(300),
  ]);

  const blockingError = [transportError, accommodationError, labourError].find(
    (error) => error && !isSchemaCacheMiss(error),
  );

  if (blockingError) {
    throw blockingError;
  }

  const transports = transportError
    ? []
    : ((transportData ?? []) as unknown as RawTransportRequest[]).map((request) => ({
        ...request,
        actual_cost: normalizeNumber(request.actual_cost),
        assigned_equipment: normalizeRelation(request.assigned_equipment),
        assigned_operator_employee: normalizeRelation(request.assigned_operator_employee),
        assigned_operator_worker: normalizeRelation(request.assigned_operator_worker),
        estimated_cost: normalizeNumber(request.estimated_cost),
        passenger_count: normalizeNumber(request.passenger_count),
        requested_by_user: normalizeRelation(request.requested_by_user),
        site: normalizeRelation(request.site),
      }));
  const accommodations = accommodationError
    ? []
    : ((accommodationData ?? []) as unknown as RawAccommodationBooking[]).map((booking) => ({
        ...booking,
        actual_cost: normalizeNumber(booking.actual_cost),
        employee: normalizeRelation(booking.employee),
        estimated_cost: normalizeNumber(booking.estimated_cost),
        occupant_count: normalizeNumber(booking.occupant_count),
        site: normalizeRelation(booking.site),
        worker: normalizeRelation(booking.worker),
      }));
  const labourAllocations = labourError
    ? []
    : ((labourData ?? []) as unknown as RawLabourAllocation[]).map((allocation) => ({
        ...allocation,
        actual_cost: normalizeNumber(allocation.actual_cost),
        actual_days: normalizeNumber(allocation.actual_days),
        daily_rate: normalizeNumber(allocation.daily_rate),
        employee: normalizeRelation(allocation.employee),
        estimated_cost: normalizeNumber(allocation.estimated_cost),
        planned_days: normalizeNumber(allocation.planned_days),
        site: normalizeRelation(allocation.site),
        worker: normalizeRelation(allocation.worker),
      }));
  const todayDate = todayInLusaka();
  const bucketWeight: Record<OpsFleetPlanningBucket, number> = {
    overdue: 0,
    due_today: 1,
    next_7_days: 2,
    scheduled: 3,
    upcoming: 4,
  };
  const tripRows = transports
    .map((request) => ({
      bucket: getOpsFleetPlanningBucket({
        requestedFor: request.requested_for,
        scheduledAt: request.scheduled_at,
        status: request.status,
        todayDate,
      }),
      assigned_equipment_code: request.assigned_equipment?.equipment_code ?? "Unassigned",
      assigned_operator_name:
        request.assigned_operator_employee?.full_name ??
        request.assigned_operator_worker?.full_name ??
        "No operator",
      destination: request.destination,
      estimated_cost: request.estimated_cost,
      origin: request.origin,
      passenger_count: request.passenger_count,
      priority: request.priority,
      request_number: request.request_number,
      request_type: request.request_type,
      requested_for: request.requested_for,
      scheduled_at: request.scheduled_at,
      site_code: request.site?.code ?? "Site",
      site_name: request.site?.name ?? "Unlinked site",
      status: request.status,
      title: request.title,
    }))
    .sort((a, b) => {
      const bucketSort = bucketWeight[a.bucket] - bucketWeight[b.bucket];

      if (bucketSort !== 0) {
        return bucketSort;
      }

      return (dateOnly(a.scheduled_at) ?? a.requested_for).localeCompare(
        dateOnly(b.scheduled_at) ?? b.requested_for,
      );
    });
  const siteRows = new Map<string, OpsFleetMobilizationSiteRow>();

  const ensureSiteRow = (site: OpsFleetSiteSummary | null, siteId: string) => {
    const key = site?.id ?? siteId;
    const existing = siteRows.get(key);

    if (existing) {
      return existing;
    }

    const row: OpsFleetMobilizationSiteRow = {
      active_labour: 0,
      active_stays: 0,
      estimated_cost: 0,
      labour_days: 0,
      next_mobilization_date: null,
      occupants: 0,
      open_transports: 0,
      passengers: 0,
      scheduled_transports: 0,
      site_code: site?.code ?? "Site",
      site_id: key,
      site_name: site?.name ?? "Unlinked site",
    };

    siteRows.set(key, row);

    return row;
  };
  const applyNextDate = (row: OpsFleetMobilizationSiteRow, value: string | null | undefined) => {
    const nextDate = dateOnly(value);

    if (!nextDate) {
      return;
    }

    if (!row.next_mobilization_date || nextDate < row.next_mobilization_date) {
      row.next_mobilization_date = nextDate;
    }
  };

  transports.forEach((request) => {
    const row = ensureSiteRow(request.site, request.site_id);
    row.open_transports += 1;
    row.passengers += request.passenger_count;
    row.estimated_cost += request.estimated_cost;

    if (request.status === "scheduled" || request.scheduled_at) {
      row.scheduled_transports += 1;
    }

    applyNextDate(row, dateOnly(request.scheduled_at) ?? request.requested_for);
  });

  accommodations.forEach((booking) => {
    const row = ensureSiteRow(booking.site, booking.site_id);
    row.active_stays += 1;
    row.occupants += booking.occupant_count;
    row.estimated_cost += booking.estimated_cost;
    applyNextDate(row, booking.check_in_date);
  });

  labourAllocations.forEach((allocation) => {
    const row = ensureSiteRow(allocation.site, allocation.site_id);
    row.active_labour += 1;
    row.labour_days += allocation.planned_days;
    row.estimated_cost += allocation.estimated_cost;
    applyNextDate(row, allocation.start_date);
  });

  return {
    activeLabour: labourAllocations.length,
    activeStays: accommodations.length,
    dueThisWeekTrips: tripRows.filter(
      (row) => row.bucket === "due_today" || row.bucket === "next_7_days",
    ).length,
    mobilizationRows: Array.from(siteRows.values())
      .sort((a, b) => {
        const dateSort = (a.next_mobilization_date ?? "9999-12-31").localeCompare(
          b.next_mobilization_date ?? "9999-12-31",
        );

        if (dateSort !== 0) {
          return dateSort;
        }

        return b.estimated_cost - a.estimated_cost;
      })
      .slice(0, 6),
    overdueTrips: tripRows.filter((row) => row.bucket === "overdue").length,
    scheduledTrips: tripRows.filter((row) => row.status === "scheduled").length,
    tripRows: tripRows.slice(0, 8),
  };
}

export async function fetchOpsFleetOperatorComplianceReport(): Promise<OpsFleetOperatorComplianceReport> {
  const emptyReport = buildOpsFleetOperatorComplianceReport({
    documents: [],
    todayDate: todayInLusaka(),
  });
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return emptyReport;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("fleet_operator_documents")
    .select(
      [
        "id",
        "employee_id",
        "worker_id",
        "document_type",
        "title",
        "reference_number",
        "status",
        "issued_at",
        "expires_at",
        "reminder_days",
        "notes",
        "created_at",
        "employee:employees!fleet_operator_documents_employee_id_fkey(id, employee_number, full_name, job_title)",
        "worker:workers!fleet_operator_documents_worker_id_fkey(id, worker_code, full_name, trade)",
      ].join(", "),
    )
    .order("expires_at", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(250);

  if (isSchemaCacheMiss(error)) {
    return emptyReport;
  }

  if (error) {
    throw error;
  }

  const documents = ((data ?? []) as unknown as RawFleetOperatorDocument[]).map((document) => {
    const employee = normalizeRelation(document.employee);
    const worker = normalizeRelation(document.worker);
    const operatorReference =
      employee?.employee_number ?? worker?.worker_code ?? (document.employee_id ?? document.worker_id ?? "");
    const operatorName = employee?.full_name ?? worker?.full_name ?? "Unlinked operator";

    return {
      document_type: document.document_type,
      expires_at: document.expires_at,
      id: document.id,
      issued_at: document.issued_at,
      operator_id: document.employee_id ?? document.worker_id ?? document.id,
      operator_name: operatorName,
      operator_reference: operatorReference || "Operator",
      operator_type: document.employee_id ? "employee" : "worker",
      reference_number: document.reference_number,
      reminder_days: normalizeNumber(document.reminder_days),
      status: document.status,
      title: document.title,
    } satisfies OpsFleetOperatorDocumentSource;
  });

  return buildOpsFleetOperatorComplianceReport({
    documents,
    todayDate: todayInLusaka(),
  });
}

export async function fetchOpsFleetProfitabilityReport(): Promise<OpsFleetProfitabilityReport> {
  const todayDate = todayInLusaka();
  const emptyReport = buildOpsFleetProfitabilityReport({
    sources: [],
    todayDate,
  });
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return emptyReport;
  }

  const supabase = getOpsSupabaseServiceClient();
  const fromDate = getDateDaysAgoIso(90, todayDate);
  const [
    { data: transportData, error: transportError },
    { data: allocationData, error: allocationError },
    { data: fuelData, error: fuelError },
    { data: maintenanceData, error: maintenanceError },
  ] = await Promise.all([
    supabase
      .from("transport_requests")
      .select(
        [
          "site_id",
          "requested_for",
          "completed_at",
          "estimated_cost",
          "actual_cost",
          "assigned_equipment_id",
          "site:sites!transport_requests_site_id_fkey(id, code, name)",
          "assigned_equipment:equipment!transport_requests_assigned_equipment_id_fkey(id, equipment_code, name)",
        ].join(", "),
      )
      .eq("status", "completed")
      .gte("requested_for", fromDate)
      .order("requested_for", { ascending: false })
      .limit(500),
    supabase
      .from("equipment_allocations")
      .select(
        [
          "equipment_id",
          "site_id",
          "allocated_from",
          "allocated_until",
          "completed_at",
          "planned_daily_rate",
          "actual_daily_rate",
          "equipment:equipment!equipment_allocations_equipment_id_fkey(id, equipment_code, name)",
          "site:sites!equipment_allocations_site_id_fkey(id, code, name)",
        ].join(", "),
      )
      .eq("status", "completed")
      .gte("allocated_from", fromDate)
      .order("allocated_from", { ascending: false })
      .limit(500),
    supabase
      .from("fuel_logs")
      .select(
        [
          "equipment_id",
          "site_id",
          "fuel_date",
          "total_amount",
          "equipment:equipment!fuel_logs_equipment_id_fkey(id, equipment_code, name)",
          "site:sites!fuel_logs_site_id_fkey(id, code, name)",
        ].join(", "),
      )
      .eq("status", "posted")
      .gte("fuel_date", fromDate)
      .order("fuel_date", { ascending: false })
      .limit(500),
    supabase
      .from("maintenance_jobs")
      .select(
        [
          "equipment_id",
          "site_id",
          "reported_at",
          "completed_at",
          "estimated_cost",
          "actual_cost",
          "equipment:equipment!maintenance_jobs_equipment_id_fkey(id, equipment_code, name)",
          "site:sites!maintenance_jobs_site_id_fkey(id, code, name)",
        ].join(", "),
      )
      .eq("status", "completed")
      .gte("reported_at", fromDate)
      .order("reported_at", { ascending: false })
      .limit(500),
  ]);

  const blockingError = [transportError, allocationError, fuelError, maintenanceError].find(
    (error) => error && !isSchemaCacheMiss(error),
  );

  if (blockingError) {
    throw blockingError;
  }

  const sources: OpsFleetProfitabilitySource[] = [];

  if (!transportError) {
    for (const row of (transportData ?? []) as unknown as RawFleetProfitabilityTransport[]) {
      const site = normalizeRelation(row.site);
      const equipment = normalizeRelation(row.assigned_equipment);
      sources.push({
        amount: normalizeNumber(row.actual_cost) || normalizeNumber(row.estimated_cost),
        equipment_code: equipment?.equipment_code ?? null,
        equipment_id: row.assigned_equipment_id,
        equipment_name: equipment?.name ?? null,
        occurred_on: dateOnly(row.completed_at) ?? row.requested_for,
        site_code: site?.code ?? null,
        site_id: row.site_id,
        site_name: site?.name ?? null,
        source_type: "transport_recovery",
      });
    }
  }

  if (!allocationError) {
    for (const row of (allocationData ?? []) as unknown as RawFleetProfitabilityEquipmentAllocation[]) {
      const site = normalizeRelation(row.site);
      const equipment = normalizeRelation(row.equipment);
      const rate = normalizeNumber(row.actual_daily_rate) || normalizeNumber(row.planned_daily_rate);
      const completedDate = dateOnly(row.completed_at);
      const endDate = row.allocated_until ?? completedDate ?? row.allocated_from;
      sources.push({
        amount: rate * getInclusiveDaySpan(row.allocated_from, endDate),
        equipment_code: equipment?.equipment_code ?? null,
        equipment_id: row.equipment_id,
        equipment_name: equipment?.name ?? null,
        occurred_on: completedDate ?? row.allocated_until ?? row.allocated_from,
        site_code: site?.code ?? null,
        site_id: row.site_id,
        site_name: site?.name ?? null,
        source_type: "equipment_recovery",
      });
    }
  }

  if (!fuelError) {
    for (const row of (fuelData ?? []) as unknown as RawFleetProfitabilityFuelLog[]) {
      const site = normalizeRelation(row.site);
      const equipment = normalizeRelation(row.equipment);
      sources.push({
        amount: normalizeNumber(row.total_amount),
        equipment_code: equipment?.equipment_code ?? null,
        equipment_id: row.equipment_id,
        equipment_name: equipment?.name ?? null,
        occurred_on: row.fuel_date,
        site_code: site?.code ?? null,
        site_id: row.site_id,
        site_name: site?.name ?? null,
        source_type: "fuel_cost",
      });
    }
  }

  if (!maintenanceError) {
    for (const row of (maintenanceData ?? []) as unknown as RawFleetProfitabilityMaintenanceJob[]) {
      const site = normalizeRelation(row.site);
      const equipment = normalizeRelation(row.equipment);
      sources.push({
        amount: normalizeNumber(row.actual_cost) || normalizeNumber(row.estimated_cost),
        equipment_code: equipment?.equipment_code ?? null,
        equipment_id: row.equipment_id,
        equipment_name: equipment?.name ?? null,
        occurred_on: dateOnly(row.completed_at) ?? row.reported_at,
        site_code: site?.code ?? null,
        site_id: row.site_id,
        site_name: site?.name ?? null,
        source_type: "maintenance_cost",
      });
    }
  }

  return buildOpsFleetProfitabilityReport({
    sources,
    todayDate,
  });
}

export async function fetchOpsFleetDispatchReport(): Promise<OpsFleetDispatchReport> {
  const emptyReport = buildOpsFleetDispatchReport({
    todayDate: todayInLusaka(),
    transports: [],
  });
  const { profile } = await requireOpsUser();

  if (!canViewOpsFleetLogistics(profile.role)) {
    return emptyReport;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("transport_requests")
    .select(
      [
        "request_number",
        "request_type",
        "status",
        "priority",
        "title",
        "origin",
        "destination",
        "requested_for",
        "scheduled_at",
        "passenger_count",
        "estimated_cost",
        "actual_cost",
        "assigned_equipment_id",
        "assigned_operator_employee_id",
        "assigned_operator_worker_id",
      ].join(", "),
    )
    .in("status", ["approved", "scheduled", "completed"])
    .order("requested_for", { ascending: true })
    .limit(500);

  if (isSchemaCacheMiss(error)) {
    return emptyReport;
  }

  if (error) {
    throw error;
  }

  return buildOpsFleetDispatchReport({
    todayDate: todayInLusaka(),
    transports: (data ?? []) as unknown as OpsFleetDispatchTransportSource[],
  });
}

export type OpsFleetWeeklyActivityPoint = {
  /** Short chart label — start of week, e.g. "23 Jun". */
  label: string;
  raised: number;
  completed: number;
};

const FLEET_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const FLEET_WEEK_LABEL_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Lusaka",
});

/**
 * Weekly transport activity for the fleet dashboard trend chart: requests
 * raised (created_at) against trips completed (completed_at) per week.
 */
export async function fetchOpsFleetWeeklyActivity(
  weeks = 8,
): Promise<OpsFleetWeeklyActivityPoint[]> {
  const { profile } = await requireOpsUser();
  if (!canViewOpsFleetLogistics(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const windowStart = new Date(Date.now() - weeks * FLEET_WEEK_MS);

  const { data, error } = await supabase
    .from("transport_requests")
    .select("created_at, completed_at")
    .or(
      `created_at.gte.${windowStart.toISOString()},completed_at.gte.${windowStart.toISOString()}`,
    );

  if (error) {
    return [];
  }

  const points: OpsFleetWeeklyActivityPoint[] = Array.from({ length: weeks }, (_, index) => ({
    label: FLEET_WEEK_LABEL_FORMAT.format(new Date(windowStart.getTime() + index * FLEET_WEEK_MS)),
    raised: 0,
    completed: 0,
  }));

  const bucketFor = (iso: string | null) => {
    if (!iso) return -1;
    const elapsed = new Date(iso).getTime() - windowStart.getTime();
    if (elapsed < 0) return -1;
    return Math.min(Math.floor(elapsed / FLEET_WEEK_MS), weeks - 1);
  };

  const rows = (data ?? []) as Array<{ created_at: string; completed_at: string | null }>;
  for (const row of rows) {
    const raisedBucket = bucketFor(row.created_at);
    if (raisedBucket >= 0) points[raisedBucket].raised += 1;
    const completedBucket = bucketFor(row.completed_at);
    if (completedBucket >= 0) points[completedBucket].completed += 1;
  }

  return points;
}
