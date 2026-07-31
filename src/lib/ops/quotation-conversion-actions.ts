"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { canManageOpsQuotations } from "@/lib/ops/quotation-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Won quotation → project (audit D10).
 *
 * The revenue chain was severed at its origin: `quotations` carried the client
 * as free text (`client_name`, `client_tpin`) with no `customer_id` and no
 * `site_id`, and `customers` held zero rows — so `invoices.customer_id` had
 * nothing to point at. A won quotation could not become a project, a contract,
 * or a receivable, and `fetchOpsProjectPnl` reads revenue from invoices, which
 * is why every project reports revenue = 0 and margin = −cost.
 *
 * This action closes it: accepting a quotation creates (or reuses) the
 * customer, creates the project, and links all three. Idempotent — converting
 * twice returns the existing project rather than creating a second one.
 */

const QUOTATIONS_ROUTE = "/ops/quotations";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function conversionError(message: string): never {
  throw new Error(safeOpsActionErrorMessage(message));
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const schema = z.object({
  quotation_id: z.string().regex(UUID, "Select a quotation."),
  site_code: z.string().trim().min(1, "Give the project a code.").max(40),
  site_name: z.string().trim().min(2, "Give the project a name.").max(160),
  location: z.string().trim().max(200).default(""),
});

export async function convertQuotationToProjectAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsQuotations(profile.role)) {
    conversionError("Your role cannot convert a quotation into a project.");
  }

  const parsed = schema.safeParse({
    quotation_id: field(formData, "quotation_id"),
    site_code: field(formData, "site_code"),
    site_name: field(formData, "site_name"),
    location: field(formData, "location"),
  });
  if (!parsed.success) {
    conversionError(parsed.error.issues[0]?.message ?? "Check the project details.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: quotation, error: quotationError } = await supabase
    .from("quotations")
    .select(
      "id, quotation_number, title, status, client_name, client_email, client_phone, client_address, client_tpin, customer_id, site_id, currency_code",
    )
    .eq("id", parsed.data.quotation_id)
    .maybeSingle<{
      id: string;
      quotation_number: string;
      title: string;
      status: string;
      client_name: string | null;
      client_email: string | null;
      client_phone: string | null;
      client_address: string | null;
      client_tpin: string | null;
      customer_id: string | null;
      site_id: string | null;
      currency_code: string | null;
    }>();

  if (quotationError) {
    conversionError(quotationError.message);
  }
  if (!quotation) {
    conversionError("Quotation was not found.");
  }
  if (quotation.status !== "accepted") {
    conversionError(
      "Only an accepted quotation becomes a project. Mark it accepted first.",
    );
  }
  // Idempotent: a second conversion returns the project rather than duplicating it.
  if (quotation.site_id) {
    redirect(`/ops/sites/${quotation.site_id}`);
  }

  // 1. The customer. Reuse an existing record by name before creating one, so
  //    a repeat client does not accumulate duplicates that split their history.
  let customerId = quotation.customer_id;
  if (!customerId && quotation.client_name) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .ilike("legal_name", quotation.client_name)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: created, error: customerError } = await supabase
        .from("customers")
        // Every text column on customers is NOT NULL, so coalesce rather than
        // passing through nulls from the quotation's optional client fields.
        .insert({
          legal_name: quotation.client_name,
          email: quotation.client_email ?? "",
          phone: quotation.client_phone ?? "",
          address_line: quotation.client_address ?? "",
          tpin: quotation.client_tpin ?? "",
          created_by: profile.id,
        })
        .select("id")
        .single<{ id: string }>();

      if (customerError || !created) {
        conversionError(
          customerError?.message ?? "Could not create the customer record.",
        );
      }
      customerId = created.id;
    }
  }

  // 2. The project.
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .insert({
      code: parsed.data.site_code,
      name: parsed.data.site_name,
      location: parsed.data.location,
      client_name: quotation.client_name ?? "",
      customer_id: customerId,
      source_quotation_id: quotation.id,
      status: "mobilizing",
      stage: "planning",
      is_active: true,
      created_by: profile.id,
    })
    .select("id, code")
    .single<{ id: string; code: string }>();

  if (siteError || !site) {
    conversionError(
      siteError?.message ??
        "Could not create the project. The code may already be in use.",
    );
  }

  // 3. Close the loop back on the quotation.
  const { error: linkError } = await supabase
    .from("quotations")
    .update({
      site_id: site.id,
      customer_id: customerId,
      converted_at: new Date().toISOString(),
      converted_by: profile.id,
    })
    .eq("id", quotation.id);

  if (linkError) {
    conversionError(linkError.message);
  }

  await recordOpsAuditEvent({
    action: "quotation.converted_to_project",
    actorUserId: profile.id,
    entityId: quotation.id,
    entityType: "quotation",
    metadata: {
      quotation_number: quotation.quotation_number,
      site_id: site.id,
      site_code: site.code,
      customer_id: customerId,
    },
    moduleKey: "quotations",
    sourceId: quotation.id,
    sourceTable: "quotations",
    summary: `Converted ${quotation.quotation_number} into project ${site.code}`,
  }).catch(() => null);

  revalidatePath(QUOTATIONS_ROUTE);
  revalidatePath("/ops/sites");
  redirect(`/ops/sites/${site.id}`);
}
