"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { notifyOpsWorkflowEvent } from "@/lib/ops/workflow-notifications";
import {
  canArchiveInvoice,
  canCreateInvoice,
  canDeleteInvoice,
  canEditInvoice,
  canMarkInvoicePaid,
  canSendInvoice,
  canVoidInvoice,
  type OpsInvoiceMutationTarget,
} from "@/lib/ops/invoice-permissions";
import { postInvoiceJournalSafe, reverseOpsJournalSafe } from "@/lib/ops/gl-posting";
import type { OrganizationProfile } from "@/lib/ops/organization";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createInvoiceSchema = z.object({
  boq_id: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .pipe(z.string().uuid().nullable()),
  client_name: z.string().trim().min(2, "Client name is required.").max(160),
  customer_id: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .pipe(z.string().uuid().nullable()),
  invoice_number: z.string().trim().max(80).optional(),
  issued_at: dateSchema,
  site_id: z.string().uuid("Select a Pymble site."),
  subtotal: z.coerce.number().min(0, "Subtotal cannot be negative."),
  tpin: z.string().trim().max(80).default(""),
});

const invoiceIdSchema = z.object({
  id: z.string().uuid("Select an invoice."),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function invoiceError(message: string): never {
  redirect(`/ops/invoices?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Allocates the next invoice number atomically via the
 * `public.ops_next_invoice_number(prefix)` Postgres function. Numbers are
 * monotonic and gap-free per (prefix, year). Per ZRA requirements, a consumed
 * number that ends up cancelled or voided must remain on file — the function
 * does NOT recycle gaps.
 */
async function nextInvoiceNumber(prefix: string) {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase.rpc("ops_next_invoice_number", {
    p_prefix: prefix,
  });

  if (error) {
    throw error;
  }

  if (typeof data !== "string" || data.length === 0) {
    throw new Error("Invoice number generator returned an empty value.");
  }

  return data;
}

export async function createInvoiceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateInvoice(profile.role)) {
    invoiceError(
      "Only the Quantity Surveyor, Finance Manager, Accountant, and leadership can create invoices.",
    );
  }

  const parsed = createInvoiceSchema.safeParse({
    boq_id: field(formData, "boq_id"),
    client_name: field(formData, "client_name"),
    customer_id: field(formData, "customer_id"),
    invoice_number: field(formData, "invoice_number"),
    issued_at: field(formData, "issued_at"),
    site_id: field(formData, "site_id"),
    subtotal: field(formData, "subtotal"),
    tpin: field(formData, "tpin"),
  });

  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Check the invoice details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data: organization, error: organizationError } = await supabase
    .from("organization_profile")
    .select("invoice_prefix, vat_rate")
    .eq("id", 1)
    .single<Pick<OrganizationProfile, "invoice_prefix" | "vat_rate">>();

  if (organizationError || !organization) {
    invoiceError(organizationError?.message ?? "Pymble organization profile was not found.");
  }

  const invoiceNumber =
    parsed.data.invoice_number && parsed.data.invoice_number.length > 0
      ? parsed.data.invoice_number
      : await nextInvoiceNumber(organization.invoice_prefix);
  const vatAmount = roundToTwo(parsed.data.subtotal * Number(organization.vat_rate));
  const totalAmount = roundToTwo(parsed.data.subtotal + vatAmount);

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      boq_id: parsed.data.boq_id,
      client_name: parsed.data.client_name,
      created_by: profile.id,
      customer_id: parsed.data.customer_id,
      invoice_number: invoiceNumber,
      issued_at: parsed.data.issued_at,
      site_id: parsed.data.site_id,
      status: "draft",
      subtotal: roundToTwo(parsed.data.subtotal),
      total_amount: totalAmount,
      tpin: parsed.data.tpin || null,
      vat_amount: vatAmount,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    invoiceError(
      error
        ? error.code === "23505"
          ? "That invoice number already exists."
          : error.message
        : "The invoice could not be created.",
    );
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "invoice.created",
    entity_type: "invoice",
    entity_id: data.id,
    module_key: "invoices",
    source_table: "invoices",
    source_id: data.id,
    metadata: {
      invoice_number: invoiceNumber,
      total_amount: totalAmount,
    },
  });

  revalidatePath("/ops");
  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?created=invoice");
}

async function fetchInvoiceMutationTarget(
  invoiceId: string,
): Promise<(OpsInvoiceMutationTarget & { id: string; invoice_number: string }) | null> {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, cancelled_at, archived_at, deleted_at")
    .eq("id", invoiceId)
    .maybeSingle<OpsInvoiceMutationTarget & { id: string; invoice_number: string }>();
  if (error) {
    throw error;
  }
  return data;
}

async function updateInvoiceStatus(id: string, status: "paid" | "sent", userId: string) {
  const supabase = await createOpsServerSessionClient();
  const timestampColumn = status === "sent" ? "sent_at" : "paid_at";
  const { data, error } = await supabase
    .from("invoices")
    .update({
      [timestampColumn]: new Date().toISOString(),
      status,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    invoiceError(error?.message ?? "Invoice status could not be updated.");
  }

  await supabase.from("audit_events").insert({
    actor_user_id: userId,
    action: `invoice.${status}`,
    entity_type: "invoice",
    entity_id: data.id,
  });

  // Post the matching GL journal (revenue recognition on send, cash receipt on
  // paid). Best-effort + idempotent — never blocks the status change.
  await postInvoiceJournalSafe(data.id, status === "sent" ? "issued" : "paid", userId);

  await notifyOpsWorkflowEvent({
    actorId: userId,
    actionNeededRoles: ["finance_manager", "accountant"],
    title: `Invoice ${status}`,
    body: `An invoice was marked ${status} and the matching ledger journal was posted.`,
    actionHref: "/ops/invoices",
    moduleKey: "invoices",
    sourceTable: "invoices",
    sourceId: data.id,
    eventKey: status,
    category: "info",
  });
}

export async function sendInvoiceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = invoiceIdSchema.safeParse({ id: field(formData, "id") });

  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Select an invoice.");
  }

  const invoice = await fetchInvoiceMutationTarget(parsed.data.id);
  if (!invoice) {
    invoiceError("Invoice was not found.");
  }
  if (!canSendInvoice(profile.role, invoice)) {
    invoiceError("Only Finance and leadership can send a draft invoice.");
  }

  await updateInvoiceStatus(parsed.data.id, "sent", profile.id);

  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?updated=sent");
}

export async function markInvoicePaidAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = invoiceIdSchema.safeParse({ id: field(formData, "id") });

  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Select an invoice.");
  }

  const invoice = await fetchInvoiceMutationTarget(parsed.data.id);
  if (!invoice) {
    invoiceError("Invoice was not found.");
  }
  if (!canMarkInvoicePaid(profile.role, invoice)) {
    invoiceError("Only Finance and leadership can mark an invoice paid, and only once it has been sent.");
  }

  await updateInvoiceStatus(parsed.data.id, "paid", profile.id);
  revalidatePath("/ops");
  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?updated=paid");
}

// ---------------------------------------------------------------------------
// J1: Edit / void / archive / delete actions for invoices
// ---------------------------------------------------------------------------

const updateInvoiceSchema = invoiceIdSchema.extend({
  client_name: z.string().trim().min(2, "Client name is required.").max(160),
  invoice_number: z.string().trim().min(1, "Invoice number is required.").max(80),
  issued_at: dateSchema,
  subtotal: z.coerce.number().min(0, "Subtotal cannot be negative."),
  tpin: z.string().trim().max(80).default(""),
});

const voidInvoiceSchema = invoiceIdSchema.extend({
  reason: z.string().trim().max(400).default(""),
});

export async function updateInvoiceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = updateInvoiceSchema.safeParse({
    id: field(formData, "id"),
    client_name: field(formData, "client_name"),
    invoice_number: field(formData, "invoice_number"),
    issued_at: field(formData, "issued_at"),
    subtotal: field(formData, "subtotal"),
    tpin: field(formData, "tpin"),
  });
  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Check the invoice details.");
  }

  const invoice = await fetchInvoiceMutationTarget(parsed.data.id);
  if (!invoice) {
    invoiceError("Invoice was not found.");
  }
  if (!canEditInvoice(profile.role, invoice)) {
    invoiceError("Invoices can only be edited while in draft.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data: organization } = await supabase
    .from("organization_profile")
    .select("vat_rate")
    .eq("id", 1)
    .maybeSingle<{ vat_rate: number | string }>();

  const vatRate = Number(organization?.vat_rate ?? 0);
  const vatAmount = roundToTwo(parsed.data.subtotal * vatRate);
  const totalAmount = roundToTwo(parsed.data.subtotal + vatAmount);

  const { error } = await supabase
    .from("invoices")
    .update({
      client_name: parsed.data.client_name,
      invoice_number: parsed.data.invoice_number,
      issued_at: parsed.data.issued_at,
      subtotal: roundToTwo(parsed.data.subtotal),
      vat_amount: vatAmount,
      total_amount: totalAmount,
      tpin: parsed.data.tpin || null,
    })
    .eq("id", parsed.data.id);
  if (error) {
    invoiceError(error.code === "23505" ? "That invoice number already exists." : error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "invoice.updated",
    entity_type: "invoice",
    entity_id: parsed.data.id,
    module_key: "invoices",
    source_table: "invoices",
    source_id: parsed.data.id,
    metadata: { invoice_number: parsed.data.invoice_number, total_amount: totalAmount },
  });

  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?updated=invoice");
}

export async function voidInvoiceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = voidInvoiceSchema.safeParse({
    id: field(formData, "id"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Select an invoice.");
  }

  const invoice = await fetchInvoiceMutationTarget(parsed.data.id);
  if (!invoice) {
    invoiceError("Invoice was not found.");
  }
  if (!canVoidInvoice(profile.role, invoice)) {
    invoiceError(
      "Only Finance Manager, Managing Director, or Developer can void an invoice, and a paid invoice can't be voided (issue a credit note instead).",
    );
  }

  const supabase = await createOpsServerSessionClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("invoices")
    .update({ cancelled_at: nowIso, cancelled_by: profile.id })
    .eq("id", parsed.data.id);
  if (error) {
    invoiceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "invoice.voided",
    entity_type: "invoice",
    entity_id: parsed.data.id,
    module_key: "invoices",
    source_table: "invoices",
    source_id: parsed.data.id,
    metadata: { reason: parsed.data.reason, invoice_number: invoice.invoice_number },
  });

  // A sent invoice already posted a revenue/AR accrual — unwind it. A no-op if
  // the invoice was still draft (nothing was ever posted) or already reversed.
  await reverseOpsJournalSafe("invoices", parsed.data.id, "invoice_issued", profile.id);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["finance_manager", "accountant"],
    title: "Invoice voided",
    body: `${profile.full_name} voided an invoice. Review the receivables position.`,
    actionHref: "/ops/invoices",
    moduleKey: "invoices",
    sourceTable: "invoices",
    sourceId: parsed.data.id,
    eventKey: "voided",
    category: "info",
  });

  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?updated=voided");
}

export async function archiveInvoiceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = invoiceIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Select an invoice.");
  }

  const invoice = await fetchInvoiceMutationTarget(parsed.data.id);
  if (!invoice) {
    invoiceError("Invoice was not found.");
  }
  if (!canArchiveInvoice(profile.role, invoice)) {
    invoiceError(
      "Invoices can only be archived once paid or voided, and only by Managing Director or Developer.",
    );
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("invoices")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.id);
  if (error) {
    invoiceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "invoice.archived",
    entity_type: "invoice",
    entity_id: parsed.data.id,
    module_key: "invoices",
    source_table: "invoices",
    source_id: parsed.data.id,
  });

  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?updated=archived");
}

export async function deleteInvoiceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canDeleteInvoice(profile.role)) {
    invoiceError("Only the Developer can permanently delete an invoice.");
  }

  const parsed = invoiceIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Select an invoice.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id);
  if (error) {
    invoiceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "invoice.deleted",
    entity_type: "invoice",
    entity_id: parsed.data.id,
    module_key: "invoices",
    source_table: "invoices",
    source_id: parsed.data.id,
  });

  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?updated=deleted");
}
