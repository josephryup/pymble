"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { canManageOps } from "@/lib/ops/permissions";
import type { OrganizationProfile } from "@/lib/ops/organization";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createInvoiceSchema = z.object({
  boq_id: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .pipe(z.string().uuid().nullable()),
  client_name: z.string().trim().min(2, "Client name is required.").max(160),
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

async function nextInvoiceNumber(prefix: string) {
  const supabase = await createOpsServerSessionClient();
  const year = new Date().getFullYear();
  const { count, error } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .gte("issued_at", `${year}-01-01`)
    .lte("issued_at", `${year}-12-31`);

  if (error) {
    throw error;
  }

  return `${prefix}-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function createInvoiceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    invoiceError("Your role cannot create invoices yet.");
  }

  const parsed = createInvoiceSchema.safeParse({
    boq_id: field(formData, "boq_id"),
    client_name: field(formData, "client_name"),
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
    metadata: {
      invoice_number: invoiceNumber,
      total_amount: totalAmount,
    },
  });

  revalidatePath("/ops");
  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?created=invoice");
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
}

export async function sendInvoiceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    invoiceError("Your role cannot send invoices yet.");
  }

  const parsed = invoiceIdSchema.safeParse({ id: field(formData, "id") });

  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Select an invoice.");
  }

  await updateInvoiceStatus(parsed.data.id, "sent", profile.id);
  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?updated=sent");
}

export async function markInvoicePaidAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    invoiceError("Your role cannot mark invoices paid yet.");
  }

  const parsed = invoiceIdSchema.safeParse({ id: field(formData, "id") });

  if (!parsed.success) {
    invoiceError(parsed.error.issues[0]?.message ?? "Select an invoice.");
  }

  await updateInvoiceStatus(parsed.data.id, "paid", profile.id);
  revalidatePath("/ops");
  revalidatePath("/ops/invoices");
  redirect("/ops/invoices?updated=paid");
}
