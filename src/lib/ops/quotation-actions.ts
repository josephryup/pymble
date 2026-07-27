"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { swallowOpsError } from "@/lib/ops/log";
import {
  canArchiveOpsQuotation,
  canEditOpsQuotation,
  canManageOpsQuotations,
} from "@/lib/ops/quotation-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsQuotationStatus } from "@/lib/ops/types";

const QUOTATIONS_ROUTE = "/ops/quotations";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function quotationError(message: string): never {
  redirect(`${QUOTATIONS_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Use a valid date.",
  });

const createQuotationSchema = z.object({
  title: z.string().trim().min(2, "Give the quotation a title.").max(160),
  client_name: z.string().trim().min(2, "Client name is required.").max(160),
  client_contact: z.string().trim().max(160).default(""),
  client_email: z.string().trim().max(160).default(""),
  client_phone: z.string().trim().max(60).default(""),
  client_address: z.string().trim().max(280).default(""),
  client_tpin: z.string().trim().max(40).default(""),
  vat_rate: z.coerce.number().min(0, "VAT cannot be negative.").max(100, "VAT cannot exceed 100%."),
  valid_until: optionalDate,
  scope_summary: z.string().trim().max(2000).default(""),
  terms: z.string().trim().max(2000).default(""),
  notes: z.string().trim().max(2000).default(""),
});

const quotationIdSchema = z.object({
  quotation_id: z.string().uuid("Select a quotation."),
});

const lineSchema = quotationIdSchema.extend({
  description: z.string().trim().min(2, "Line description is required.").max(220),
  specification: z.string().trim().max(280).default(""),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative."),
  unit_rate: z.coerce.number().min(0, "Rate cannot be negative."),
});

async function fetchQuotationForMutation(id: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("quotations")
    .select("id, quotation_number, status, archived_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      quotation_number: string;
      status: OpsQuotationStatus;
      archived_at: string | null;
    }>();

  if (error) {
    throw error;
  }
  return data;
}

export async function createQuotationAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsQuotations(profile.role)) {
    quotationError("Your role cannot create quotations.");
  }

  const parsed = createQuotationSchema.safeParse({
    title: field(formData, "title"),
    client_name: field(formData, "client_name"),
    client_contact: field(formData, "client_contact"),
    client_email: field(formData, "client_email"),
    client_phone: field(formData, "client_phone"),
    client_address: field(formData, "client_address"),
    client_tpin: field(formData, "client_tpin"),
    vat_rate: field(formData, "vat_rate") || "16",
    valid_until: field(formData, "valid_until"),
    scope_summary: field(formData, "scope_summary"),
    terms: field(formData, "terms"),
    notes: field(formData, "notes"),
  });

  if (!parsed.success) {
    quotationError(parsed.error.issues[0]?.message ?? "Check the quotation details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("quotations")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id, quotation_number")
    .single<{ id: string; quotation_number: string }>();

  if (error || !data) {
    quotationError(error?.message ?? "The quotation could not be created.");
  }

  await recordOpsAuditEvent({
    action: "quotation.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "quotation",
    metadata: { client_name: parsed.data.client_name, title: parsed.data.title },
    moduleKey: "quotations",
    sourceId: data.id,
    sourceTable: "quotations",
    summary: `${profile.full_name} created quotation ${data.quotation_number}`,
  }).catch(swallowOpsError({ module: "quotations", action: "createQuotationAction" }));

  revalidatePath(QUOTATIONS_ROUTE);
  redirect(`${QUOTATIONS_ROUTE}?created=quotation#quotation-${data.id}`);
}

export async function addQuotationLineAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = lineSchema.safeParse({
    quotation_id: field(formData, "quotation_id"),
    description: field(formData, "description"),
    specification: field(formData, "specification"),
    unit: field(formData, "unit") || "each",
    quantity: field(formData, "quantity") || "1",
    unit_rate: field(formData, "unit_rate") || "0",
  });

  if (!parsed.success) {
    quotationError(parsed.error.issues[0]?.message ?? "Check the line details.");
  }

  const quotation = await fetchQuotationForMutation(parsed.data.quotation_id);
  if (!quotation) {
    quotationError("Quotation was not found.");
  }
  if (!canEditOpsQuotation(profile.role, quotation)) {
    quotationError("Lines can only be added while the quotation is a draft.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: lastLine } = await supabase
    .from("quotation_items")
    .select("line_number")
    .eq("quotation_id", quotation.id)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ line_number: number }>();

  const { quotation_id, ...line } = parsed.data;
  const { error } = await supabase.from("quotation_items").insert({
    ...line,
    quotation_id,
    line_number: (lastLine?.line_number ?? 0) + 1,
  });

  if (error) {
    quotationError(error.message);
  }

  revalidatePath(QUOTATIONS_ROUTE);
  redirect(`${QUOTATIONS_ROUTE}?updated=line#quotation-${quotation.id}`);
}

export async function deleteQuotationLineAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = z
    .object({
      quotation_id: z.string().uuid("Select a quotation."),
      line_id: z.string().uuid("Select a line."),
    })
    .safeParse({
      quotation_id: field(formData, "quotation_id"),
      line_id: field(formData, "line_id"),
    });

  if (!parsed.success) {
    quotationError(parsed.error.issues[0]?.message ?? "Select a line to remove.");
  }

  const quotation = await fetchQuotationForMutation(parsed.data.quotation_id);
  if (!quotation) {
    quotationError("Quotation was not found.");
  }
  if (!canEditOpsQuotation(profile.role, quotation)) {
    quotationError("Lines can only be removed while the quotation is a draft.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("quotation_items")
    .delete()
    .eq("id", parsed.data.line_id)
    .eq("quotation_id", quotation.id);

  if (error) {
    quotationError(error.message);
  }

  revalidatePath(QUOTATIONS_ROUTE);
  redirect(`${QUOTATIONS_ROUTE}?updated=line_removed#quotation-${quotation.id}`);
}

/**
 * Status moves. Kept as one action with an explicit allow-list rather than four
 * near-identical ones — the transition table is the whole logic.
 */
const ALLOWED_TRANSITIONS: Record<OpsQuotationStatus, OpsQuotationStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "declined", "expired"],
  accepted: [],
  declined: ["draft"],
  expired: ["draft"],
};

const TIMESTAMP_FOR_STATUS: Partial<Record<OpsQuotationStatus, string>> = {
  sent: "sent_at",
  accepted: "accepted_at",
  declined: "declined_at",
};

export async function setQuotationStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsQuotations(profile.role)) {
    quotationError("Your role cannot update quotations.");
  }

  const parsed = quotationIdSchema
    .extend({
      status: z.enum(["draft", "sent", "accepted", "declined", "expired"]),
    })
    .safeParse({
      quotation_id: field(formData, "quotation_id"),
      status: field(formData, "status"),
    });

  if (!parsed.success) {
    quotationError(parsed.error.issues[0]?.message ?? "Select a valid status.");
  }

  const quotation = await fetchQuotationForMutation(parsed.data.quotation_id);
  if (!quotation) {
    quotationError("Quotation was not found.");
  }
  if (quotation.archived_at) {
    quotationError("This quotation is archived.");
  }
  if (!ALLOWED_TRANSITIONS[quotation.status].includes(parsed.data.status)) {
    quotationError(`A ${quotation.status} quotation cannot become ${parsed.data.status}.`);
  }

  const timestampColumn = TIMESTAMP_FOR_STATUS[parsed.data.status];
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("quotations")
    .update({
      status: parsed.data.status,
      ...(timestampColumn ? { [timestampColumn]: new Date().toISOString() } : {}),
    })
    .eq("id", quotation.id)
    .eq("status", quotation.status);

  if (error) {
    quotationError(error.message);
  }

  await recordOpsAuditEvent({
    action: `quotation.${parsed.data.status}`,
    actorUserId: profile.id,
    entityId: quotation.id,
    entityType: "quotation",
    metadata: { from: quotation.status, to: parsed.data.status },
    moduleKey: "quotations",
    sourceId: quotation.id,
    sourceTable: "quotations",
    summary: `${profile.full_name} marked ${quotation.quotation_number} as ${parsed.data.status}`,
  }).catch(swallowOpsError({ module: "quotations", action: "setQuotationStatusAction" }));

  revalidatePath(QUOTATIONS_ROUTE);
  redirect(`${QUOTATIONS_ROUTE}?updated=${parsed.data.status}#quotation-${quotation.id}`);
}

export async function archiveQuotationAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveOpsQuotation(profile.role)) {
    quotationError("Only leadership can archive a quotation.");
  }

  const parsed = quotationIdSchema.safeParse({
    quotation_id: field(formData, "quotation_id"),
  });
  if (!parsed.success) {
    quotationError(parsed.error.issues[0]?.message ?? "Select a quotation.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("quotations")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.quotation_id)
    .is("archived_at", null);

  if (error) {
    quotationError(error.message);
  }

  await recordOpsAuditEvent({
    action: "quotation.archived",
    actorUserId: profile.id,
    entityId: parsed.data.quotation_id,
    entityType: "quotation",
    moduleKey: "quotations",
    sourceId: parsed.data.quotation_id,
    sourceTable: "quotations",
    summary: `${profile.full_name} archived a quotation`,
  }).catch(swallowOpsError({ module: "quotations", action: "archiveQuotationAction" }));

  revalidatePath(QUOTATIONS_ROUTE);
  redirect(`${QUOTATIONS_ROUTE}?updated=archived`);
}
