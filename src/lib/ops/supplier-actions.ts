"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canArchiveOpsSupplier,
  canCreateOpsSupplier,
  canCreateOpsSupplierPerformanceEvent,
  canUpdateOpsSupplierStatus,
} from "@/lib/ops/supplier-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsSupplierPerformanceEventType, OpsSupplierStatus } from "@/lib/ops/types";

const SUPPLIER_ROUTE = "/ops/suppliers";

const optionalEmailSchema = z
  .string()
  .trim()
  .max(160)
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    message: "Use a valid email address.",
  });

const supplierSchema = z.object({
  address_line: z.string().trim().max(240).default(""),
  category: z.string().trim().max(80).default("general"),
  kind: z.enum(["vendor", "subcontractor", "both"]).default("vendor"),
  city: z.string().trim().max(80).default(""),
  contact_email: optionalEmailSchema.default(""),
  contact_full_name: z.string().trim().max(120).default(""),
  contact_phone: z.string().trim().max(60).default(""),
  contact_role: z.string().trim().max(100).default(""),
  country: z.string().trim().max(80).default("Zambia"),
  email: optionalEmailSchema.default(""),
  legal_name: z.string().trim().min(2, "Supplier legal name is required.").max(180),
  notes: z.string().trim().max(800).default(""),
  phone: z.string().trim().max(60).default(""),
  rating: z.coerce.number().int().min(1).max(5).optional().or(z.literal("")),
  tpin: z.string().trim().max(60).default(""),
  trading_name: z.string().trim().max(180).default(""),
});

const supplierIdSchema = z.object({
  supplier_id: z.string().uuid("Select a supplier."),
});

const contactSchema = supplierIdSchema.extend({
  email: optionalEmailSchema.default(""),
  full_name: z.string().trim().min(2, "Contact name is required.").max(120),
  is_primary: z.boolean().default(false),
  phone: z.string().trim().max(60).default(""),
  role_title: z.string().trim().max(100).default(""),
});

const statusSchema = supplierIdSchema.extend({
  status: z.enum(["active", "on_hold"]),
});

const supplierPerformanceEventTypes = [
  "delivery",
  "quality",
  "commercial",
  "safety",
  "communication",
  "compliance",
  "general",
] as const satisfies readonly OpsSupplierPerformanceEventType[];

const performanceEventSchema = supplierIdSchema.extend({
  description: z.string().trim().max(800).default(""),
  event_date: z.string().trim().default(""),
  event_type: z.enum(supplierPerformanceEventTypes),
  rating: z.coerce.number().int().min(1, "Select a rating.").max(5, "Select a rating."),
  site_id: z.string().trim().default(""),
  title: z.string().trim().min(2, "Performance event title is required.").max(160),
});

type SupplierForMutation = {
  id: string;
  legal_name: string;
  status: OpsSupplierStatus;
  supplier_code: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function supplierError(message: string): never {
  redirect(`${SUPPLIER_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeSupplierCategory(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return normalized || "general";
}

function normalizeRating(value: number | "" | undefined) {
  return value === "" || value === undefined ? null : value;
}

function normalizeDateInput(value: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    supplierError("Use a valid event date.");
  }

  return value;
}

function contactInputWasStarted(input: {
  contact_email: string;
  contact_full_name: string;
  contact_phone: string;
  contact_role: string;
}) {
  return Boolean(
    input.contact_email || input.contact_full_name || input.contact_phone || input.contact_role,
  );
}

async function fetchSupplierForMutation(supplierId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_code, legal_name, status")
    .eq("id", supplierId)
    .maybeSingle<SupplierForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function assertActiveSite(siteId: string) {
  if (!siteId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("is_active", true)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  if (!data) {
    supplierError("Select an active site or leave the site field blank.");
  }

  return data.id;
}

export async function createSupplierAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsSupplier(profile.role)) {
    supplierError("Your role cannot create suppliers.");
  }

  const parsed = supplierSchema.safeParse({
    address_line: field(formData, "address_line"),
    category: field(formData, "category") || "general",
    city: field(formData, "city"),
    contact_email: field(formData, "contact_email"),
    contact_full_name: field(formData, "contact_full_name"),
    contact_phone: field(formData, "contact_phone"),
    contact_role: field(formData, "contact_role"),
    country: field(formData, "country") || "Zambia",
    email: field(formData, "email"),
    kind: field(formData, "kind") || "vendor",
    legal_name: field(formData, "legal_name"),
    notes: field(formData, "notes"),
    phone: field(formData, "phone"),
    rating: field(formData, "rating") || "",
    tpin: field(formData, "tpin"),
    trading_name: field(formData, "trading_name"),
  });

  if (!parsed.success) {
    supplierError(parsed.error.issues[0]?.message ?? "Check the supplier details.");
  }

  if (contactInputWasStarted(parsed.data) && !parsed.data.contact_full_name) {
    supplierError("Add a contact name or leave the contact fields blank.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: supplier, error: supplierInsertError } = await supabase
    .from("suppliers")
    .insert({
      address_line: parsed.data.address_line,
      category: normalizeSupplierCategory(parsed.data.category),
      city: parsed.data.city,
      country: parsed.data.country || "Zambia",
      created_by: profile.id,
      email: parsed.data.email,
      kind: parsed.data.kind,
      legal_name: parsed.data.legal_name,
      notes: parsed.data.notes,
      phone: parsed.data.phone,
      rating: normalizeRating(parsed.data.rating),
      status: "active",
      tpin: parsed.data.tpin,
      trading_name: parsed.data.trading_name,
    })
    .select("id, supplier_code")
    .single<{ id: string; supplier_code: string }>();

  if (supplierInsertError || !supplier) {
    supplierError(supplierInsertError?.message ?? "Could not create supplier.");
  }

  if (parsed.data.contact_full_name) {
    const { error: contactError } = await supabase.from("supplier_contacts").insert({
      created_by: profile.id,
      email: parsed.data.contact_email,
      full_name: parsed.data.contact_full_name,
      is_primary: true,
      phone: parsed.data.contact_phone,
      role_title: parsed.data.contact_role,
      supplier_id: supplier.id,
    });

    if (contactError) {
      await (async () => {
        await supabase.from("suppliers").delete().eq("id", supplier.id);
      })().catch(() => null);
      supplierError(contactError.message);
    }
  }

  await recordOpsAuditEvent({
    action: "supplier.created",
    actorUserId: profile.id,
    entityId: supplier.id,
    entityType: "supplier",
    metadata: {
      category: normalizeSupplierCategory(parsed.data.category),
      supplier_code: supplier.supplier_code,
    },
    moduleKey: "suppliers",
    sourceId: supplier.id,
    sourceTable: "suppliers",
    summary: `Created supplier ${supplier.supplier_code}: ${parsed.data.legal_name}`,
  }).catch(() => null);

  revalidatePath(SUPPLIER_ROUTE);
  redirect(`${SUPPLIER_ROUTE}?created=supplier`);
}

export async function addSupplierContactAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsSupplier(profile.role)) {
    supplierError("Your role cannot add supplier contacts.");
  }

  const parsed = contactSchema.safeParse({
    email: field(formData, "email"),
    full_name: field(formData, "full_name"),
    is_primary: field(formData, "is_primary") === "on",
    phone: field(formData, "phone"),
    role_title: field(formData, "role_title"),
    supplier_id: field(formData, "supplier_id"),
  });

  if (!parsed.success) {
    supplierError(parsed.error.issues[0]?.message ?? "Check the supplier contact.");
  }

  const supplier = await fetchSupplierForMutation(parsed.data.supplier_id);

  if (!supplier || supplier.status === "archived") {
    supplierError("Supplier was not found or is archived.");
  }

  const supabase = getOpsSupabaseServiceClient();

  if (parsed.data.is_primary) {
    const { error: primaryResetError } = await supabase
      .from("supplier_contacts")
      .update({ is_primary: false })
      .eq("supplier_id", supplier.id);

    if (primaryResetError) {
      supplierError(primaryResetError.message);
    }
  }

  const { error } = await supabase.from("supplier_contacts").insert({
    created_by: profile.id,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    is_primary: parsed.data.is_primary,
    phone: parsed.data.phone,
    role_title: parsed.data.role_title,
    supplier_id: supplier.id,
  });

  if (error) {
    supplierError(error.message);
  }

  await recordOpsAuditEvent({
    action: "supplier.contact_added",
    actorUserId: profile.id,
    entityId: supplier.id,
    entityType: "supplier",
    metadata: {
      is_primary: parsed.data.is_primary,
      supplier_code: supplier.supplier_code,
    },
    moduleKey: "suppliers",
    sourceId: supplier.id,
    sourceTable: "suppliers",
    summary: `Added contact to ${supplier.supplier_code}`,
  }).catch(() => null);

  revalidatePath(SUPPLIER_ROUTE);
  redirect(`${SUPPLIER_ROUTE}?updated=contact_added`);
}

export async function addSupplierPerformanceEventAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsSupplierPerformanceEvent(profile.role)) {
    supplierError("Your role cannot add supplier performance events.");
  }

  const parsed = performanceEventSchema.safeParse({
    description: field(formData, "description"),
    event_date: field(formData, "event_date"),
    event_type: field(formData, "event_type") || "general",
    rating: field(formData, "rating"),
    site_id: field(formData, "site_id"),
    supplier_id: field(formData, "supplier_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    supplierError(parsed.error.issues[0]?.message ?? "Check the supplier performance event.");
  }

  const supplier = await fetchSupplierForMutation(parsed.data.supplier_id);

  if (!supplier || supplier.status === "archived") {
    supplierError("Supplier was not found or is archived.");
  }

  const siteId = await assertActiveSite(parsed.data.site_id);
  const eventDate = normalizeDateInput(parsed.data.event_date);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("supplier_performance_events").insert({
    created_by: profile.id,
    description: parsed.data.description,
    event_date: eventDate,
    event_type: parsed.data.event_type,
    rating: parsed.data.rating,
    site_id: siteId,
    supplier_id: supplier.id,
    title: parsed.data.title,
  });

  if (error) {
    supplierError(error.message);
  }

  await recordOpsAuditEvent({
    action: "supplier.performance_event_added",
    actorUserId: profile.id,
    entityId: supplier.id,
    entityType: "supplier",
    metadata: {
      event_date: eventDate,
      event_type: parsed.data.event_type,
      rating: parsed.data.rating,
      site_id: siteId,
      supplier_code: supplier.supplier_code,
    },
    moduleKey: "suppliers",
    sourceId: supplier.id,
    sourceTable: "suppliers",
    summary: `Added supplier performance event for ${supplier.supplier_code}`,
  }).catch(() => null);

  revalidatePath(SUPPLIER_ROUTE);
  redirect(`${SUPPLIER_ROUTE}?updated=performance_event`);
}

export async function updateSupplierStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = statusSchema.safeParse({
    status: field(formData, "status"),
    supplier_id: field(formData, "supplier_id"),
  });

  if (!parsed.success) {
    supplierError(parsed.error.issues[0]?.message ?? "Check the supplier status.");
  }

  const supplier = await fetchSupplierForMutation(parsed.data.supplier_id);

  if (!supplier) {
    supplierError("Supplier was not found.");
  }

  if (!canUpdateOpsSupplierStatus(profile.role, supplier)) {
    supplierError("Your role cannot update this supplier status.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      archived_at: null,
      status: parsed.data.status,
    })
    .eq("id", supplier.id)
    .neq("status", "archived");

  if (error) {
    supplierError(error.message);
  }

  await recordOpsAuditEvent({
    action: "supplier.status_updated",
    actorUserId: profile.id,
    entityId: supplier.id,
    entityType: "supplier",
    metadata: {
      next_status: parsed.data.status,
      previous_status: supplier.status,
      supplier_code: supplier.supplier_code,
    },
    moduleKey: "suppliers",
    sourceId: supplier.id,
    sourceTable: "suppliers",
    summary: `Updated ${supplier.supplier_code} status to ${parsed.data.status}`,
  }).catch(() => null);

  revalidatePath(SUPPLIER_ROUTE);
  redirect(`${SUPPLIER_ROUTE}?updated=status`);
}

export async function archiveSupplierAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = supplierIdSchema.safeParse({
    supplier_id: field(formData, "supplier_id"),
  });

  if (!parsed.success) {
    supplierError(parsed.error.issues[0]?.message ?? "Select a supplier.");
  }

  if (field(formData, "confirm") !== "archive") {
    supplierError("Confirm the supplier archive action.");
  }

  const supplier = await fetchSupplierForMutation(parsed.data.supplier_id);

  if (!supplier) {
    supplierError("Supplier was not found.");
  }

  if (!canArchiveOpsSupplier(profile.role, supplier)) {
    supplierError("Your role cannot archive this supplier.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      archived_at: now,
      status: "archived",
    })
    .eq("id", supplier.id)
    .neq("status", "archived");

  if (error) {
    supplierError(error.message);
  }

  await recordOpsAuditEvent({
    action: "supplier.archived",
    actorUserId: profile.id,
    entityId: supplier.id,
    entityType: "supplier",
    metadata: {
      archived_at: now,
      supplier_code: supplier.supplier_code,
    },
    moduleKey: "suppliers",
    sourceId: supplier.id,
    sourceTable: "suppliers",
    summary: `Archived supplier ${supplier.supplier_code}: ${supplier.legal_name}`,
  }).catch(() => null);

  revalidatePath(SUPPLIER_ROUTE);
  redirect(`${SUPPLIER_ROUTE}?updated=archived`);
}
