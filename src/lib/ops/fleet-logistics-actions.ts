"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { notifyOpsWorkflowEvent } from "@/lib/ops/workflow-notifications";
import {
  canApproveOpsTransportRequest,
  canCancelOpsAccommodationBooking,
  canCancelOpsLabourAllocation,
  canCancelOpsTransportRequest,
  canCheckInOpsAccommodationBooking,
  canCompleteOpsAccommodationBooking,
  canCompleteOpsLabourAllocation,
  canCompleteOpsTransportRequest,
  canConfirmOpsAccommodationBooking,
  canCreateOpsAccommodationBooking,
  canCreateOpsLabourAllocation,
  canCreateOpsTransportRequest,
  canManageOpsFleetOperatorDocuments,
  canRejectOpsTransportRequest,
  canScheduleOpsTransportRequest,
  canStartOpsLabourAllocation,
  canSubmitOpsTransportRequest,
} from "@/lib/ops/fleet-logistics-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsAccommodationBookingStatus,
  OpsLabourAllocationStatus,
  OpsPriority,
  OpsTransportRequestStatus,
  OpsTransportRequestType,
} from "@/lib/ops/types";

const FLEET_LOGISTICS_ROUTE = "/ops/fleet-logistics";

const priorities = ["low", "normal", "high", "urgent"] as const satisfies readonly OpsPriority[];
const transportTypes = [
  "staff_transport",
  "material_delivery",
  "equipment_move",
  "site_visit",
  "client_visit",
  "other",
] as const satisfies readonly OpsTransportRequestType[];
const operatorDocumentTypes = [
  "driver_license",
  "operator_permit",
  "defensive_driving",
  "medical_certificate",
  "equipment_authorization",
  "other",
] as const;

const transportRequestSchema = z.object({
  description: z.string().trim().max(1200).default(""),
  destination: z.string().trim().max(220).default(""),
  estimated_cost: z.coerce.number().min(0, "Estimated cost cannot be negative.").default(0),
  material_description: z.string().trim().max(900).default(""),
  notes: z.string().trim().max(900).default(""),
  origin: z.string().trim().max(220).default(""),
  passenger_count: z.coerce.number().int().min(0, "Passenger count cannot be negative.").default(0),
  priority: z.enum(priorities).default("normal"),
  request_type: z.enum(transportTypes).default("site_visit"),
  requested_for: z.string().trim().default(""),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Transport title is required.").max(180),
  vehicle_requirement: z.string().trim().max(220).default(""),
});

const transportIdSchema = z.object({
  request_id: z.string().uuid("Select a transport request."),
});

const scheduleTransportSchema = transportIdSchema.extend({
  assigned_equipment_id: z.string().trim().default(""),
  assigned_operator_employee_id: z.string().trim().default(""),
  assigned_operator_worker_id: z.string().trim().default(""),
  dispatch_notes: z.string().trim().max(900).default(""),
  dispatch_reference: z.string().trim().max(120).default(""),
  scheduled_at: z.string().trim().default(""),
});

const rejectTransportSchema = transportIdSchema.extend({
  rejection_reason: z.string().trim().min(2, "Rejection reason is required.").max(500),
});

const completeTransportSchema = transportIdSchema.extend({
  actual_cost: z.coerce.number().min(0, "Actual cost cannot be negative.").default(0),
  notes: z.string().trim().max(900).default(""),
});

const accommodationSchema = z.object({
  actual_cost: z.coerce.number().min(0, "Actual cost cannot be negative.").default(0),
  check_in_date: z.string().trim().default(""),
  check_out_date: z.string().trim().default(""),
  employee_id: z.string().trim().default(""),
  estimated_cost: z.coerce.number().min(0, "Estimated cost cannot be negative.").default(0),
  location_name: z.string().trim().min(2, "Accommodation location is required.").max(180),
  notes: z.string().trim().max(900).default(""),
  occupant_count: z.coerce.number().int().min(1, "Occupant count must be at least one.").max(100),
  provider_name: z.string().trim().max(180).default(""),
  site_id: z.string().uuid("Select a site."),
  worker_id: z.string().trim().default(""),
});

const bookingIdSchema = z.object({
  booking_id: z.string().uuid("Select an accommodation booking."),
});

const completeBookingSchema = bookingIdSchema.extend({
  actual_cost: z.coerce.number().min(0, "Actual cost cannot be negative.").default(0),
  notes: z.string().trim().max(900).default(""),
});

const labourAllocationSchema = z.object({
  daily_rate: z.coerce.number().min(0, "Daily rate cannot be negative.").default(0),
  employee_id: z.string().trim().default(""),
  end_date: z.string().trim().default(""),
  notes: z.string().trim().max(900).default(""),
  planned_days: z.coerce.number().min(0.25, "Planned days must be at least 0.25.").max(365),
  role_title: z.string().trim().min(2, "Role title is required.").max(160),
  site_id: z.string().uuid("Select a site."),
  start_date: z.string().trim().default(""),
  trade: z.string().trim().max(140).default(""),
  worker_id: z.string().trim().default(""),
});

const operatorDocumentSchema = z.object({
  document_type: z.enum(operatorDocumentTypes).default("driver_license"),
  employee_id: z.string().trim().default(""),
  expires_at: z.string().trim().default(""),
  issued_at: z.string().trim().default(""),
  notes: z.string().trim().max(900).default(""),
  reference_number: z.string().trim().max(160).default(""),
  reminder_days: z.coerce.number().int().min(0).max(365).default(30),
  title: z.string().trim().min(2, "Document title is required.").max(180),
  worker_id: z.string().trim().default(""),
});

const allocationIdSchema = z.object({
  allocation_id: z.string().uuid("Select a labour allocation."),
});

const completeLabourAllocationSchema = allocationIdSchema.extend({
  actual_days: z.coerce.number().min(0, "Actual days cannot be negative.").max(365).default(0),
  notes: z.string().trim().max(900).default(""),
});

type SiteForFleet = {
  id: string;
  is_active: boolean;
};

type EmployeeForFleet = {
  employee_number: string;
  full_name: string;
  id: string;
  job_title: string;
  status: string;
};

type WorkerForFleet = {
  daily_rate: number | string;
  full_name: string;
  id: string;
  is_active: boolean;
  trade: string;
  worker_code: string;
};

type TransportRequestForMutation = {
  actual_cost: number | string;
  assigned_equipment_id: string | null;
  assigned_operator_employee_id: string | null;
  assigned_operator_worker_id: string | null;
  cost_entry_id: string | null;
  dispatch_reference: string;
  estimated_cost: number | string;
  id: string;
  request_number: string;
  requested_by: string | null;
  requested_for: string;
  site_id: string;
  status: OpsTransportRequestStatus;
  title: string;
};

type EquipmentForDispatch = {
  equipment_code: string;
  id: string;
  name: string;
  status: string;
};

type AccommodationBookingForMutation = {
  actual_cost: number | string;
  booking_number: string;
  check_in_date: string;
  check_out_date: string;
  cost_entry_id: string | null;
  employee_id: string | null;
  estimated_cost: number | string;
  id: string;
  location_name: string;
  requested_by: string | null;
  site_id: string;
  status: OpsAccommodationBookingStatus;
  worker_id: string | null;
};

type LabourAllocationForMutation = {
  actual_cost: number | string;
  actual_days: number | string;
  allocation_number: string;
  cost_entry_id: string | null;
  daily_rate: number | string;
  employee_id: string | null;
  estimated_cost: number | string;
  id: string;
  planned_days: number | string;
  requested_by: string | null;
  role_title: string;
  site_id: string;
  start_date: string;
  status: OpsLabourAllocationStatus;
  worker_id: string | null;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function fleetLogisticsError(message: string): never {
  redirect(`${FLEET_LOGISTICS_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeDateInput(value: string, fallback?: true): string;
function normalizeDateInput(value: string, fallback: false): string | null;
function normalizeDateInput(value: string, fallback = true) {
  if (!value && fallback) {
    return new Date().toISOString().slice(0, 10);
  }

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fleetLogisticsError("Use a valid date.");
  }

  return value;
}

function normalizeDateTimeInput(value: string, fallbackDate: string) {
  if (!value) {
    return `${fallbackDate}T08:00:00+02:00`;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    fleetLogisticsError("Use a valid scheduled date and time.");
  }

  return `${value}:00+02:00`;
}

function isFleetOperatorDocumentSchemaMiss(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("schema cache")) ||
    Boolean(error?.message?.includes("fleet_operator_documents"))
  );
}

async function assertActiveSite(siteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, is_active")
    .eq("id", siteId)
    .maybeSingle<SiteForFleet>();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    fleetLogisticsError("Select an active site.");
  }

  return data;
}

async function fetchEmployeeForFleet(employeeId: string | null) {
  if (!employeeId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, full_name, job_title, status")
    .eq("id", employeeId)
    .maybeSingle<EmployeeForFleet>();

  if (error) {
    throw error;
  }

  if (!data || data.status === "exited" || data.status === "suspended") {
    fleetLogisticsError("Select an active employee.");
  }

  return data;
}

async function fetchWorkerForFleet(workerId: string | null) {
  if (!workerId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("workers")
    .select("id, worker_code, full_name, trade, daily_rate, is_active")
    .eq("id", workerId)
    .maybeSingle<WorkerForFleet>();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    fleetLogisticsError("Select an active worker.");
  }

  return data;
}

async function fetchTransportRequestForMutation(requestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("transport_requests")
    .select("id, request_number, site_id, status, title, requested_for, requested_by, estimated_cost, actual_cost, cost_entry_id, assigned_equipment_id, assigned_operator_employee_id, assigned_operator_worker_id, dispatch_reference")
    .eq("id", requestId)
    .maybeSingle<TransportRequestForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchEquipmentForDispatch(equipmentId: string | null) {
  if (!equipmentId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id, equipment_code, name, status")
    .eq("id", equipmentId)
    .maybeSingle<EquipmentForDispatch>();

  if (error) {
    throw error;
  }

  if (!data || data.status === "inactive") {
    fleetLogisticsError("Select active equipment for dispatch.");
  }

  return data;
}

async function fetchAccommodationBookingForMutation(bookingId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("accommodation_bookings")
    .select("id, booking_number, site_id, employee_id, worker_id, status, location_name, check_in_date, check_out_date, estimated_cost, actual_cost, cost_entry_id, requested_by")
    .eq("id", bookingId)
    .maybeSingle<AccommodationBookingForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchLabourAllocationForMutation(allocationId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("labour_allocations")
    .select("id, allocation_number, site_id, employee_id, worker_id, status, role_title, start_date, planned_days, actual_days, daily_rate, estimated_cost, actual_cost, cost_entry_id, requested_by")
    .eq("id", allocationId)
    .maybeSingle<LabourAllocationForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertFleetCostEntry(input: {
  actorUserId: string;
  amount: number;
  costDate: string;
  costEntryId: string | null;
  costType: "accommodation" | "labour" | "transport";
  description: string;
  siteId: string;
  sourceId: string;
  sourceTable: "accommodation_bookings" | "labour_allocations" | "transport_requests";
  status: "cancelled" | "committed" | "posted";
}) {
  const supabase = getOpsSupabaseServiceClient();
  const payload = {
    amount: input.amount,
    budget_id: null,
    budget_line_id: null,
    cost_date: input.costDate,
    cost_type: input.costType,
    currency_code: "ZMW",
    description: input.description,
    payment_request_id: null,
    purchase_order_id: null,
    site_id: input.siteId,
    source_id: input.sourceId,
    source_table: input.sourceTable,
    status: input.status,
    supplier_id: null,
  };

  if (input.costEntryId) {
    const { error } = await supabase
      .from("project_cost_entries")
      .update(payload)
      .eq("id", input.costEntryId);

    if (error) {
      throw error;
    }

    return input.costEntryId;
  }

  const { data, error } = await supabase
    .from("project_cost_entries")
    .insert({
      ...payload,
      created_by: input.actorUserId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw error ?? new Error("Could not create project cost entry.");
  }

  await supabase.from(input.sourceTable).update({ cost_entry_id: data.id }).eq("id", input.sourceId);

  return data.id;
}

export async function createFleetOperatorDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsFleetOperatorDocuments(profile.role)) {
    fleetLogisticsError("Your role cannot manage driver and operator documents.");
  }

  const parsed = operatorDocumentSchema.safeParse({
    document_type: field(formData, "document_type") || "driver_license",
    employee_id: field(formData, "employee_id"),
    expires_at: field(formData, "expires_at"),
    issued_at: field(formData, "issued_at"),
    notes: field(formData, "notes"),
    reference_number: field(formData, "reference_number"),
    reminder_days: field(formData, "reminder_days") || "30",
    title: field(formData, "title"),
    worker_id: field(formData, "worker_id"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Check the operator document.");
  }

  const employeeId = normalizeOptionalUuid(parsed.data.employee_id);
  const workerId = normalizeOptionalUuid(parsed.data.worker_id);

  if (!employeeId && !workerId) {
    fleetLogisticsError("Select an employee or worker for the document.");
  }

  if (employeeId && workerId) {
    fleetLogisticsError("Select either an employee or a worker, not both.");
  }

  await Promise.all([fetchEmployeeForFleet(employeeId), fetchWorkerForFleet(workerId)]);
  const issuedAt = normalizeDateInput(parsed.data.issued_at, false);
  const expiresAt = normalizeDateInput(parsed.data.expires_at, false);

  if (issuedAt && expiresAt && expiresAt < issuedAt) {
    fleetLogisticsError("Expiry date cannot be before issue date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("fleet_operator_documents")
    .insert({
      created_by: profile.id,
      document_type: parsed.data.document_type,
      employee_id: employeeId,
      expires_at: expiresAt,
      issued_at: issuedAt,
      notes: parsed.data.notes,
      reference_number: parsed.data.reference_number,
      reminder_days: parsed.data.reminder_days,
      title: parsed.data.title,
      worker_id: workerId,
    })
    .select("id, title")
    .single<{ id: string; title: string }>();

  if (error || !data) {
    if (isFleetOperatorDocumentSchemaMiss(error)) {
      fleetLogisticsError("Apply the fleet driver document migration before recording documents.");
    }

    fleetLogisticsError(error?.message ?? "Could not create driver or operator document.");
  }

  await recordOpsAuditEvent({
    action: "fleet_operator_document.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "fleet_operator_document",
    metadata: {
      document_type: parsed.data.document_type,
      employee_id: employeeId,
      expires_at: expiresAt,
      worker_id: workerId,
    },
    moduleKey: "fleet_logistics",
    sourceId: data.id,
    sourceTable: "fleet_operator_documents",
    summary: `Recorded operator document ${data.title}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  redirect(`${FLEET_LOGISTICS_ROUTE}?created=operator_document#operator-compliance-panel`);
}

export async function createTransportRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsTransportRequest(profile.role)) {
    fleetLogisticsError("Your role cannot create transport requests.");
  }

  const parsed = transportRequestSchema.safeParse({
    description: field(formData, "description"),
    destination: field(formData, "destination"),
    estimated_cost: field(formData, "estimated_cost") || "0",
    material_description: field(formData, "material_description"),
    notes: field(formData, "notes"),
    origin: field(formData, "origin"),
    passenger_count: field(formData, "passenger_count") || "0",
    priority: field(formData, "priority") || "normal",
    request_type: field(formData, "request_type") || "site_visit",
    requested_for: field(formData, "requested_for"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
    vehicle_requirement: field(formData, "vehicle_requirement"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Check the transport request.");
  }

  await assertActiveSite(parsed.data.site_id);
  const requestedFor = normalizeDateInput(parsed.data.requested_for);
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("transport_requests")
    .insert({
      created_by: profile.id,
      description: parsed.data.description,
      destination: parsed.data.destination,
      estimated_cost: parsed.data.estimated_cost,
      material_description: parsed.data.material_description,
      notes: parsed.data.notes,
      origin: parsed.data.origin,
      passenger_count: parsed.data.passenger_count,
      priority: parsed.data.priority,
      request_type: parsed.data.request_type,
      requested_by: profile.id,
      requested_for: requestedFor,
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
      vehicle_requirement: parsed.data.vehicle_requirement,
    })
    .select("id, request_number")
    .single<{ id: string; request_number: string }>();

  if (error || !data) {
    fleetLogisticsError(error?.message ?? "Could not create transport request.");
  }

  await recordOpsAuditEvent({
    action: "transport_request.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "transport_request",
    metadata: {
      priority: parsed.data.priority,
      request_type: parsed.data.request_type,
      requested_for: requestedFor,
      site_id: parsed.data.site_id,
    },
    moduleKey: "fleet_logistics",
    sourceId: data.id,
    sourceTable: "transport_requests",
    summary: `Created transport request ${data.request_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  redirect(`${FLEET_LOGISTICS_ROUTE}?created=transport_request`);
}

export async function submitTransportRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = transportIdSchema.safeParse({ request_id: field(formData, "request_id") });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select a transport request.");
  }

  const request = await fetchTransportRequestForMutation(parsed.data.request_id);

  if (!request) {
    fleetLogisticsError("Transport request was not found.");
  }

  if (!canSubmitOpsTransportRequest(profile.id, profile.role, request)) {
    fleetLogisticsError("Your role cannot submit this transport request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({ status: "submitted", submitted_at: now })
    .eq("id", request.id)
    .in("status", ["draft", "rejected"]);

  if (error) {
    fleetLogisticsError(error.message);
  }

  await recordOpsAuditEvent({
    action: "transport_request.submitted",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "transport_request",
    metadata: { submitted_at: now },
    moduleKey: "fleet_logistics",
    sourceId: request.id,
    sourceTable: "transport_requests",
    summary: `Submitted transport request ${request.request_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["operations_manager"],
    title: `Transport request: ${request.request_number}`,
    body: `${profile.full_name} submitted transport request ${request.request_number}. Approval needed.`,
    actionHref: FLEET_LOGISTICS_ROUTE,
    moduleKey: "fleet_logistics",
    sourceTable: "transport_requests",
    sourceId: request.id,
    eventKey: "submitted",
  });

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=transport_submitted`);
}

export async function approveTransportRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = transportIdSchema.safeParse({ request_id: field(formData, "request_id") });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select a transport request.");
  }

  const request = await fetchTransportRequestForMutation(parsed.data.request_id);

  if (!request) {
    fleetLogisticsError("Transport request was not found.");
  }

  if (!canApproveOpsTransportRequest(profile.role, request)) {
    fleetLogisticsError("Your role cannot approve this transport request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({ reviewed_at: now, reviewed_by: profile.id, status: "approved" })
    .eq("id", request.id)
    .eq("status", "submitted");

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (normalizeNumber(request.estimated_cost) > 0) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: normalizeNumber(request.estimated_cost),
      costDate: request.requested_for,
      costEntryId: request.cost_entry_id,
      costType: "transport",
      description: `${request.request_number} - ${request.title}`,
      siteId: request.site_id,
      sourceId: request.id,
      sourceTable: "transport_requests",
      status: "committed",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "transport_request.approved",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "transport_request",
    metadata: { approved_at: now },
    moduleKey: "fleet_logistics",
    sourceId: request.id,
    sourceTable: "transport_requests",
    summary: `Approved transport request ${request.request_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [request.requested_by],
    title: `Approved: ${request.request_number}`,
    body: `${profile.full_name} approved your transport request ${request.request_number}.`,
    actionHref: FLEET_LOGISTICS_ROUTE,
    moduleKey: "fleet_logistics",
    sourceTable: "transport_requests",
    sourceId: request.id,
    eventKey: "approved",
    category: "info",
  });

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=transport_approved`);
}

export async function rejectTransportRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rejectTransportSchema.safeParse({
    rejection_reason: field(formData, "rejection_reason"),
    request_id: field(formData, "request_id"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Check the rejection.");
  }

  const request = await fetchTransportRequestForMutation(parsed.data.request_id);

  if (!request) {
    fleetLogisticsError("Transport request was not found.");
  }

  if (!canRejectOpsTransportRequest(profile.role, request)) {
    fleetLogisticsError("Your role cannot reject this transport request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({
      rejected_at: now,
      rejected_by: profile.id,
      rejection_reason: parsed.data.rejection_reason,
      status: "rejected",
    })
    .eq("id", request.id)
    .eq("status", "submitted");

  if (error) {
    fleetLogisticsError(error.message);
  }

  await recordOpsAuditEvent({
    action: "transport_request.rejected",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "transport_request",
    metadata: { rejected_at: now, rejection_reason: parsed.data.rejection_reason },
    moduleKey: "fleet_logistics",
    sourceId: request.id,
    sourceTable: "transport_requests",
    summary: `Rejected transport request ${request.request_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [request.requested_by],
    title: `Rejected: ${request.request_number}`,
    body: `${profile.full_name} rejected your transport request ${request.request_number}.`,
    actionHref: FLEET_LOGISTICS_ROUTE,
    moduleKey: "fleet_logistics",
    sourceTable: "transport_requests",
    sourceId: request.id,
    eventKey: "rejected",
    category: "info",
  });

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=transport_rejected`);
}

export async function scheduleTransportRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = scheduleTransportSchema.safeParse({
    assigned_equipment_id: field(formData, "assigned_equipment_id"),
    assigned_operator_employee_id: field(formData, "assigned_operator_employee_id"),
    assigned_operator_worker_id: field(formData, "assigned_operator_worker_id"),
    dispatch_notes: field(formData, "dispatch_notes"),
    dispatch_reference: field(formData, "dispatch_reference"),
    request_id: field(formData, "request_id"),
    scheduled_at: field(formData, "scheduled_at"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select a transport request.");
  }

  const request = await fetchTransportRequestForMutation(parsed.data.request_id);

  if (!request) {
    fleetLogisticsError("Transport request was not found.");
  }

  if (!canScheduleOpsTransportRequest(profile.role, request)) {
    fleetLogisticsError("Your role cannot schedule this transport request.");
  }

  const assignedEquipmentId = normalizeOptionalUuid(parsed.data.assigned_equipment_id);
  const assignedOperatorEmployeeId = normalizeOptionalUuid(parsed.data.assigned_operator_employee_id);
  const assignedOperatorWorkerId = normalizeOptionalUuid(parsed.data.assigned_operator_worker_id);

  if (assignedOperatorEmployeeId && assignedOperatorWorkerId) {
    fleetLogisticsError("Select either an employee operator or a worker operator, not both.");
  }

  const [equipment, employee, worker] = await Promise.all([
    fetchEquipmentForDispatch(assignedEquipmentId),
    fetchEmployeeForFleet(assignedOperatorEmployeeId),
    fetchWorkerForFleet(assignedOperatorWorkerId),
  ]);
  const scheduledAt = normalizeDateTimeInput(parsed.data.scheduled_at, request.requested_for);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({
      assigned_equipment_id: equipment?.id ?? null,
      assigned_operator_employee_id: employee?.id ?? null,
      assigned_operator_worker_id: worker?.id ?? null,
      dispatch_notes: parsed.data.dispatch_notes,
      dispatch_reference: parsed.data.dispatch_reference,
      scheduled_at: scheduledAt,
      scheduled_by: profile.id,
      status: "scheduled",
    })
    .eq("id", request.id)
    .eq("status", "approved");

  if (error) {
    fleetLogisticsError(error.message);
  }

  await recordOpsAuditEvent({
    action: "transport_request.scheduled",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "transport_request",
    metadata: {
      assigned_equipment_id: equipment?.id ?? null,
      assigned_operator_employee_id: employee?.id ?? null,
      assigned_operator_worker_id: worker?.id ?? null,
      dispatch_reference: parsed.data.dispatch_reference,
      scheduled_at: scheduledAt,
    },
    moduleKey: "fleet_logistics",
    sourceId: request.id,
    sourceTable: "transport_requests",
    summary: `Scheduled transport request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=transport_scheduled`);
}

export async function completeTransportRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeTransportSchema.safeParse({
    actual_cost: field(formData, "actual_cost") || "0",
    notes: field(formData, "notes"),
    request_id: field(formData, "request_id"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Check transport completion.");
  }

  const request = await fetchTransportRequestForMutation(parsed.data.request_id);

  if (!request) {
    fleetLogisticsError("Transport request was not found.");
  }

  if (!canCompleteOpsTransportRequest(profile.role, request)) {
    fleetLogisticsError("Your role cannot complete this transport request.");
  }

  const now = new Date().toISOString();
  const completedDate = now.slice(0, 10);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({
      actual_cost: parsed.data.actual_cost,
      completed_at: now,
      completed_by: profile.id,
      notes: parsed.data.notes,
      status: "completed",
    })
    .eq("id", request.id)
    .eq("status", "scheduled");

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (parsed.data.actual_cost > 0 || normalizeNumber(request.estimated_cost) > 0) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: parsed.data.actual_cost || normalizeNumber(request.estimated_cost),
      costDate: completedDate,
      costEntryId: request.cost_entry_id,
      costType: "transport",
      description: `${request.request_number} - ${request.title}`,
      siteId: request.site_id,
      sourceId: request.id,
      sourceTable: "transport_requests",
      status: "posted",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "transport_request.completed",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "transport_request",
    metadata: { actual_cost: parsed.data.actual_cost, completed_at: now },
    moduleKey: "fleet_logistics",
    sourceId: request.id,
    sourceTable: "transport_requests",
    summary: `Completed transport request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=transport_completed`);
}

export async function cancelTransportRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = transportIdSchema.safeParse({ request_id: field(formData, "request_id") });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select a transport request.");
  }

  const request = await fetchTransportRequestForMutation(parsed.data.request_id);

  if (!request) {
    fleetLogisticsError("Transport request was not found.");
  }

  if (!canCancelOpsTransportRequest(profile.id, profile.role, request)) {
    fleetLogisticsError("Your role cannot cancel this transport request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", request.id)
    .in("status", ["draft", "submitted", "approved", "scheduled"]);

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (request.cost_entry_id) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: normalizeNumber(request.actual_cost) || normalizeNumber(request.estimated_cost),
      costDate: request.requested_for,
      costEntryId: request.cost_entry_id,
      costType: "transport",
      description: `${request.request_number} - ${request.title}`,
      siteId: request.site_id,
      sourceId: request.id,
      sourceTable: "transport_requests",
      status: "cancelled",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "transport_request.cancelled",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "transport_request",
    metadata: { cancelled_at: now },
    moduleKey: "fleet_logistics",
    sourceId: request.id,
    sourceTable: "transport_requests",
    summary: `Cancelled transport request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=transport_cancelled`);
}

export async function createAccommodationBookingAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsAccommodationBooking(profile.role)) {
    fleetLogisticsError("Your role cannot create accommodation bookings.");
  }

  const parsed = accommodationSchema.safeParse({
    actual_cost: field(formData, "actual_cost") || "0",
    check_in_date: field(formData, "check_in_date"),
    check_out_date: field(formData, "check_out_date"),
    employee_id: field(formData, "employee_id"),
    estimated_cost: field(formData, "estimated_cost") || "0",
    location_name: field(formData, "location_name"),
    notes: field(formData, "notes"),
    occupant_count: field(formData, "occupant_count") || "1",
    provider_name: field(formData, "provider_name"),
    site_id: field(formData, "site_id"),
    worker_id: field(formData, "worker_id"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Check the accommodation booking.");
  }

  await assertActiveSite(parsed.data.site_id);
  const employeeId = normalizeOptionalUuid(parsed.data.employee_id);
  const workerId = normalizeOptionalUuid(parsed.data.worker_id);
  await Promise.all([fetchEmployeeForFleet(employeeId), fetchWorkerForFleet(workerId)]);

  const checkInDate = normalizeDateInput(parsed.data.check_in_date);
  const checkOutDate = normalizeDateInput(parsed.data.check_out_date);

  if (checkOutDate < checkInDate) {
    fleetLogisticsError("Check-out date cannot be before check-in date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("accommodation_bookings")
    .insert({
      actual_cost: parsed.data.actual_cost,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      created_by: profile.id,
      employee_id: employeeId,
      estimated_cost: parsed.data.estimated_cost,
      location_name: parsed.data.location_name,
      notes: parsed.data.notes,
      occupant_count: parsed.data.occupant_count,
      provider_name: parsed.data.provider_name,
      requested_by: profile.id,
      site_id: parsed.data.site_id,
      status: "requested",
      worker_id: workerId,
    })
    .select("id, booking_number")
    .single<{ booking_number: string; id: string }>();

  if (error || !data) {
    fleetLogisticsError(error?.message ?? "Could not create accommodation booking.");
  }

  await recordOpsAuditEvent({
    action: "accommodation_booking.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "accommodation_booking",
    metadata: {
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      employee_id: employeeId,
      site_id: parsed.data.site_id,
      worker_id: workerId,
    },
    moduleKey: "fleet_logistics",
    sourceId: data.id,
    sourceTable: "accommodation_bookings",
    summary: `Created accommodation booking ${data.booking_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  redirect(`${FLEET_LOGISTICS_ROUTE}?created=accommodation_booking`);
}

export async function confirmAccommodationBookingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = bookingIdSchema.safeParse({ booking_id: field(formData, "booking_id") });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select an accommodation booking.");
  }

  const booking = await fetchAccommodationBookingForMutation(parsed.data.booking_id);

  if (!booking) {
    fleetLogisticsError("Accommodation booking was not found.");
  }

  if (!canConfirmOpsAccommodationBooking(profile.role, booking)) {
    fleetLogisticsError("Your role cannot confirm this accommodation booking.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("accommodation_bookings")
    .update({ confirmed_at: now, confirmed_by: profile.id, status: "confirmed" })
    .eq("id", booking.id)
    .eq("status", "requested");

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (normalizeNumber(booking.estimated_cost) > 0) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: normalizeNumber(booking.estimated_cost),
      costDate: booking.check_in_date,
      costEntryId: booking.cost_entry_id,
      costType: "accommodation",
      description: `${booking.booking_number} - ${booking.location_name}`,
      siteId: booking.site_id,
      sourceId: booking.id,
      sourceTable: "accommodation_bookings",
      status: "committed",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "accommodation_booking.confirmed",
    actorUserId: profile.id,
    entityId: booking.id,
    entityType: "accommodation_booking",
    metadata: { confirmed_at: now },
    moduleKey: "fleet_logistics",
    sourceId: booking.id,
    sourceTable: "accommodation_bookings",
    summary: `Confirmed accommodation booking ${booking.booking_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=accommodation_confirmed`);
}

export async function checkInAccommodationBookingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = bookingIdSchema.safeParse({ booking_id: field(formData, "booking_id") });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select an accommodation booking.");
  }

  const booking = await fetchAccommodationBookingForMutation(parsed.data.booking_id);

  if (!booking) {
    fleetLogisticsError("Accommodation booking was not found.");
  }

  if (!canCheckInOpsAccommodationBooking(profile.role, booking)) {
    fleetLogisticsError("Your role cannot check in this accommodation booking.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("accommodation_bookings")
    .update({ checked_in_at: now, checked_in_by: profile.id, status: "checked_in" })
    .eq("id", booking.id)
    .eq("status", "confirmed");

  if (error) {
    fleetLogisticsError(error.message);
  }

  await recordOpsAuditEvent({
    action: "accommodation_booking.checked_in",
    actorUserId: profile.id,
    entityId: booking.id,
    entityType: "accommodation_booking",
    metadata: { checked_in_at: now },
    moduleKey: "fleet_logistics",
    sourceId: booking.id,
    sourceTable: "accommodation_bookings",
    summary: `Checked in accommodation booking ${booking.booking_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=accommodation_checked_in`);
}

export async function completeAccommodationBookingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeBookingSchema.safeParse({
    actual_cost: field(formData, "actual_cost") || "0",
    booking_id: field(formData, "booking_id"),
    notes: field(formData, "notes"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Check accommodation completion.");
  }

  const booking = await fetchAccommodationBookingForMutation(parsed.data.booking_id);

  if (!booking) {
    fleetLogisticsError("Accommodation booking was not found.");
  }

  if (!canCompleteOpsAccommodationBooking(profile.role, booking)) {
    fleetLogisticsError("Your role cannot complete this accommodation booking.");
  }

  const now = new Date().toISOString();
  const completedDate = now.slice(0, 10);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("accommodation_bookings")
    .update({
      actual_cost: parsed.data.actual_cost,
      completed_at: now,
      completed_by: profile.id,
      notes: parsed.data.notes,
      status: "completed",
    })
    .eq("id", booking.id)
    .eq("status", "checked_in");

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (parsed.data.actual_cost > 0 || normalizeNumber(booking.estimated_cost) > 0) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: parsed.data.actual_cost || normalizeNumber(booking.estimated_cost),
      costDate: completedDate,
      costEntryId: booking.cost_entry_id,
      costType: "accommodation",
      description: `${booking.booking_number} - ${booking.location_name}`,
      siteId: booking.site_id,
      sourceId: booking.id,
      sourceTable: "accommodation_bookings",
      status: "posted",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "accommodation_booking.completed",
    actorUserId: profile.id,
    entityId: booking.id,
    entityType: "accommodation_booking",
    metadata: { actual_cost: parsed.data.actual_cost, completed_at: now },
    moduleKey: "fleet_logistics",
    sourceId: booking.id,
    sourceTable: "accommodation_bookings",
    summary: `Completed accommodation booking ${booking.booking_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=accommodation_completed`);
}

export async function cancelAccommodationBookingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = bookingIdSchema.safeParse({ booking_id: field(formData, "booking_id") });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select an accommodation booking.");
  }

  const booking = await fetchAccommodationBookingForMutation(parsed.data.booking_id);

  if (!booking) {
    fleetLogisticsError("Accommodation booking was not found.");
  }

  if (!canCancelOpsAccommodationBooking(profile.id, profile.role, booking)) {
    fleetLogisticsError("Your role cannot cancel this accommodation booking.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("accommodation_bookings")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", booking.id)
    .in("status", ["requested", "confirmed", "checked_in"]);

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (booking.cost_entry_id) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: normalizeNumber(booking.actual_cost) || normalizeNumber(booking.estimated_cost),
      costDate: booking.check_in_date,
      costEntryId: booking.cost_entry_id,
      costType: "accommodation",
      description: `${booking.booking_number} - ${booking.location_name}`,
      siteId: booking.site_id,
      sourceId: booking.id,
      sourceTable: "accommodation_bookings",
      status: "cancelled",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "accommodation_booking.cancelled",
    actorUserId: profile.id,
    entityId: booking.id,
    entityType: "accommodation_booking",
    metadata: { cancelled_at: now },
    moduleKey: "fleet_logistics",
    sourceId: booking.id,
    sourceTable: "accommodation_bookings",
    summary: `Cancelled accommodation booking ${booking.booking_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=accommodation_cancelled`);
}

export async function createLabourAllocationAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsLabourAllocation(profile.role)) {
    fleetLogisticsError("Your role cannot create labour allocations.");
  }

  const parsed = labourAllocationSchema.safeParse({
    daily_rate: field(formData, "daily_rate") || "0",
    employee_id: field(formData, "employee_id"),
    end_date: field(formData, "end_date"),
    notes: field(formData, "notes"),
    planned_days: field(formData, "planned_days") || "1",
    role_title: field(formData, "role_title"),
    site_id: field(formData, "site_id"),
    start_date: field(formData, "start_date"),
    trade: field(formData, "trade"),
    worker_id: field(formData, "worker_id"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Check the labour allocation.");
  }

  const employeeId = normalizeOptionalUuid(parsed.data.employee_id);
  const workerId = normalizeOptionalUuid(parsed.data.worker_id);

  if (!employeeId && !workerId) {
    fleetLogisticsError("Select an employee or worker for labour allocation.");
  }

  await assertActiveSite(parsed.data.site_id);
  const [employee, worker] = await Promise.all([
    fetchEmployeeForFleet(employeeId),
    fetchWorkerForFleet(workerId),
  ]);
  const startDate = normalizeDateInput(parsed.data.start_date);
  const endDate = normalizeDateInput(parsed.data.end_date, false);

  if (endDate && endDate < startDate) {
    fleetLogisticsError("End date cannot be before start date.");
  }

  const dailyRate = parsed.data.daily_rate || normalizeNumber(worker?.daily_rate);
  const roleTitle = parsed.data.role_title || employee?.job_title || worker?.trade || "Labour";
  const trade = parsed.data.trade || worker?.trade || employee?.job_title || "";
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("labour_allocations")
    .insert({
      created_by: profile.id,
      daily_rate: dailyRate,
      employee_id: employeeId,
      end_date: endDate,
      notes: parsed.data.notes,
      planned_days: parsed.data.planned_days,
      requested_by: profile.id,
      role_title: roleTitle,
      site_id: parsed.data.site_id,
      start_date: startDate,
      status: "planned",
      trade,
      worker_id: workerId,
    })
    .select("id, allocation_number")
    .single<{ allocation_number: string; id: string }>();

  if (error || !data) {
    fleetLogisticsError(error?.message ?? "Could not create labour allocation.");
  }

  await recordOpsAuditEvent({
    action: "labour_allocation.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "labour_allocation",
    metadata: {
      employee_id: employeeId,
      planned_days: parsed.data.planned_days,
      site_id: parsed.data.site_id,
      worker_id: workerId,
    },
    moduleKey: "fleet_logistics",
    sourceId: data.id,
    sourceTable: "labour_allocations",
    summary: `Created labour allocation ${data.allocation_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  redirect(`${FLEET_LOGISTICS_ROUTE}?created=labour_allocation`);
}

export async function startLabourAllocationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = allocationIdSchema.safeParse({ allocation_id: field(formData, "allocation_id") });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select a labour allocation.");
  }

  const allocation = await fetchLabourAllocationForMutation(parsed.data.allocation_id);

  if (!allocation) {
    fleetLogisticsError("Labour allocation was not found.");
  }

  if (!canStartOpsLabourAllocation(profile.role, allocation)) {
    fleetLogisticsError("Your role cannot start this labour allocation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("labour_allocations")
    .update({ started_at: now, started_by: profile.id, status: "active" })
    .eq("id", allocation.id)
    .eq("status", "planned");

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (normalizeNumber(allocation.estimated_cost) > 0) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: normalizeNumber(allocation.estimated_cost),
      costDate: allocation.start_date,
      costEntryId: allocation.cost_entry_id,
      costType: "labour",
      description: `${allocation.allocation_number} - ${allocation.role_title}`,
      siteId: allocation.site_id,
      sourceId: allocation.id,
      sourceTable: "labour_allocations",
      status: "committed",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "labour_allocation.started",
    actorUserId: profile.id,
    entityId: allocation.id,
    entityType: "labour_allocation",
    metadata: { started_at: now },
    moduleKey: "fleet_logistics",
    sourceId: allocation.id,
    sourceTable: "labour_allocations",
    summary: `Started labour allocation ${allocation.allocation_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=labour_started`);
}

export async function completeLabourAllocationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeLabourAllocationSchema.safeParse({
    actual_days: field(formData, "actual_days") || "0",
    allocation_id: field(formData, "allocation_id"),
    notes: field(formData, "notes"),
  });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Check labour completion.");
  }

  const allocation = await fetchLabourAllocationForMutation(parsed.data.allocation_id);

  if (!allocation) {
    fleetLogisticsError("Labour allocation was not found.");
  }

  if (!canCompleteOpsLabourAllocation(profile.role, allocation)) {
    fleetLogisticsError("Your role cannot complete this labour allocation.");
  }

  const now = new Date().toISOString();
  const completedDate = now.slice(0, 10);
  const actualDays = parsed.data.actual_days || normalizeNumber(allocation.planned_days);
  const actualCost = actualDays * normalizeNumber(allocation.daily_rate);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("labour_allocations")
    .update({
      actual_days: actualDays,
      completed_at: now,
      completed_by: profile.id,
      notes: parsed.data.notes,
      status: "completed",
    })
    .eq("id", allocation.id)
    .eq("status", "active");

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (actualCost > 0 || normalizeNumber(allocation.estimated_cost) > 0) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: actualCost || normalizeNumber(allocation.estimated_cost),
      costDate: completedDate,
      costEntryId: allocation.cost_entry_id,
      costType: "labour",
      description: `${allocation.allocation_number} - ${allocation.role_title}`,
      siteId: allocation.site_id,
      sourceId: allocation.id,
      sourceTable: "labour_allocations",
      status: "posted",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "labour_allocation.completed",
    actorUserId: profile.id,
    entityId: allocation.id,
    entityType: "labour_allocation",
    metadata: { actual_days: actualDays, actual_cost: actualCost, completed_at: now },
    moduleKey: "fleet_logistics",
    sourceId: allocation.id,
    sourceTable: "labour_allocations",
    summary: `Completed labour allocation ${allocation.allocation_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=labour_completed`);
}

export async function cancelLabourAllocationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = allocationIdSchema.safeParse({ allocation_id: field(formData, "allocation_id") });

  if (!parsed.success) {
    fleetLogisticsError(parsed.error.issues[0]?.message ?? "Select a labour allocation.");
  }

  const allocation = await fetchLabourAllocationForMutation(parsed.data.allocation_id);

  if (!allocation) {
    fleetLogisticsError("Labour allocation was not found.");
  }

  if (!canCancelOpsLabourAllocation(profile.id, profile.role, allocation)) {
    fleetLogisticsError("Your role cannot cancel this labour allocation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("labour_allocations")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", allocation.id)
    .in("status", ["planned", "active"]);

  if (error) {
    fleetLogisticsError(error.message);
  }

  if (allocation.cost_entry_id) {
    await upsertFleetCostEntry({
      actorUserId: profile.id,
      amount: normalizeNumber(allocation.actual_cost) || normalizeNumber(allocation.estimated_cost),
      costDate: allocation.start_date,
      costEntryId: allocation.cost_entry_id,
      costType: "labour",
      description: `${allocation.allocation_number} - ${allocation.role_title}`,
      siteId: allocation.site_id,
      sourceId: allocation.id,
      sourceTable: "labour_allocations",
      status: "cancelled",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "labour_allocation.cancelled",
    actorUserId: profile.id,
    entityId: allocation.id,
    entityType: "labour_allocation",
    metadata: { cancelled_at: now },
    moduleKey: "fleet_logistics",
    sourceId: allocation.id,
    sourceTable: "labour_allocations",
    summary: `Cancelled labour allocation ${allocation.allocation_number}`,
  }).catch(() => null);

  revalidatePath(FLEET_LOGISTICS_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${FLEET_LOGISTICS_ROUTE}?updated=labour_cancelled`);
}
