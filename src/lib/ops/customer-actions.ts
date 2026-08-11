"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canArchiveOpsCustomer,
  canCreateOpsCustomer,
  canEditOpsCustomer,
  canReactivateOpsCustomer,
} from "@/lib/ops/customer-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsCustomerStatus } from "@/lib/ops/types";

const CUSTOMER_ROUTE = "/ops/customers";

const optionalEmailSchema = z
  .string()
  .trim()
  .max(160)
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    message: "Use a valid email address.",
  });

const customerSchema = z.object({
  address_line: z.string().trim().max(240).default(""),
  city: z.string().trim().max(80).default(""),
  country: z.string().trim().max(80).default("Zambia"),
  email: optionalEmailSchema.default(""),
  legal_name: z.string().trim().min(2, "Customer legal name is required.").max(180),
  notes: z.string().trim().max(800).default(""),
  // What "overdue" means for this customer. A council on 60 days and a private
  // client on 14 are not the same debt at day 30, and ageing cannot say so
  // without this.
  payment_terms_days: z.coerce
    .number()
    .int("Payment terms must be a whole number of days.")
    .min(0, "Payment terms cannot be negative.")
    .max(365, "Payment terms cannot exceed a year.")
    .default(30),
  phone: z.string().trim().max(60).default(""),
  tpin: z.string().trim().max(60).default(""),
  trading_name: z.string().trim().max(180).default(""),
});

const customerIdSchema = z.object({
  customer_id: z.string().uuid("Select a customer."),
});

type CustomerForMutation = {
  customer_code: string;
  id: string;
  legal_name: string;
  status: OpsCustomerStatus;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function customerError(message: string): never {
  redirect(`${CUSTOMER_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

async function fetchCustomerForMutation(customerId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_code, legal_name, status")
    .eq("id", customerId)
    .maybeSingle<CustomerForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createCustomerAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCustomer(profile.role)) {
    customerError("Your role cannot create customers.");
  }

  const parsed = customerSchema.safeParse({
    address_line: field(formData, "address_line"),
    city: field(formData, "city"),
    country: field(formData, "country") || "Zambia",
    email: field(formData, "email"),
    legal_name: field(formData, "legal_name"),
    notes: field(formData, "notes"),
    payment_terms_days: field(formData, "payment_terms_days") || "30",
    phone: field(formData, "phone"),
    tpin: field(formData, "tpin"),
    trading_name: field(formData, "trading_name"),
  });

  if (!parsed.success) {
    customerError(parsed.error.issues[0]?.message ?? "Check the customer details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      address_line: parsed.data.address_line,
      city: parsed.data.city,
      country: parsed.data.country || "Zambia",
      created_by: profile.id,
      email: parsed.data.email,
      legal_name: parsed.data.legal_name,
      notes: parsed.data.notes,
      payment_terms_days: parsed.data.payment_terms_days,
      phone: parsed.data.phone,
      tpin: parsed.data.tpin,
      trading_name: parsed.data.trading_name,
    })
    .select("id, customer_code")
    .single<{ customer_code: string; id: string }>();

  if (error || !customer) {
    customerError(error?.message ?? "Could not create customer.");
  }

  await recordOpsAuditEvent({
    action: "customer.created",
    actorUserId: profile.id,
    entityId: customer.id,
    entityType: "customer",
    metadata: { customer_code: customer.customer_code, legal_name: parsed.data.legal_name },
    moduleKey: "customers",
    sourceId: customer.id,
    sourceTable: "customers",
    summary: `Created customer ${customer.customer_code}: ${parsed.data.legal_name}`,
  }).catch(() => null);

  revalidatePath(CUSTOMER_ROUTE);
  redirect(`${CUSTOMER_ROUTE}?created=customer`);
}

/**
 * Editing a customer.
 *
 * Added with payment terms (R3). Without it the two customers recovered from
 * the quotation register would be stuck on the default 30 days forever, and a
 * terms field nobody can change is not a feature — it is a wrong number with a
 * label on it.
 */
export async function updateCustomerAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const idParsed = customerIdSchema.safeParse({
    customer_id: field(formData, "customer_id"),
  });

  if (!idParsed.success) {
    customerError(idParsed.error.issues[0]?.message ?? "Select a customer.");
  }

  const customer = await fetchCustomerForMutation(idParsed.data.customer_id);

  if (!customer) {
    customerError("Customer was not found.");
  }

  if (!canEditOpsCustomer(profile.role, customer)) {
    customerError("Your role cannot edit this customer.");
  }

  const parsed = customerSchema.safeParse({
    address_line: field(formData, "address_line"),
    city: field(formData, "city"),
    country: field(formData, "country") || "Zambia",
    email: field(formData, "email"),
    legal_name: field(formData, "legal_name"),
    notes: field(formData, "notes"),
    payment_terms_days: field(formData, "payment_terms_days") || "30",
    phone: field(formData, "phone"),
    tpin: field(formData, "tpin"),
    trading_name: field(formData, "trading_name"),
  });

  if (!parsed.success) {
    customerError(parsed.error.issues[0]?.message ?? "Check the customer details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("customers")
    .update({
      address_line: parsed.data.address_line,
      city: parsed.data.city,
      country: parsed.data.country || "Zambia",
      email: parsed.data.email,
      legal_name: parsed.data.legal_name,
      notes: parsed.data.notes,
      payment_terms_days: parsed.data.payment_terms_days,
      phone: parsed.data.phone,
      tpin: parsed.data.tpin,
      trading_name: parsed.data.trading_name,
    })
    .eq("id", customer.id);

  if (error) {
    customerError(error.message);
  }

  await recordOpsAuditEvent({
    action: "customer.updated",
    actorUserId: profile.id,
    entityId: customer.id,
    entityType: "customer",
    metadata: {
      customer_code: customer.customer_code,
      legal_name: parsed.data.legal_name,
      // Recorded because it changes the due date every future invoice for
      // this customer gets, and with it when their debt starts counting as
      // overdue. Invoices already issued keep their printed due date.
      payment_terms_days: parsed.data.payment_terms_days,
    },
    moduleKey: "customers",
    sourceId: customer.id,
    sourceTable: "customers",
    summary: `Updated customer ${customer.customer_code}: ${parsed.data.legal_name}`,
  }).catch(() => null);

  revalidatePath(CUSTOMER_ROUTE);
  redirect(`${CUSTOMER_ROUTE}?updated=customer`);
}

export async function archiveCustomerAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = customerIdSchema.safeParse({ customer_id: field(formData, "customer_id") });

  if (!parsed.success) {
    customerError(parsed.error.issues[0]?.message ?? "Select a customer.");
  }

  if (field(formData, "confirm") !== "archive") {
    customerError("Confirm the customer archive action.");
  }

  const customer = await fetchCustomerForMutation(parsed.data.customer_id);

  if (!customer) {
    customerError("Customer was not found.");
  }

  if (!canArchiveOpsCustomer(profile.role, customer)) {
    customerError("Your role cannot archive this customer.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("customers")
    .update({ archived_at: now, archived_by: profile.id, status: "archived" })
    .eq("id", customer.id)
    .neq("status", "archived");

  if (error) {
    customerError(error.message);
  }

  await recordOpsAuditEvent({
    action: "customer.archived",
    actorUserId: profile.id,
    entityId: customer.id,
    entityType: "customer",
    metadata: { archived_at: now, customer_code: customer.customer_code },
    moduleKey: "customers",
    sourceId: customer.id,
    sourceTable: "customers",
    summary: `Archived customer ${customer.customer_code}: ${customer.legal_name}`,
  }).catch(() => null);

  revalidatePath(CUSTOMER_ROUTE);
  redirect(`${CUSTOMER_ROUTE}?updated=archived`);
}

export async function reactivateCustomerAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = customerIdSchema.safeParse({ customer_id: field(formData, "customer_id") });

  if (!parsed.success) {
    customerError(parsed.error.issues[0]?.message ?? "Select a customer.");
  }

  const customer = await fetchCustomerForMutation(parsed.data.customer_id);

  if (!customer) {
    customerError("Customer was not found.");
  }

  if (!canReactivateOpsCustomer(profile.role, customer)) {
    customerError("This customer is not archived, or your role cannot reactivate it.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("customers")
    .update({ archived_at: null, archived_by: null, status: "active" })
    .eq("id", customer.id)
    .eq("status", "archived");

  if (error) {
    customerError(error.message);
  }

  await recordOpsAuditEvent({
    action: "customer.reactivated",
    actorUserId: profile.id,
    entityId: customer.id,
    entityType: "customer",
    metadata: { customer_code: customer.customer_code },
    moduleKey: "customers",
    sourceId: customer.id,
    sourceTable: "customers",
    summary: `Reactivated customer ${customer.customer_code}: ${customer.legal_name}`,
  }).catch(() => null);

  revalidatePath(CUSTOMER_ROUTE);
  redirect(`${CUSTOMER_ROUTE}?updated=reactivated`);
}
