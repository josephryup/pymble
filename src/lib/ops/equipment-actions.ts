"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canAllocateOpsEquipment,
  canApproveOpsEquipmentRequest,
  canCancelOpsEquipmentAllocation,
  canCancelOpsEquipmentRequest,
  canCancelOpsMaintenanceJob,
  canCompleteOpsEquipmentAllocation,
  canCompleteOpsMaintenanceJob,
  canCreateOpsMaintenanceJob,
  canCreateOpsEquipmentRequest,
  canManageOpsEquipmentMasterData,
  canRejectOpsEquipmentRequest,
  canRecordOpsFuelLog,
  canStartOpsEquipmentAllocation,
  canStartOpsMaintenanceJob,
  canSubmitOpsEquipmentRequest,
} from "@/lib/ops/equipment-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsEquipmentAllocationStatus,
  OpsEquipmentOwnership,
  OpsEquipmentRequestStatus,
  OpsEquipmentStatus,
  OpsMaintenanceJobStatus,
  OpsMaintenanceJobType,
  OpsPriority,
} from "@/lib/ops/types";

const EQUIPMENT_ROUTE = "/ops/equipment";

const optionalCode = z
  .string()
  .trim()
  .max(28, "Code must be 28 characters or fewer.")
  .transform((value) => value.toUpperCase().replace(/\s+/g, "-"))
  .transform((value) => (value.length > 0 ? value : null));

const categorySchema = z.object({
  category_code: optionalCode,
  default_daily_rate: z.coerce.number().min(0, "Default daily rate cannot be negative."),
  description: z.string().trim().max(600).default(""),
  name: z.string().trim().min(2, "Category name is required.").max(140),
});

const equipmentOwnerships = ["company_owned", "hired", "leased"] as const satisfies readonly OpsEquipmentOwnership[];

const equipmentSchema = z.object({
  base_location: z.string().trim().max(160).default(""),
  category_id: z.string().uuid("Select an equipment category."),
  current_site_id: z.string().trim().default(""),
  daily_rate: z.coerce.number().min(0, "Daily rate cannot be negative."),
  equipment_code: optionalCode,
  fuel_tracking_enabled: z.boolean().default(false),
  name: z.string().trim().min(2, "Equipment name is required.").max(160),
  notes: z.string().trim().max(900).default(""),
  ownership: z.enum(equipmentOwnerships),
  registration_number: z.string().trim().max(80).default(""),
  serial_number: z.string().trim().max(120).default(""),
});

const priorities = ["low", "normal", "high", "urgent"] as const satisfies readonly OpsPriority[];

const equipmentRequestSchema = z.object({
  description: z.string().trim().max(1200).default(""),
  equipment_category_id: z.string().trim().default(""),
  needed_from: z.string().trim().default(""),
  needed_until: z.string().trim().default(""),
  preferred_equipment_id: z.string().trim().default(""),
  priority: z.enum(priorities),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least one.").max(50),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Request title is required.").max(180),
});

const requestIdSchema = z.object({
  request_id: z.string().uuid("Select an equipment request."),
});

const allocationSchema = z.object({
  actual_daily_rate: z.coerce.number().min(0, "Actual daily rate cannot be negative.").default(0),
  allocated_from: z.string().trim().default(""),
  allocated_until: z.string().trim().default(""),
  equipment_id: z.string().uuid("Select equipment."),
  notes: z.string().trim().max(900).default(""),
  planned_daily_rate: z.coerce.number().min(0, "Planned daily rate cannot be negative.").default(0),
  request_id: z.string().uuid("Select an equipment request."),
});

const allocationIdSchema = z.object({
  allocation_id: z.string().uuid("Select an allocation."),
});

const fuelTypes = ["diesel", "petrol", "hydraulic_oil", "engine_oil", "other"] as const;

const fuelLogSchema = z.object({
  allocation_id: z.string().trim().default(""),
  equipment_id: z.string().uuid("Select equipment."),
  fuel_date: z.string().trim().default(""),
  fuel_type: z.enum(fuelTypes).default("diesel"),
  notes: z.string().trim().max(800).default(""),
  odometer_hours: z.coerce.number().min(0, "Odometer or hours cannot be negative.").default(0),
  quantity_litres: z.coerce.number().positive("Fuel quantity must be greater than zero."),
  site_id: z.string().trim().default(""),
  unit_cost: z.coerce.number().min(0, "Unit cost cannot be negative.").default(0),
});

const maintenanceJobTypes = [
  "preventive",
  "repair",
  "inspection",
  "service",
  "breakdown",
  "other",
] as const satisfies readonly OpsMaintenanceJobType[];

const maintenanceJobSchema = z.object({
  description: z.string().trim().max(1200).default(""),
  equipment_id: z.string().uuid("Select equipment."),
  estimated_cost: z.coerce.number().min(0, "Estimated cost cannot be negative.").default(0),
  job_type: z.enum(maintenanceJobTypes).default("service"),
  notes: z.string().trim().max(900).default(""),
  priority: z.enum(priorities).default("normal"),
  reported_at: z.string().trim().default(""),
  scheduled_for: z.string().trim().default(""),
  service_provider: z.string().trim().max(180).default(""),
  site_id: z.string().trim().default(""),
  title: z.string().trim().min(2, "Maintenance title is required.").max(180),
});

const maintenanceJobIdSchema = z.object({
  job_id: z.string().uuid("Select a maintenance job."),
});

const completeMaintenanceJobSchema = maintenanceJobIdSchema.extend({
  actual_cost: z.coerce.number().min(0, "Actual cost cannot be negative.").default(0),
  downtime_hours: z.coerce.number().min(0, "Downtime cannot be negative.").default(0),
  next_service_due: z.string().trim().default(""),
  notes: z.string().trim().max(900).default(""),
});

type SiteForEquipment = {
  id: string;
  is_active: boolean;
};

type EquipmentCategoryForMutation = {
  default_daily_rate: number | string;
  id: string;
  is_active: boolean;
  name: string;
};

type EquipmentForMutation = {
  category_id: string;
  current_site_id: string | null;
  daily_rate: number | string;
  equipment_code: string;
  id: string;
  name: string;
  status: OpsEquipmentStatus;
};

type EquipmentRequestForMutation = {
  equipment_category_id: string | null;
  id: string;
  needed_from: string;
  needed_until: string | null;
  preferred_equipment_id: string | null;
  quantity: number | string;
  request_number: string;
  requested_by: string | null;
  site_id: string;
  status: OpsEquipmentRequestStatus;
  title: string;
};

type EquipmentAllocationForMutation = {
  actual_daily_rate: number | string;
  allocated_from: string;
  allocated_until: string | null;
  allocation_number: string;
  cost_entry_id: string | null;
  equipment_id: string;
  id: string;
  planned_daily_rate: number | string;
  request_id: string | null;
  site_id: string;
  status: OpsEquipmentAllocationStatus;
};

type MaintenanceJobForMutation = {
  actual_cost: number | string;
  cost_entry_id: string | null;
  equipment_id: string;
  id: string;
  job_number: string;
  job_type: OpsMaintenanceJobType;
  notes: string;
  reported_at: string;
  scheduled_for: string | null;
  site_id: string | null;
  status: OpsMaintenanceJobStatus;
  title: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function equipmentError(message: string): never {
  redirect(`${EQUIPMENT_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
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
    equipmentError("Use a valid date.");
  }

  return value;
}

function allocationDayCount(from: string, until: string | null) {
  const start = Date.parse(`${from}T00:00:00+02:00`);
  const end = Date.parse(`${until ?? from}T00:00:00+02:00`);
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(Math.floor((end - start) / oneDay) + 1, 1);
}

function allocationAmount(allocation: Pick<EquipmentAllocationForMutation, "actual_daily_rate" | "allocated_from" | "allocated_until" | "planned_daily_rate">) {
  const actualRate = normalizeNumber(allocation.actual_daily_rate);
  const plannedRate = normalizeNumber(allocation.planned_daily_rate);
  return allocationDayCount(allocation.allocated_from, allocation.allocated_until) * (actualRate || plannedRate);
}

async function assertActiveSite(siteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, is_active")
    .eq("id", siteId)
    .maybeSingle<SiteForEquipment>();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    equipmentError("Select an active site.");
  }

  return data;
}

async function fetchEquipmentCategoryForMutation(categoryId: string) {
  if (!categoryId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .select("id, name, default_daily_rate, is_active")
    .eq("id", categoryId)
    .maybeSingle<EquipmentCategoryForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchEquipmentForMutation(equipmentId: string) {
  if (!equipmentId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id, equipment_code, category_id, name, daily_rate, status, current_site_id")
    .eq("id", equipmentId)
    .maybeSingle<EquipmentForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchOpenAllocationForEquipment(equipmentId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_allocations")
    .select("id, allocation_number, request_id, equipment_id, site_id, allocated_from, allocated_until, status, planned_daily_rate, actual_daily_rate, cost_entry_id")
    .eq("equipment_id", equipmentId)
    .in("status", ["active", "scheduled"])
    .order("allocated_from", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  const allocations = (data ?? []) as EquipmentAllocationForMutation[];
  return allocations.find((allocation) => allocation.status === "active") ?? allocations[0] ?? null;
}

async function fetchEquipmentRequestForMutation(requestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_requests")
    .select("id, request_number, site_id, equipment_category_id, preferred_equipment_id, title, quantity, needed_from, needed_until, status, requested_by")
    .eq("id", requestId)
    .maybeSingle<EquipmentRequestForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchEquipmentAllocationForMutation(allocationId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_allocations")
    .select("id, allocation_number, request_id, equipment_id, site_id, allocated_from, allocated_until, status, planned_daily_rate, actual_daily_rate, cost_entry_id")
    .eq("id", allocationId)
    .maybeSingle<EquipmentAllocationForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchMaintenanceJobForMutation(jobId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("maintenance_jobs")
    .select("id, job_number, equipment_id, site_id, job_type, status, title, reported_at, scheduled_for, actual_cost, cost_entry_id, notes")
    .eq("id", jobId)
    .maybeSingle<MaintenanceJobForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function restoreEquipmentAvailability(equipmentId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const allocation = await fetchOpenAllocationForEquipment(equipmentId);

  if (allocation) {
    await supabase
      .from("equipment")
      .update({ current_site_id: allocation.site_id, status: "allocated" })
      .eq("id", equipmentId);
    return;
  }

  await supabase
    .from("equipment")
    .update({ current_site_id: null, status: "available" })
    .eq("id", equipmentId)
    .neq("status", "inactive");
}

async function createAllocationCostEntry(input: {
  actorUserId: string;
  allocation: EquipmentAllocationForMutation;
  equipment: EquipmentForMutation;
  status: "committed" | "posted" | "cancelled";
}) {
  const supabase = getOpsSupabaseServiceClient();
  const amount = allocationAmount(input.allocation);
  const payload = {
    amount,
    budget_id: null,
    budget_line_id: null,
    cost_date: input.allocation.allocated_from,
    cost_type: "equipment",
    currency_code: "ZMW",
    description: `${input.equipment.equipment_code} - ${input.equipment.name}`,
    payment_request_id: null,
    purchase_order_id: null,
    site_id: input.allocation.site_id,
    source_id: input.allocation.id,
    source_table: "equipment_allocations",
    status: input.status,
    supplier_id: null,
  };

  if (input.allocation.cost_entry_id) {
    const { error } = await supabase
      .from("project_cost_entries")
      .update(payload)
      .eq("id", input.allocation.cost_entry_id);

    if (error) {
      throw error;
    }

    return input.allocation.cost_entry_id;
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
    throw error ?? new Error("Could not create equipment cost entry.");
  }

  await supabase
    .from("equipment_allocations")
    .update({ cost_entry_id: data.id })
    .eq("id", input.allocation.id);

  return data.id;
}

async function createMaintenanceCostEntry(input: {
  actorUserId: string;
  amount: number;
  completedDate: string;
  equipment: EquipmentForMutation;
  job: MaintenanceJobForMutation;
  status: "posted" | "cancelled";
}) {
  if (!input.job.site_id) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const payload = {
    amount: input.amount,
    budget_id: null,
    budget_line_id: null,
    cost_date: input.completedDate,
    cost_type: "maintenance",
    currency_code: "ZMW",
    description: `${input.equipment.equipment_code} - ${input.job.title}`,
    payment_request_id: null,
    purchase_order_id: null,
    site_id: input.job.site_id,
    source_id: input.job.id,
    source_table: "maintenance_jobs",
    status: input.status,
    supplier_id: null,
  };

  if (input.job.cost_entry_id) {
    const { error } = await supabase
      .from("project_cost_entries")
      .update(payload)
      .eq("id", input.job.cost_entry_id);

    if (error) {
      throw error;
    }

    return input.job.cost_entry_id;
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
    throw error ?? new Error("Could not create maintenance cost entry.");
  }

  await supabase
    .from("maintenance_jobs")
    .update({ cost_entry_id: data.id })
    .eq("id", input.job.id);

  return data.id;
}

export async function createEquipmentCategoryAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsEquipmentMasterData(profile.role)) {
    equipmentError("Your role cannot create equipment categories.");
  }

  const parsed = categorySchema.safeParse({
    category_code: field(formData, "category_code"),
    default_daily_rate: field(formData, "default_daily_rate") || "0",
    description: field(formData, "description"),
    name: field(formData, "name"),
  });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Check the equipment category.");
  }

  const insert: Record<string, unknown> = {
    created_by: profile.id,
    default_daily_rate: parsed.data.default_daily_rate,
    description: parsed.data.description,
    name: parsed.data.name,
  };

  if (parsed.data.category_code) {
    insert.category_code = parsed.data.category_code;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .insert(insert)
    .select("id, category_code")
    .single<{ category_code: string; id: string }>();

  if (error || !data) {
    equipmentError(error?.code === "23505" ? "That category code already exists." : error?.message ?? "Could not create equipment category.");
  }

  await recordOpsAuditEvent({
    action: "equipment.category_created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "equipment_category",
    metadata: {
      category_code: data.category_code,
      default_daily_rate: parsed.data.default_daily_rate,
    },
    moduleKey: "equipment",
    sourceId: data.id,
    sourceTable: "equipment_categories",
    summary: `Created equipment category ${data.category_code}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?created=category`);
}

export async function createEquipmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsEquipmentMasterData(profile.role)) {
    equipmentError("Your role cannot create equipment records.");
  }

  const parsed = equipmentSchema.safeParse({
    base_location: field(formData, "base_location"),
    category_id: field(formData, "category_id"),
    current_site_id: field(formData, "current_site_id"),
    daily_rate: field(formData, "daily_rate") || "0",
    equipment_code: field(formData, "equipment_code"),
    fuel_tracking_enabled: field(formData, "fuel_tracking_enabled") === "on",
    name: field(formData, "name"),
    notes: field(formData, "notes"),
    ownership: field(formData, "ownership") || "company_owned",
    registration_number: field(formData, "registration_number"),
    serial_number: field(formData, "serial_number"),
  });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Check the equipment record.");
  }

  const category = await fetchEquipmentCategoryForMutation(parsed.data.category_id);

  if (!category || !category.is_active) {
    equipmentError("Select an active equipment category.");
  }

  if (parsed.data.current_site_id) {
    await assertActiveSite(parsed.data.current_site_id);
  }

  const insert: Record<string, unknown> = {
    base_location: parsed.data.base_location,
    category_id: category.id,
    created_by: profile.id,
    current_site_id: normalizeOptionalUuid(parsed.data.current_site_id),
    daily_rate: parsed.data.daily_rate || normalizeNumber(category.default_daily_rate),
    fuel_tracking_enabled: parsed.data.fuel_tracking_enabled,
    name: parsed.data.name,
    notes: parsed.data.notes,
    ownership: parsed.data.ownership,
    registration_number: parsed.data.registration_number,
    serial_number: parsed.data.serial_number,
    status: parsed.data.current_site_id ? "allocated" : "available",
  };

  if (parsed.data.equipment_code) {
    insert.equipment_code = parsed.data.equipment_code;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment")
    .insert(insert)
    .select("id, equipment_code")
    .single<{ equipment_code: string; id: string }>();

  if (error || !data) {
    equipmentError(error?.code === "23505" ? "That equipment code already exists." : error?.message ?? "Could not create equipment.");
  }

  await recordOpsAuditEvent({
    action: "equipment.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "equipment",
    metadata: {
      category_id: category.id,
      equipment_code: data.equipment_code,
      ownership: parsed.data.ownership,
    },
    moduleKey: "equipment",
    sourceId: data.id,
    sourceTable: "equipment",
    summary: `Created equipment ${data.equipment_code}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?created=equipment`);
}

export async function createEquipmentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEquipmentRequest(profile.role)) {
    equipmentError("Your role cannot create equipment requests.");
  }

  const parsed = equipmentRequestSchema.safeParse({
    description: field(formData, "description"),
    equipment_category_id: field(formData, "equipment_category_id"),
    needed_from: field(formData, "needed_from"),
    needed_until: field(formData, "needed_until"),
    preferred_equipment_id: field(formData, "preferred_equipment_id"),
    priority: field(formData, "priority") || "normal",
    quantity: field(formData, "quantity") || "1",
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Check the equipment request.");
  }

  await assertActiveSite(parsed.data.site_id);
  const [category, preferredEquipment] = await Promise.all([
    fetchEquipmentCategoryForMutation(parsed.data.equipment_category_id),
    fetchEquipmentForMutation(parsed.data.preferred_equipment_id),
  ]);

  if (parsed.data.equipment_category_id && (!category || !category.is_active)) {
    equipmentError("Select an active equipment category or leave it blank.");
  }

  if (parsed.data.preferred_equipment_id && !preferredEquipment) {
    equipmentError("Preferred equipment was not found.");
  }

  const neededFrom = normalizeDateInput(parsed.data.needed_from);
  const neededUntil = normalizeDateInput(parsed.data.needed_until, false);

  if (neededUntil && neededUntil < neededFrom) {
    equipmentError("Needed-until date cannot be before needed-from date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("equipment_requests")
    .insert({
      created_by: profile.id,
      description: parsed.data.description,
      equipment_category_id: normalizeOptionalUuid(category?.id ?? ""),
      needed_from: neededFrom,
      needed_until: neededUntil,
      preferred_equipment_id: normalizeOptionalUuid(preferredEquipment?.id ?? ""),
      priority: parsed.data.priority,
      quantity: parsed.data.quantity,
      requested_by: profile.id,
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, request_number")
    .single<{ id: string; request_number: string }>();

  if (error || !data) {
    equipmentError(error?.message ?? "Could not create equipment request.");
  }

  await recordOpsAuditEvent({
    action: "equipment_request.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "equipment_request",
    metadata: {
      priority: parsed.data.priority,
      quantity: parsed.data.quantity,
      request_number: data.request_number,
      site_id: parsed.data.site_id,
    },
    moduleKey: "equipment",
    sourceId: data.id,
    sourceTable: "equipment_requests",
    summary: `Created equipment request ${data.request_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?created=request`);
}

export async function submitEquipmentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select an equipment request.");
  }

  const request = await fetchEquipmentRequestForMutation(parsed.data.request_id);

  if (!request) {
    equipmentError("Equipment request was not found.");
  }

  if (!canSubmitOpsEquipmentRequest(profile.id, profile.role, request)) {
    equipmentError("Your role cannot submit this equipment request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("equipment_requests")
    .update({ status: "submitted", submitted_at: now })
    .eq("id", request.id)
    .in("status", ["draft", "rejected"]);

  if (error) {
    equipmentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "equipment_request.submitted",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "equipment_request",
    metadata: { submitted_at: now },
    moduleKey: "equipment",
    sourceId: request.id,
    sourceTable: "equipment_requests",
    summary: `Submitted equipment request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?updated=submitted`);
}

export async function approveEquipmentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select an equipment request.");
  }

  const request = await fetchEquipmentRequestForMutation(parsed.data.request_id);

  if (!request) {
    equipmentError("Equipment request was not found.");
  }

  if (!canApproveOpsEquipmentRequest(profile.role, request)) {
    equipmentError("Your role cannot approve this equipment request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("equipment_requests")
    .update({ approved_at: now, approved_by: profile.id, reviewed_at: now, reviewed_by: profile.id, status: "approved" })
    .eq("id", request.id)
    .eq("status", "submitted");

  if (error) {
    equipmentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "equipment_request.approved",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "equipment_request",
    metadata: { approved_at: now },
    moduleKey: "equipment",
    sourceId: request.id,
    sourceTable: "equipment_requests",
    summary: `Approved equipment request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?updated=approved`);
}

export async function rejectEquipmentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select an equipment request.");
  }

  const request = await fetchEquipmentRequestForMutation(parsed.data.request_id);

  if (!request) {
    equipmentError("Equipment request was not found.");
  }

  if (!canRejectOpsEquipmentRequest(profile.role, request)) {
    equipmentError("Your role cannot reject this equipment request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("equipment_requests")
    .update({ rejected_at: now, rejected_by: profile.id, reviewed_at: now, reviewed_by: profile.id, status: "rejected" })
    .eq("id", request.id)
    .eq("status", "submitted");

  if (error) {
    equipmentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "equipment_request.rejected",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "equipment_request",
    metadata: { rejected_at: now },
    moduleKey: "equipment",
    sourceId: request.id,
    sourceTable: "equipment_requests",
    summary: `Rejected equipment request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?updated=rejected`);
}

export async function cancelEquipmentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select an equipment request.");
  }

  const request = await fetchEquipmentRequestForMutation(parsed.data.request_id);

  if (!request) {
    equipmentError("Equipment request was not found.");
  }

  if (!canCancelOpsEquipmentRequest(profile.id, profile.role, request)) {
    equipmentError("Your role cannot cancel this equipment request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("equipment_requests")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", request.id)
    .in("status", ["draft", "submitted", "approved"]);

  if (error) {
    equipmentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "equipment_request.cancelled",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "equipment_request",
    metadata: { cancelled_at: now },
    moduleKey: "equipment",
    sourceId: request.id,
    sourceTable: "equipment_requests",
    summary: `Cancelled equipment request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?updated=cancelled`);
}

export async function allocateEquipmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = allocationSchema.safeParse({
    actual_daily_rate: field(formData, "actual_daily_rate") || "0",
    allocated_from: field(formData, "allocated_from"),
    allocated_until: field(formData, "allocated_until"),
    equipment_id: field(formData, "equipment_id"),
    notes: field(formData, "notes"),
    planned_daily_rate: field(formData, "planned_daily_rate") || "0",
    request_id: field(formData, "request_id"),
  });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Check the allocation.");
  }

  const [request, equipment] = await Promise.all([
    fetchEquipmentRequestForMutation(parsed.data.request_id),
    fetchEquipmentForMutation(parsed.data.equipment_id),
  ]);

  if (!request) {
    equipmentError("Equipment request was not found.");
  }

  if (!equipment) {
    equipmentError("Equipment was not found.");
  }

  if (!canAllocateOpsEquipment(profile.role, request)) {
    equipmentError("Your role cannot allocate equipment to this request.");
  }

  if (equipment.status !== "available") {
    equipmentError("Selected equipment is not available.");
  }

  const allocatedFrom = normalizeDateInput(parsed.data.allocated_from);
  const allocatedUntil = normalizeDateInput(parsed.data.allocated_until, false);

  if (allocatedUntil && allocatedUntil < allocatedFrom) {
    equipmentError("Allocation end date cannot be before start date.");
  }

  const plannedRate = parsed.data.planned_daily_rate || normalizeNumber(equipment.daily_rate);
  const actualRate = parsed.data.actual_daily_rate || plannedRate;
  const supabase = getOpsSupabaseServiceClient();
  const { data: allocation, error } = await supabase
    .from("equipment_allocations")
    .insert({
      actual_daily_rate: actualRate,
      allocated_by: profile.id,
      allocated_from: allocatedFrom,
      allocated_until: allocatedUntil,
      created_by: profile.id,
      equipment_id: equipment.id,
      notes: parsed.data.notes,
      planned_daily_rate: plannedRate,
      request_id: request.id,
      site_id: request.site_id,
      status: "scheduled",
    })
    .select("id, allocation_number, request_id, equipment_id, site_id, allocated_from, allocated_until, status, planned_daily_rate, actual_daily_rate, cost_entry_id")
    .single<EquipmentAllocationForMutation>();

  if (error || !allocation) {
    equipmentError(error?.message ?? "Could not allocate equipment.");
  }

  const costEntryId = await createAllocationCostEntry({
    actorUserId: profile.id,
    allocation,
    equipment,
    status: "committed",
  }).catch((error: unknown) => {
    recordOpsAuditEvent({
      action: "equipment_allocation.cost_entry_sync_failed",
      actorUserId: profile.id,
      entityId: allocation.id,
      entityType: "equipment_allocation",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown cost-entry sync error",
      },
      moduleKey: "equipment",
      sourceId: request.id,
      sourceTable: "equipment_requests",
      summary: `Cost entry sync failed for ${allocation.allocation_number}`,
    }).catch(() => null);
    return null;
  });

  await Promise.all([
    supabase
      .from("equipment")
      .update({ current_site_id: request.site_id, status: "allocated" })
      .eq("id", equipment.id)
      .eq("status", "available"),
    supabase.from("equipment_requests").update({ status: "allocated" }).eq("id", request.id),
  ]);

  await recordOpsAuditEvent({
    action: "equipment.allocated",
    actorUserId: profile.id,
    entityId: allocation.id,
    entityType: "equipment_allocation",
    metadata: {
      allocation_number: allocation.allocation_number,
      cost_entry_id: costEntryId,
      equipment_code: equipment.equipment_code,
      request_number: request.request_number,
      site_id: request.site_id,
    },
    moduleKey: "equipment",
    sourceId: request.id,
    sourceTable: "equipment_requests",
    summary: `Allocated ${equipment.equipment_code} to ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${EQUIPMENT_ROUTE}?updated=allocated`);
}

export async function startEquipmentAllocationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = allocationIdSchema.safeParse({ allocation_id: field(formData, "allocation_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select an allocation.");
  }

  const allocation = await fetchEquipmentAllocationForMutation(parsed.data.allocation_id);

  if (!allocation) {
    equipmentError("Equipment allocation was not found.");
  }

  if (!canStartOpsEquipmentAllocation(profile.role, allocation)) {
    equipmentError("Your role cannot start this allocation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("equipment_allocations")
    .update({ started_at: now, status: "active" })
    .eq("id", allocation.id)
    .eq("status", "scheduled");

  if (error) {
    equipmentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "equipment_allocation.started",
    actorUserId: profile.id,
    entityId: allocation.id,
    entityType: "equipment_allocation",
    metadata: { started_at: now },
    moduleKey: "equipment",
    sourceId: allocation.request_id ?? allocation.id,
    sourceTable: allocation.request_id ? "equipment_requests" : "equipment_allocations",
    summary: `Started allocation ${allocation.allocation_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?updated=allocation_started`);
}

export async function completeEquipmentAllocationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = allocationIdSchema.safeParse({ allocation_id: field(formData, "allocation_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select an allocation.");
  }

  const allocation = await fetchEquipmentAllocationForMutation(parsed.data.allocation_id);

  if (!allocation) {
    equipmentError("Equipment allocation was not found.");
  }

  if (!canCompleteOpsEquipmentAllocation(profile.role, allocation)) {
    equipmentError("Your role cannot complete this allocation.");
  }

  const equipment = await fetchEquipmentForMutation(allocation.equipment_id);

  if (!equipment) {
    equipmentError("Equipment was not found.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("equipment_allocations")
    .update({ completed_at: now, completed_by: profile.id, status: "completed" })
    .eq("id", allocation.id)
    .eq("status", "active");

  if (error) {
    equipmentError(error.message);
  }

  await Promise.all([
    supabase.from("equipment").update({ current_site_id: null, status: "available" }).eq("id", allocation.equipment_id),
    allocation.request_id
      ? supabase
          .from("equipment_requests")
          .update({ closed_at: now, closed_by: profile.id, status: "closed" })
          .eq("id", allocation.request_id)
      : Promise.resolve(),
  ]);

  await createAllocationCostEntry({
    actorUserId: profile.id,
    allocation,
    equipment,
    status: "posted",
  }).catch(() => null);

  await recordOpsAuditEvent({
    action: "equipment_allocation.completed",
    actorUserId: profile.id,
    entityId: allocation.id,
    entityType: "equipment_allocation",
    metadata: { completed_at: now },
    moduleKey: "equipment",
    sourceId: allocation.request_id ?? allocation.id,
    sourceTable: allocation.request_id ? "equipment_requests" : "equipment_allocations",
    summary: `Completed allocation ${allocation.allocation_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${EQUIPMENT_ROUTE}?updated=allocation_completed`);
}

export async function cancelEquipmentAllocationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = allocationIdSchema.safeParse({ allocation_id: field(formData, "allocation_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select an allocation.");
  }

  const allocation = await fetchEquipmentAllocationForMutation(parsed.data.allocation_id);

  if (!allocation) {
    equipmentError("Equipment allocation was not found.");
  }

  if (!canCancelOpsEquipmentAllocation(profile.role, allocation)) {
    equipmentError("Your role cannot cancel this allocation.");
  }

  const equipment = await fetchEquipmentForMutation(allocation.equipment_id);

  if (!equipment) {
    equipmentError("Equipment was not found.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("equipment_allocations")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", allocation.id)
    .in("status", ["scheduled", "active"]);

  if (error) {
    equipmentError(error.message);
  }

  await Promise.all([
    supabase.from("equipment").update({ current_site_id: null, status: "available" }).eq("id", allocation.equipment_id),
    allocation.request_id
      ? supabase
          .from("equipment_requests")
          .update({ status: "approved" })
          .eq("id", allocation.request_id)
          .eq("status", "allocated")
      : Promise.resolve(),
  ]);

  await createAllocationCostEntry({
    actorUserId: profile.id,
    allocation,
    equipment,
    status: "cancelled",
  }).catch(() => null);

  await recordOpsAuditEvent({
    action: "equipment_allocation.cancelled",
    actorUserId: profile.id,
    entityId: allocation.id,
    entityType: "equipment_allocation",
    metadata: { cancelled_at: now },
    moduleKey: "equipment",
    sourceId: allocation.request_id ?? allocation.id,
    sourceTable: allocation.request_id ? "equipment_requests" : "equipment_allocations",
    summary: `Cancelled allocation ${allocation.allocation_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${EQUIPMENT_ROUTE}?updated=allocation_cancelled`);
}

export async function recordFuelLogAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordOpsFuelLog(profile.role)) {
    equipmentError("Your role cannot record fuel logs.");
  }

  const parsed = fuelLogSchema.safeParse({
    allocation_id: field(formData, "allocation_id"),
    equipment_id: field(formData, "equipment_id"),
    fuel_date: field(formData, "fuel_date"),
    fuel_type: field(formData, "fuel_type") || "diesel",
    notes: field(formData, "notes"),
    odometer_hours: field(formData, "odometer_hours") || "0",
    quantity_litres: field(formData, "quantity_litres"),
    site_id: field(formData, "site_id"),
    unit_cost: field(formData, "unit_cost") || "0",
  });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Check the fuel log.");
  }

  const [equipment, allocation] = await Promise.all([
    fetchEquipmentForMutation(parsed.data.equipment_id),
    parsed.data.allocation_id
      ? fetchEquipmentAllocationForMutation(parsed.data.allocation_id)
      : Promise.resolve(null),
  ]);

  if (!equipment || equipment.status === "inactive") {
    equipmentError("Select active equipment.");
  }

  let siteId = normalizeOptionalUuid(parsed.data.site_id) ?? equipment.current_site_id;

  if (allocation) {
    if (allocation.equipment_id !== equipment.id) {
      equipmentError("Selected allocation does not belong to this equipment.");
    }

    if (allocation.status !== "active" && allocation.status !== "scheduled") {
      equipmentError("Fuel can only be logged against scheduled or active allocations.");
    }

    siteId = allocation.site_id;
  } else if (parsed.data.allocation_id) {
    equipmentError("Selected allocation was not found.");
  }

  if (siteId) {
    await assertActiveSite(siteId);
  }

  const fuelDate = normalizeDateInput(parsed.data.fuel_date);
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("fuel_logs")
    .insert({
      allocation_id: allocation?.id ?? null,
      created_by: profile.id,
      equipment_id: equipment.id,
      fuel_date: fuelDate,
      fuel_type: parsed.data.fuel_type,
      logged_by: profile.id,
      notes: parsed.data.notes,
      odometer_hours: parsed.data.odometer_hours,
      quantity_litres: parsed.data.quantity_litres,
      site_id: siteId,
      status: "posted",
      unit_cost: parsed.data.unit_cost,
    })
    .select("id, fuel_log_number")
    .single<{ fuel_log_number: string; id: string }>();

  if (error || !data) {
    equipmentError(error?.message ?? "Could not record the fuel log.");
  }

  await recordOpsAuditEvent({
    action: "fuel_log.posted",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "fuel_log",
    metadata: {
      equipment_code: equipment.equipment_code,
      fuel_date: fuelDate,
      quantity_litres: parsed.data.quantity_litres,
      site_id: siteId,
      total_amount: parsed.data.quantity_litres * parsed.data.unit_cost,
    },
    moduleKey: "equipment",
    sourceId: data.id,
    sourceTable: "fuel_logs",
    summary: `Posted fuel log ${data.fuel_log_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?created=fuel_log`);
}

export async function createMaintenanceJobAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsMaintenanceJob(profile.role)) {
    equipmentError("Your role cannot create maintenance jobs.");
  }

  const parsed = maintenanceJobSchema.safeParse({
    description: field(formData, "description"),
    equipment_id: field(formData, "equipment_id"),
    estimated_cost: field(formData, "estimated_cost") || "0",
    job_type: field(formData, "job_type") || "service",
    notes: field(formData, "notes"),
    priority: field(formData, "priority") || "normal",
    reported_at: field(formData, "reported_at"),
    scheduled_for: field(formData, "scheduled_for"),
    service_provider: field(formData, "service_provider"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Check the maintenance job.");
  }

  const equipment = await fetchEquipmentForMutation(parsed.data.equipment_id);

  if (!equipment || equipment.status === "inactive") {
    equipmentError("Select active equipment.");
  }

  const reportedAt = normalizeDateInput(parsed.data.reported_at);
  const scheduledFor = normalizeDateInput(parsed.data.scheduled_for, false);

  if (scheduledFor && scheduledFor < reportedAt) {
    equipmentError("Scheduled date cannot be before reported date.");
  }

  const siteId = normalizeOptionalUuid(parsed.data.site_id) ?? equipment.current_site_id;

  if (siteId) {
    await assertActiveSite(siteId);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("maintenance_jobs")
    .insert({
      created_by: profile.id,
      description: parsed.data.description,
      equipment_id: equipment.id,
      estimated_cost: parsed.data.estimated_cost,
      job_type: parsed.data.job_type,
      notes: parsed.data.notes,
      priority: parsed.data.priority,
      reported_at: reportedAt,
      scheduled_for: scheduledFor,
      service_provider: parsed.data.service_provider,
      site_id: siteId,
      status: "scheduled",
      title: parsed.data.title,
    })
    .select("id, job_number")
    .single<{ id: string; job_number: string }>();

  if (error || !data) {
    equipmentError(error?.message ?? "Could not create maintenance job.");
  }

  await recordOpsAuditEvent({
    action: "maintenance_job.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "maintenance_job",
    metadata: {
      equipment_code: equipment.equipment_code,
      job_type: parsed.data.job_type,
      priority: parsed.data.priority,
      site_id: siteId,
    },
    moduleKey: "equipment",
    sourceId: data.id,
    sourceTable: "maintenance_jobs",
    summary: `Created maintenance job ${data.job_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?created=maintenance_job`);
}

export async function startMaintenanceJobAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = maintenanceJobIdSchema.safeParse({ job_id: field(formData, "job_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select a maintenance job.");
  }

  const job = await fetchMaintenanceJobForMutation(parsed.data.job_id);

  if (!job) {
    equipmentError("Maintenance job was not found.");
  }

  if (!canStartOpsMaintenanceJob(profile.role, job)) {
    equipmentError("Your role cannot start this maintenance job.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("maintenance_jobs")
    .update({ started_at: now, started_by: profile.id, status: "in_progress" })
    .eq("id", job.id)
    .eq("status", "scheduled");

  if (error) {
    equipmentError(error.message);
  }

  await supabase
    .from("equipment")
    .update({ current_site_id: job.site_id, status: "maintenance" })
    .eq("id", job.equipment_id)
    .neq("status", "inactive");

  await recordOpsAuditEvent({
    action: "maintenance_job.started",
    actorUserId: profile.id,
    entityId: job.id,
    entityType: "maintenance_job",
    metadata: { started_at: now },
    moduleKey: "equipment",
    sourceId: job.id,
    sourceTable: "maintenance_jobs",
    summary: `Started maintenance job ${job.job_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  redirect(`${EQUIPMENT_ROUTE}?updated=maintenance_started`);
}

export async function completeMaintenanceJobAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeMaintenanceJobSchema.safeParse({
    actual_cost: field(formData, "actual_cost") || "0",
    downtime_hours: field(formData, "downtime_hours") || "0",
    job_id: field(formData, "job_id"),
    next_service_due: field(formData, "next_service_due"),
    notes: field(formData, "notes"),
  });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Check the maintenance completion.");
  }

  const job = await fetchMaintenanceJobForMutation(parsed.data.job_id);

  if (!job) {
    equipmentError("Maintenance job was not found.");
  }

  if (!canCompleteOpsMaintenanceJob(profile.role, job)) {
    equipmentError("Your role cannot complete this maintenance job.");
  }

  const equipment = await fetchEquipmentForMutation(job.equipment_id);

  if (!equipment) {
    equipmentError("Equipment was not found.");
  }

  const nextServiceDue = normalizeDateInput(parsed.data.next_service_due, false);
  const now = new Date().toISOString();
  const completedDate = now.slice(0, 10);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("maintenance_jobs")
    .update({
      actual_cost: parsed.data.actual_cost,
      completed_at: now,
      completed_by: profile.id,
      downtime_hours: parsed.data.downtime_hours,
      next_service_due: nextServiceDue,
      notes: parsed.data.notes || job.notes,
      status: "completed",
    })
    .eq("id", job.id)
    .eq("status", "in_progress");

  if (error) {
    equipmentError(error.message);
  }

  let costEntryId: string | null = null;

  if (parsed.data.actual_cost > 0) {
    costEntryId = await createMaintenanceCostEntry({
      actorUserId: profile.id,
      amount: parsed.data.actual_cost,
      completedDate,
      equipment,
      job,
      status: "posted",
    }).catch((error: unknown) => {
      recordOpsAuditEvent({
        action: "maintenance_job.cost_entry_sync_failed",
        actorUserId: profile.id,
        entityId: job.id,
        entityType: "maintenance_job",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown cost-entry sync error",
        },
        moduleKey: "equipment",
        sourceId: job.id,
        sourceTable: "maintenance_jobs",
        summary: `Cost entry sync failed for ${job.job_number}`,
      }).catch(() => null);
      return null;
    });
  }

  await restoreEquipmentAvailability(job.equipment_id);

  await recordOpsAuditEvent({
    action: "maintenance_job.completed",
    actorUserId: profile.id,
    entityId: job.id,
    entityType: "maintenance_job",
    metadata: {
      actual_cost: parsed.data.actual_cost,
      completed_at: now,
      cost_entry_id: costEntryId,
      downtime_hours: parsed.data.downtime_hours,
    },
    moduleKey: "equipment",
    sourceId: job.id,
    sourceTable: "maintenance_jobs",
    summary: `Completed maintenance job ${job.job_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${EQUIPMENT_ROUTE}?updated=maintenance_completed`);
}

export async function cancelMaintenanceJobAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = maintenanceJobIdSchema.safeParse({ job_id: field(formData, "job_id") });

  if (!parsed.success) {
    equipmentError(parsed.error.issues[0]?.message ?? "Select a maintenance job.");
  }

  const job = await fetchMaintenanceJobForMutation(parsed.data.job_id);

  if (!job) {
    equipmentError("Maintenance job was not found.");
  }

  if (!canCancelOpsMaintenanceJob(profile.role, job)) {
    equipmentError("Your role cannot cancel this maintenance job.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("maintenance_jobs")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", job.id)
    .in("status", ["scheduled", "in_progress"]);

  if (error) {
    equipmentError(error.message);
  }

  if (job.cost_entry_id) {
    await supabase
      .from("project_cost_entries")
      .update({ status: "cancelled" })
      .eq("id", job.cost_entry_id);
  }

  await restoreEquipmentAvailability(job.equipment_id);

  await recordOpsAuditEvent({
    action: "maintenance_job.cancelled",
    actorUserId: profile.id,
    entityId: job.id,
    entityType: "maintenance_job",
    metadata: { cancelled_at: now },
    moduleKey: "equipment",
    sourceId: job.id,
    sourceTable: "maintenance_jobs",
    summary: `Cancelled maintenance job ${job.job_number}`,
  }).catch(() => null);

  revalidatePath(EQUIPMENT_ROUTE);
  revalidatePath("/ops/project-budgets");
  redirect(`${EQUIPMENT_ROUTE}?updated=maintenance_cancelled`);
}
