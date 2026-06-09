"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canCancelOpsDeliveryException,
  canCreateOpsDeliveryException,
  canCloseOpsDeliveryException,
  canResolveOpsDeliveryException,
  canStartOpsDeliveryException,
} from "@/lib/ops/delivery-exception-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsDeliveryExceptionSeverity,
  OpsDeliveryExceptionStatus,
  OpsDeliveryExceptionType,
  OpsSupplierStatus,
} from "@/lib/ops/types";

const DELIVERY_EXCEPTION_ROUTE = "/ops/delivery-exceptions";

const deliveryExceptionTypes = [
  "late_delivery",
  "short_delivery",
  "over_delivery",
  "damaged_goods",
  "wrong_item",
  "quality_rejection",
  "missing_document",
  "other",
] as const satisfies readonly OpsDeliveryExceptionType[];

const deliveryExceptionSeverities = [
  "low",
  "medium",
  "high",
  "critical",
] as const satisfies readonly OpsDeliveryExceptionSeverity[];

const createDeliveryExceptionSchema = z.object({
  delivery_reference: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1200).default(""),
  due_at: z.string().trim().default(""),
  exception_type: z.enum(deliveryExceptionTypes),
  goods_received_note_id: z.string().trim().default(""),
  reported_at: z.string().trim().default(""),
  severity: z.enum(deliveryExceptionSeverities),
  site_id: z.string().uuid("Select a site."),
  supplier_id: z.string().uuid("Select a supplier."),
  title: z.string().trim().min(2, "Exception title is required.").max(180),
});

const exceptionIdSchema = z.object({
  exception_id: z.string().uuid("Select a delivery exception."),
});

const resolveDeliveryExceptionSchema = exceptionIdSchema.extend({
  performance_rating: z.coerce.number().int().min(1).max(5).optional().or(z.literal("")),
  resolution_summary: z.string().trim().min(2, "Resolution summary is required.").max(1200),
});

type SupplierForException = {
  id: string;
  legal_name: string;
  status: OpsSupplierStatus;
  supplier_code: string;
};

type SiteForException = {
  code: string;
  id: string;
  is_active: boolean;
  name: string;
};

type GrnForException = {
  delivery_reference: string;
  grn_number: string;
  id: string;
  purchase_order_id: string;
  site_id: string;
  status: string;
  supplier_id: string;
};

type DeliveryExceptionForMutation = {
  created_by: string | null;
  exception_number: string;
  id: string;
  resolution_summary: string;
  site_id: string;
  status: OpsDeliveryExceptionStatus;
  supplier_id: string;
  title: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function deliveryExceptionError(message: string): never {
  redirect(`${DELIVERY_EXCEPTION_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeRating(value: number | "" | undefined) {
  return value === "" || value === undefined ? null : value;
}

function normalizeDateInput(value: string, message: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    deliveryExceptionError(message);
  }

  return value;
}

function normalizeOptionalDateInput(value: string, message: string) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    deliveryExceptionError(message);
  }

  return value;
}

async function fetchSupplierForException(supplierId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_code, legal_name, status")
    .eq("id", supplierId)
    .maybeSingle<SupplierForException>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchSiteForException(siteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, code, name, is_active")
    .eq("id", siteId)
    .maybeSingle<SiteForException>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchGrnForException(grnId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("goods_received_notes")
    .select("id, grn_number, purchase_order_id, supplier_id, site_id, delivery_reference, status")
    .eq("id", grnId)
    .maybeSingle<GrnForException>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchDeliveryExceptionForMutation(exceptionId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("delivery_exceptions")
    .select("id, exception_number, supplier_id, site_id, status, title, resolution_summary, created_by")
    .eq("id", exceptionId)
    .maybeSingle<DeliveryExceptionForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createDeliveryExceptionAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsDeliveryException(profile.role)) {
    deliveryExceptionError("Your role cannot create delivery exceptions.");
  }

  const parsed = createDeliveryExceptionSchema.safeParse({
    delivery_reference: field(formData, "delivery_reference"),
    description: field(formData, "description"),
    due_at: field(formData, "due_at"),
    exception_type: field(formData, "exception_type") || "other",
    goods_received_note_id: field(formData, "goods_received_note_id"),
    reported_at: field(formData, "reported_at"),
    severity: field(formData, "severity") || "medium",
    site_id: field(formData, "site_id"),
    supplier_id: field(formData, "supplier_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    deliveryExceptionError(parsed.error.issues[0]?.message ?? "Check the delivery exception.");
  }

  const grn = parsed.data.goods_received_note_id
    ? await fetchGrnForException(parsed.data.goods_received_note_id)
    : null;

  if (parsed.data.goods_received_note_id && (!grn || grn.status !== "posted")) {
    deliveryExceptionError("Select a posted goods received note or leave the GRN field blank.");
  }

  const supplierId = grn?.supplier_id ?? parsed.data.supplier_id;
  const siteId = grn?.site_id ?? parsed.data.site_id;
  const [supplier, site] = await Promise.all([
    fetchSupplierForException(supplierId),
    fetchSiteForException(siteId),
  ]);

  if (!supplier || supplier.status === "archived") {
    deliveryExceptionError("Supplier was not found or is archived.");
  }

  if (!site || !site.is_active) {
    deliveryExceptionError("Select an active site.");
  }

  const reportedAt = normalizeDateInput(parsed.data.reported_at, "Use a valid reported date.");
  const dueAt = normalizeOptionalDateInput(parsed.data.due_at, "Use a valid due date.");

  if (dueAt && dueAt < reportedAt) {
    deliveryExceptionError("Due date cannot be before the reported date.");
  }

  const deliveryReference = parsed.data.delivery_reference || grn?.delivery_reference || "";
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("delivery_exceptions")
    .insert({
      created_by: profile.id,
      delivery_reference: deliveryReference,
      description: parsed.data.description,
      due_at: dueAt,
      exception_type: parsed.data.exception_type,
      goods_received_note_id: normalizeOptionalUuid(grn?.id ?? ""),
      purchase_order_id: normalizeOptionalUuid(grn?.purchase_order_id ?? ""),
      reported_at: reportedAt,
      reported_by: profile.id,
      severity: parsed.data.severity,
      site_id: site.id,
      status: "open",
      supplier_id: supplier.id,
      title: parsed.data.title,
    })
    .select("id, exception_number")
    .single<{ exception_number: string; id: string }>();

  if (error || !data) {
    deliveryExceptionError(error?.message ?? "Could not create the delivery exception.");
  }

  await recordOpsAuditEvent({
    action: "delivery_exception.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "delivery_exception",
    metadata: {
      exception_number: data.exception_number,
      exception_type: parsed.data.exception_type,
      goods_received_note_id: grn?.id ?? null,
      severity: parsed.data.severity,
      site_id: site.id,
      supplier_code: supplier.supplier_code,
    },
    moduleKey: "delivery_exceptions",
    sourceId: data.id,
    sourceTable: "delivery_exceptions",
    summary: `Created delivery exception ${data.exception_number}`,
  }).catch(() => null);

  revalidatePath(DELIVERY_EXCEPTION_ROUTE);
  revalidatePath("/ops/stores-inventory");
  redirect(`${DELIVERY_EXCEPTION_ROUTE}?created=exception`);
}

export async function startDeliveryExceptionInvestigationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = exceptionIdSchema.safeParse({
    exception_id: field(formData, "exception_id"),
  });

  if (!parsed.success) {
    deliveryExceptionError(parsed.error.issues[0]?.message ?? "Select a delivery exception.");
  }

  const exception = await fetchDeliveryExceptionForMutation(parsed.data.exception_id);

  if (!exception) {
    deliveryExceptionError("Delivery exception was not found.");
  }

  if (!canStartOpsDeliveryException(profile.role, exception)) {
    deliveryExceptionError("Your role cannot start this investigation.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("delivery_exceptions")
    .update({ assigned_to: profile.id, status: "investigating" })
    .eq("id", exception.id)
    .eq("status", "open");

  if (error) {
    deliveryExceptionError(error.message);
  }

  await recordOpsAuditEvent({
    action: "delivery_exception.investigation_started",
    actorUserId: profile.id,
    entityId: exception.id,
    entityType: "delivery_exception",
    metadata: {
      exception_number: exception.exception_number,
    },
    moduleKey: "delivery_exceptions",
    sourceId: exception.id,
    sourceTable: "delivery_exceptions",
    summary: `Started investigation for ${exception.exception_number}`,
  }).catch(() => null);

  revalidatePath(DELIVERY_EXCEPTION_ROUTE);
  redirect(`${DELIVERY_EXCEPTION_ROUTE}?updated=investigating`);
}

export async function resolveDeliveryExceptionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = resolveDeliveryExceptionSchema.safeParse({
    exception_id: field(formData, "exception_id"),
    performance_rating: field(formData, "performance_rating") || "",
    resolution_summary: field(formData, "resolution_summary"),
  });

  if (!parsed.success) {
    deliveryExceptionError(parsed.error.issues[0]?.message ?? "Check the resolution details.");
  }

  const exception = await fetchDeliveryExceptionForMutation(parsed.data.exception_id);

  if (!exception) {
    deliveryExceptionError("Delivery exception was not found.");
  }

  if (!canResolveOpsDeliveryException(profile.role, exception)) {
    deliveryExceptionError("Your role cannot resolve this delivery exception.");
  }

  const rating = normalizeRating(parsed.data.performance_rating);
  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  let performanceEventId: string | null = null;

  if (rating) {
    const { data: performanceEvent, error: performanceError } = await supabase
      .from("supplier_performance_events")
      .insert({
        created_by: profile.id,
        description: parsed.data.resolution_summary,
        event_date: now.slice(0, 10),
        event_type: "delivery",
        rating,
        site_id: exception.site_id,
        source_id: exception.id,
        source_table: "delivery_exceptions",
        supplier_id: exception.supplier_id,
        title: `Delivery exception ${exception.exception_number}`,
      })
      .select("id")
      .single<{ id: string }>();

    if (performanceError || !performanceEvent) {
      deliveryExceptionError(
        performanceError?.message ?? "Could not create supplier performance event.",
      );
    }

    performanceEventId = performanceEvent.id;
  }

  const { error } = await supabase
    .from("delivery_exceptions")
    .update({
      resolution_summary: parsed.data.resolution_summary,
      resolved_at: now,
      resolved_by: profile.id,
      status: "resolved",
      supplier_performance_event_id: performanceEventId,
    })
    .eq("id", exception.id)
    .in("status", ["open", "investigating"]);

  if (error) {
    if (performanceEventId) {
      await supabase.from("supplier_performance_events").delete().eq("id", performanceEventId);
    }

    deliveryExceptionError(error.message);
  }

  await recordOpsAuditEvent({
    action: "delivery_exception.resolved",
    actorUserId: profile.id,
    entityId: exception.id,
    entityType: "delivery_exception",
    metadata: {
      exception_number: exception.exception_number,
      supplier_performance_event_id: performanceEventId,
      supplier_rating: rating,
    },
    moduleKey: "delivery_exceptions",
    sourceId: exception.id,
    sourceTable: "delivery_exceptions",
    summary: `Resolved delivery exception ${exception.exception_number}`,
  }).catch(() => null);

  revalidatePath(DELIVERY_EXCEPTION_ROUTE);
  revalidatePath("/ops/suppliers");
  redirect(`${DELIVERY_EXCEPTION_ROUTE}?updated=resolved`);
}

export async function closeDeliveryExceptionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = exceptionIdSchema.safeParse({
    exception_id: field(formData, "exception_id"),
  });

  if (!parsed.success) {
    deliveryExceptionError(parsed.error.issues[0]?.message ?? "Select a delivery exception.");
  }

  const exception = await fetchDeliveryExceptionForMutation(parsed.data.exception_id);

  if (!exception) {
    deliveryExceptionError("Delivery exception was not found.");
  }

  if (!canCloseOpsDeliveryException(profile.role, exception)) {
    deliveryExceptionError("Your role cannot close this delivery exception.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("delivery_exceptions")
    .update({ closed_at: now, closed_by: profile.id, status: "closed" })
    .eq("id", exception.id)
    .eq("status", "resolved");

  if (error) {
    deliveryExceptionError(error.message);
  }

  await recordOpsAuditEvent({
    action: "delivery_exception.closed",
    actorUserId: profile.id,
    entityId: exception.id,
    entityType: "delivery_exception",
    metadata: {
      exception_number: exception.exception_number,
    },
    moduleKey: "delivery_exceptions",
    sourceId: exception.id,
    sourceTable: "delivery_exceptions",
    summary: `Closed delivery exception ${exception.exception_number}`,
  }).catch(() => null);

  revalidatePath(DELIVERY_EXCEPTION_ROUTE);
  redirect(`${DELIVERY_EXCEPTION_ROUTE}?updated=closed`);
}

export async function cancelDeliveryExceptionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = exceptionIdSchema.safeParse({
    exception_id: field(formData, "exception_id"),
  });

  if (!parsed.success) {
    deliveryExceptionError(parsed.error.issues[0]?.message ?? "Select a delivery exception.");
  }

  const exception = await fetchDeliveryExceptionForMutation(parsed.data.exception_id);

  if (!exception) {
    deliveryExceptionError("Delivery exception was not found.");
  }

  if (!canCancelOpsDeliveryException(profile.role, exception)) {
    deliveryExceptionError("Your role cannot cancel this delivery exception.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("delivery_exceptions")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", exception.id)
    .in("status", ["open", "investigating"]);

  if (error) {
    deliveryExceptionError(error.message);
  }

  await recordOpsAuditEvent({
    action: "delivery_exception.cancelled",
    actorUserId: profile.id,
    entityId: exception.id,
    entityType: "delivery_exception",
    metadata: {
      exception_number: exception.exception_number,
    },
    moduleKey: "delivery_exceptions",
    sourceId: exception.id,
    sourceTable: "delivery_exceptions",
    summary: `Cancelled delivery exception ${exception.exception_number}`,
  }).catch(() => null);

  revalidatePath(DELIVERY_EXCEPTION_ROUTE);
  redirect(`${DELIVERY_EXCEPTION_ROUTE}?updated=cancelled`);
}
