"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { extractMentionedUserIds } from "@/lib/ops/mentions";
import { fetchOpsActiveUsers } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { canManageOps } from "@/lib/ops/permissions";
import { deleteOpsR2Object, headOpsR2Object, putOpsR2Object } from "@/lib/ops/r2";
import {
  OPS_RECORD_ACTIVITY_SOURCE_TABLES,
  validateOpsRecordCommentBody,
  type OpsRecordActivitySourceTable,
} from "@/lib/ops/record-activity";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import {
  OPS_ALLOWED_UPLOAD_TYPES,
  OPS_MAX_UPLOAD_BYTES,
  OPS_UPLOAD_KEY_PREFIXES,
  safeOpsFileName,
  validateOpsUploadFile,
} from "@/lib/ops/upload-validation";

const sourceSchema = z.object({
  source_id: z.string().uuid("Select a record."),
  source_table: z.enum(OPS_RECORD_ACTIVITY_SOURCE_TABLES),
});

const uploadAttachmentSchema = sourceSchema.extend({
  title: z.string().trim().max(160).default(""),
  visibility: z.enum(["company", "restricted", "private"]).default("restricted"),
});

const commentSchema = sourceSchema.extend({
  body: z.string(),
});

type RecordContext = {
  category: string;
  label: string;
  moduleKey: string;
  route:
    | "/ops/sites"
    | "/ops/material-schedule"
    | "/ops/invoices"
    | "/ops/material-requests"
    | "/ops/suppliers"
    | "/ops/rfq-po"
    | "/ops/stores-inventory"
    | "/ops/daily-site-reports"
    | "/ops/engineering-controls"
    | "/ops/delivery-exceptions"
    | "/ops/project-budgets"
    | "/ops/payment-requests"
    | "/ops/commercial"
    | "/ops/equipment"
    | "/ops/fleet-logistics"
    | "/ops/hse"
    | "/ops/hse-compliance"
    | "/ops/employees";
  siteId: string | null;
  sourceId: string;
  sourceTable: OpsRecordActivitySourceTable;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function fallbackError(message: string): never {
  redirect(`/ops?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function activityError(route: RecordContext["route"], message: string): never {
  redirect(`${route}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

type ResolvedUpload = {
  /**
   * Null for direct-to-R2 uploads: the server never sees those bytes, and a
   * hash the browser reported is not a checksum of anything we verified. The
   * column is display-only and nullable, so an honest null beats a claim.
   */
  checksum: string | null;
  contentType: string;
  fileName: string;
  key: string;
  size: number;
};

/**
 * Turns whatever the form sent into an object that is definitely in R2.
 *
 * Two shapes arrive here. The normal one is a `r2_key` from
 * `OpsDirectUploadField`, where the browser has already PUT the bytes straight
 * to R2 — this is the only path that works for files over ~1 MB, since a
 * Server Action body cannot exceed 4.5 MB on Vercel no matter how
 * `bodySizeLimit` is configured. The other is a small inline `document` file,
 * kept so the form still works without JavaScript.
 *
 * Nothing the browser says about a direct upload is trusted: the key must sit
 * under a prefix this server mints, and the size and type are read back off the
 * stored object rather than taken from the hidden fields next to it.
 */
async function resolveUploadedObject(
  formData: FormData,
  legacyKeyPrefix: string,
  onError: (message: string) => never,
): Promise<ResolvedUpload> {
  const claimedKey = field(formData, "r2_key");

  if (!claimedKey) {
    const upload = validateOpsUploadFile(formData.get("document"), {
      empty: "Select a document to upload.",
      tooLarge: `Attachments must be ${Math.floor(OPS_MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller.`,
      unsupportedType: "Upload a PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP file.",
    });

    if (!upload.ok) {
      onError(upload.message);
    }

    const file = upload.file;
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const safeName = safeOpsFileName(file.name || "attachment");
    const key = `${legacyKeyPrefix}/${crypto.randomUUID()}-${safeName}`;

    await putOpsR2Object({ body: fileBytes, contentType: file.type, key });

    return {
      checksum: crypto.createHash("sha256").update(fileBytes).digest("hex"),
      contentType: file.type,
      fileName: file.name || safeName,
      key,
      size: file.size,
    };
  }

  const allowedPrefixes = Object.values(OPS_UPLOAD_KEY_PREFIXES);

  if (!allowedPrefixes.some((prefix) => claimedKey.startsWith(`${prefix}/`))) {
    onError("That upload could not be verified. Try selecting the file again.");
  }

  const stored = await headOpsR2Object(claimedKey);

  if (!stored || stored.contentLength === 0) {
    onError("The upload did not finish. Select the file again.");
  }

  if (stored.contentLength > OPS_MAX_UPLOAD_BYTES) {
    await deleteOpsR2Object(claimedKey).catch(() => null);
    onError(
      `Attachments must be ${Math.floor(OPS_MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller.`,
    );
  }

  if (!OPS_ALLOWED_UPLOAD_TYPES.has(stored.contentType)) {
    await deleteOpsR2Object(claimedKey).catch(() => null);
    onError("Upload a PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP file.");
  }

  const declaredName = safeOpsFileName(field(formData, "file_name") || "attachment");

  return {
    checksum: null,
    contentType: stored.contentType,
    fileName: field(formData, "file_name") || declaredName,
    key: claimedKey,
    size: stored.contentLength,
  };
}

async function resolveRecordContext(
  sourceTable: RecordContext["sourceTable"],
  sourceId: string,
): Promise<RecordContext | null> {
  const supabase = getOpsSupabaseServiceClient();

  if (sourceTable === "sites") {
    const { data, error } = await supabase
      .from("sites")
      .select("id, code, name")
      .eq("id", sourceId)
      .eq("is_active", true)
      .maybeSingle<{ code: string; id: string; name: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "site",
          label: `${data.code} - ${data.name}`,
          moduleKey: "sites",
          route: "/ops/sites",
          siteId: data.id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "boq_documents") {
    const { data, error } = await supabase
      .from("boq_documents")
      .select("id, site_id, title")
      .eq("id", sourceId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "boq",
          label: data.title,
          moduleKey: "boq",
          route: "/ops/material-schedule",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "material_requests") {
    const { data, error } = await supabase
      .from("material_requests")
      .select("id, request_number, site_id, title")
      .eq("id", sourceId)
      .maybeSingle<{ id: string; request_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "material_request",
          label: `${data.request_number} - ${data.title}`,
          moduleKey: "material_requests",
          route: "/ops/material-requests",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "suppliers") {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, supplier_code, legal_name")
      .eq("id", sourceId)
      .neq("status", "archived")
      .maybeSingle<{ id: string; legal_name: string; supplier_code: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "supplier",
          label: `${data.supplier_code} - ${data.legal_name}`,
          moduleKey: "suppliers",
          route: "/ops/suppliers",
          siteId: null,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "rfqs") {
    const { data, error } = await supabase
      .from("rfqs")
      .select("id, rfq_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; rfq_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "rfq",
          label: `${data.rfq_number} - ${data.title}`,
          moduleKey: "rfq_po",
          route: "/ops/rfq-po",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "goods_received_notes") {
    const { data, error } = await supabase
      .from("goods_received_notes")
      .select("id, grn_number, site_id")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ grn_number: string; id: string; site_id: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "goods_received_note",
          label: data.grn_number,
          moduleKey: "stores_inventory",
          route: "/ops/stores-inventory",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "daily_site_reports") {
    const { data, error } = await supabase
      .from("daily_site_reports")
      .select("id, report_number, site_id")
      .eq("id", sourceId)
      .maybeSingle<{ id: string; report_number: string; site_id: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "daily_site_report",
          label: data.report_number,
          moduleKey: "daily_site_reports",
          route: "/ops/daily-site-reports",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "site_instructions") {
    const { data, error } = await supabase
      .from("site_instructions")
      .select("id, instruction_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; instruction_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "site_instruction",
          label: `${data.instruction_number} - ${data.title}`,
          moduleKey: "engineering_controls",
          route: "/ops/engineering-controls",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "qa_inspections") {
    const { data, error } = await supabase
      .from("qa_inspections")
      .select("id, inspection_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; inspection_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "qa_inspection",
          label: `${data.inspection_number} - ${data.title}`,
          moduleKey: "engineering_controls",
          route: "/ops/engineering-controls",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "material_tests") {
    const { data, error } = await supabase
      .from("material_tests")
      .select("id, test_number, site_id, test_type")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; site_id: string; test_number: string; test_type: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "material_test",
          label: `${data.test_number} - ${data.test_type}`,
          moduleKey: "engineering_controls",
          route: "/ops/engineering-controls",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "snag_items") {
    const { data, error } = await supabase
      .from("snag_items")
      .select("id, snag_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; site_id: string; snag_number: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "snag_item",
          label: `${data.snag_number} - ${data.title}`,
          moduleKey: "engineering_controls",
          route: "/ops/engineering-controls",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "drawing_register") {
    const { data, error } = await supabase
      .from("drawing_register")
      .select("id, drawing_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "archived")
      .maybeSingle<{ drawing_number: string; id: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "drawing_record",
          label: `${data.drawing_number} - ${data.title}`,
          moduleKey: "engineering_controls",
          route: "/ops/engineering-controls",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "programme_milestones") {
    const { data, error } = await supabase
      .from("programme_milestones")
      .select("id, milestone_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; milestone_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "programme_milestone",
          label: `${data.milestone_number} - ${data.title}`,
          moduleKey: "engineering_controls",
          route: "/ops/engineering-controls",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "delivery_exceptions") {
    const { data, error } = await supabase
      .from("delivery_exceptions")
      .select("id, exception_number, site_id")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ exception_number: string; id: string; site_id: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "delivery_exception",
          label: data.exception_number,
          moduleKey: "delivery_exceptions",
          route: "/ops/delivery-exceptions",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "project_budgets") {
    const { data, error } = await supabase
      .from("project_budgets")
      .select("id, budget_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "archived")
      .maybeSingle<{ budget_number: string; id: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "project_budget",
          label: `${data.budget_number} - ${data.title}`,
          moduleKey: "project_budgets",
          route: "/ops/project-budgets",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "payment_requests") {
    const { data, error } = await supabase
      .from("payment_requests")
      .select("id, request_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; request_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "payment_request",
          label: `${data.request_number} - ${data.title}`,
          moduleKey: "payment_requests",
          route: "/ops/payment-requests",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "equipment_requests") {
    const { data, error } = await supabase
      .from("equipment_requests")
      .select("id, request_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; request_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "equipment_request",
          label: `${data.request_number} - ${data.title}`,
          moduleKey: "equipment",
          route: "/ops/equipment",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "fuel_logs") {
    const { data, error } = await supabase
      .from("fuel_logs")
      .select("id, fuel_log_number, site_id")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ fuel_log_number: string; id: string; site_id: string | null }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "fuel_log",
          label: data.fuel_log_number,
          moduleKey: "equipment",
          route: "/ops/equipment",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "maintenance_jobs") {
    const { data, error } = await supabase
      .from("maintenance_jobs")
      .select("id, job_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; job_number: string; site_id: string | null; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "maintenance_job",
          label: `${data.job_number} - ${data.title}`,
          moduleKey: "equipment",
          route: "/ops/equipment",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "transport_requests") {
    const { data, error } = await supabase
      .from("transport_requests")
      .select("id, request_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; request_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "transport_request",
          label: `${data.request_number} - ${data.title}`,
          moduleKey: "fleet_logistics",
          route: "/ops/fleet-logistics",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "accommodation_bookings") {
    const { data, error } = await supabase
      .from("accommodation_bookings")
      .select("id, booking_number, site_id, location_name")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ booking_number: string; id: string; location_name: string; site_id: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "accommodation_booking",
          label: `${data.booking_number} - ${data.location_name}`,
          moduleKey: "fleet_logistics",
          route: "/ops/fleet-logistics",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "labour_allocations") {
    const { data, error } = await supabase
      .from("labour_allocations")
      .select("id, allocation_number, site_id, role_title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ allocation_number: string; id: string; role_title: string; site_id: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "labour_allocation",
          label: `${data.allocation_number} - ${data.role_title}`,
          moduleKey: "fleet_logistics",
          route: "/ops/fleet-logistics",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "commercial_ipcs") {
    const { data, error } = await supabase
      .from("commercial_ipcs")
      .select("id, ipc_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; ipc_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_ipc",
          label: `${data.ipc_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "commercial_variations") {
    const { data, error } = await supabase
      .from("commercial_variations")
      .select("id, variation_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; site_id: string; title: string; variation_number: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_variation",
          label: `${data.variation_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "commercial_claims") {
    const { data, error } = await supabase
      .from("commercial_claims")
      .select("id, claim_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ claim_number: string; id: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_claim",
          label: `${data.claim_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
        : null;
  }

  if (sourceTable === "commercial_contracts") {
    const { data, error } = await supabase
      .from("commercial_contracts")
      .select("id, contract_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ contract_number: string; id: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_contract",
          label: `${data.contract_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "commercial_contract_milestones") {
    const { data, error } = await supabase
      .from("commercial_contract_milestones")
      .select("id, milestone_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; milestone_number: string; site_id: string | null; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_contract_milestone",
          label: `${data.milestone_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "commercial_retention_releases") {
    const { data, error } = await supabase
      .from("commercial_retention_releases")
      .select("id, release_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; release_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_retention_release",
          label: `${data.release_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "commercial_cashflow_forecasts") {
    const { data, error } = await supabase
      .from("commercial_cashflow_forecasts")
      .select("id, forecast_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ forecast_number: string; id: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_cashflow_forecast",
          label: `${data.forecast_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "commercial_valuations") {
    const { data, error } = await supabase
      .from("commercial_valuations")
      .select("id, valuation_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; site_id: string; title: string; valuation_number: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_valuation",
          label: `${data.valuation_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "commercial_risks") {
    const { data, error } = await supabase
      .from("commercial_risks")
      .select("id, risk_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; risk_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "commercial_risk",
          label: `${data.risk_number} - ${data.title}`,
          moduleKey: "commercial",
          route: "/ops/commercial",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "hse_incidents") {
    const { data, error } = await supabase
      .from("hse_incidents")
      .select("id, incident_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; incident_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "hse_incident",
          label: `${data.incident_number} - ${data.title}`,
          moduleKey: "hse",
          route: "/ops/hse",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "ppe_items") {
    const { data, error } = await supabase
      .from("ppe_items")
      .select("id, item_code, item_name")
      .eq("id", sourceId)
      .maybeSingle<{ id: string; item_code: string; item_name: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "ppe_item",
          label: `${data.item_code} - ${data.item_name}`,
          moduleKey: "hse_compliance",
          route: "/ops/hse-compliance",
          siteId: null,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "ppe_issues") {
    const { data, error } = await supabase
      .from("ppe_issues")
      .select("id, issue_number, site_id, issued_to_name")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{
        id: string;
        issue_number: string;
        issued_to_name: string;
        site_id: string | null;
      }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "ppe_issue",
          label: `${data.issue_number} - ${data.issued_to_name}`,
          moduleKey: "hse_compliance",
          route: "/ops/hse-compliance",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "toolbox_talks") {
    const { data, error } = await supabase
      .from("toolbox_talks")
      .select("id, talk_number, site_id, topic")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; site_id: string; talk_number: string; topic: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "toolbox_talk",
          label: `${data.talk_number} - ${data.topic}`,
          moduleKey: "hse_compliance",
          route: "/ops/hse-compliance",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "hse_inspections") {
    const { data, error } = await supabase
      .from("hse_inspections")
      .select("id, inspection_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string; inspection_number: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "hse_inspection",
          label: `${data.inspection_number} - ${data.title}`,
          moduleKey: "hse_compliance",
          route: "/ops/hse-compliance",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "hse_inspection_findings") {
    const { data, error } = await supabase
      .from("hse_inspection_findings")
      .select("id, finding_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ finding_number: string; id: string; site_id: string | null; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "hse_inspection_finding",
          label: `${data.finding_number} - ${data.title}`,
          moduleKey: "hse_compliance",
          route: "/ops/hse-compliance",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "safety_training_records") {
    const { data, error } = await supabase
      .from("safety_training_records")
      .select("id, training_number, site_id, trainee_name, training_title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{
        id: string;
        site_id: string | null;
        trainee_name: string;
        training_number: string;
        training_title: string;
      }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "safety_training_record",
          label: `${data.training_number} - ${data.training_title} (${data.trainee_name})`,
          moduleKey: "hse_compliance",
          route: "/ops/hse-compliance",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "hse_risk_assessments") {
    const { data, error } = await supabase
      .from("hse_risk_assessments")
      .select("id, assessment_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ assessment_number: string; id: string; site_id: string | null; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "hse_risk_assessment",
          label: `${data.assessment_number} - ${data.title}`,
          moduleKey: "hse_compliance",
          route: "/ops/hse-compliance",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "hse_compliance_audits") {
    const { data, error } = await supabase
      .from("hse_compliance_audits")
      .select("id, audit_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ audit_number: string; id: string; site_id: string | null; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "hse_compliance_audit",
          label: `${data.audit_number} - ${data.title}`,
          moduleKey: "hse_compliance",
          route: "/ops/hse-compliance",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "corrective_actions") {
    const { data, error } = await supabase
      .from("corrective_actions")
      .select("id, action_number, site_id, title")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{ action_number: string; id: string; site_id: string; title: string }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "corrective_action",
          label: `${data.action_number} - ${data.title}`,
          moduleKey: "hse",
          route: "/ops/hse",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "employees") {
    const { data, error } = await supabase
      .from("employees")
      .select("id, employee_number, full_name, site_id")
      .eq("id", sourceId)
      .neq("status", "exited")
      .maybeSingle<{
        employee_number: string;
        full_name: string;
        id: string;
        site_id: string | null;
      }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "employee",
          label: `${data.employee_number} - ${data.full_name}`,
          moduleKey: "employees",
          route: "/ops/employees",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "leave_requests") {
    const { data, error } = await supabase
      .from("leave_requests")
      .select("id, leave_number, employee:employees!leave_requests_employee_id_fkey(site_id)")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{
        employee: { site_id: string | null } | { site_id: string | null }[] | null;
        id: string;
        leave_number: string;
      }>();

    if (error) {
      throw error;
    }

    const employee = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;

    return data
      ? {
          category: "leave_request",
          label: data.leave_number,
          moduleKey: "employees",
          route: "/ops/employees",
          siteId: employee?.site_id ?? null,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "recruitment_requisitions") {
    const { data, error } = await supabase
      .from("recruitment_requisitions")
      .select("id, requisition_number, job_title, site_id")
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{
        id: string;
        job_title: string;
        requisition_number: string;
        site_id: string | null;
      }>();

    if (error) {
      throw error;
    }

    return data
      ? {
          category: "recruitment_requisition",
          label: `${data.requisition_number} - ${data.job_title}`,
          moduleKey: "employees",
          route: "/ops/employees",
          siteId: data.site_id,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "employee_contracts") {
    const { data, error } = await supabase
      .from("employee_contracts")
      .select(
        "id, contract_number, employee:employees!employee_contracts_employee_id_fkey(site_id)",
      )
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{
        contract_number: string;
        employee: { site_id: string | null } | { site_id: string | null }[] | null;
        id: string;
      }>();

    if (error) {
      throw error;
    }

    const employee = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;

    return data
      ? {
          category: "employee_contract",
          label: data.contract_number,
          moduleKey: "employees",
          route: "/ops/employees",
          siteId: employee?.site_id ?? null,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "performance_appraisals") {
    const { data, error } = await supabase
      .from("performance_appraisals")
      .select(
        "id, appraisal_number, employee:employees!performance_appraisals_employee_id_fkey(site_id)",
      )
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{
        appraisal_number: string;
        employee: { site_id: string | null } | { site_id: string | null }[] | null;
        id: string;
      }>();

    if (error) {
      throw error;
    }

    const employee = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;

    return data
      ? {
          category: "performance_appraisal",
          label: data.appraisal_number,
          moduleKey: "employees",
          route: "/ops/employees",
          siteId: employee?.site_id ?? null,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "leave_balances") {
    const { data, error } = await supabase
      .from("leave_balances")
      .select(
        "id, leave_type, balance_year, employee:employees!leave_balances_employee_id_fkey(site_id)",
      )
      .eq("id", sourceId)
      .maybeSingle<{
        balance_year: number;
        employee: { site_id: string | null } | { site_id: string | null }[] | null;
        id: string;
        leave_type: string;
      }>();

    if (error) {
      throw error;
    }

    const employee = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;

    return data
      ? {
          category: "leave_balance",
          label: `${data.balance_year} ${data.leave_type}`,
          moduleKey: "employees",
          route: "/ops/employees",
          siteId: employee?.site_id ?? null,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  if (sourceTable === "employee_onboarding_items") {
    const { data, error } = await supabase
      .from("employee_onboarding_items")
      .select(
        "id, item_number, title, employee:employees!employee_onboarding_items_employee_id_fkey(site_id)",
      )
      .eq("id", sourceId)
      .neq("status", "cancelled")
      .maybeSingle<{
        employee: { site_id: string | null } | { site_id: string | null }[] | null;
        id: string;
        item_number: string;
        title: string;
      }>();

    if (error) {
      throw error;
    }

    const employee = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;

    return data
      ? {
          category: "employee_onboarding_item",
          label: `${data.item_number} - ${data.title}`,
          moduleKey: "employees",
          route: "/ops/employees",
          siteId: employee?.site_id ?? null,
          sourceId: data.id,
          sourceTable,
        }
      : null;
  }

  const { data, error } = await supabase
    .from("invoices")
    .select("id, site_id, invoice_number")
    .eq("id", sourceId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; invoice_number: string; site_id: string }>();

  if (error) {
    throw error;
  }

  return data
    ? {
        category: "invoice",
        label: data.invoice_number,
        moduleKey: "invoices",
        route: "/ops/invoices",
        siteId: data.site_id,
        sourceId: data.id,
        sourceTable,
      }
    : null;
}

export async function uploadOpsRecordAttachmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    fallbackError("Your role cannot upload attachments yet.");
  }

  const parsed = uploadAttachmentSchema.safeParse({
    source_id: field(formData, "source_id"),
    source_table: field(formData, "source_table"),
    title: field(formData, "title"),
    visibility: field(formData, "visibility") || "restricted",
  });

  if (!parsed.success) {
    fallbackError(parsed.error.issues[0]?.message ?? "Check the attachment details.");
  }

  const context = await resolveRecordContext(parsed.data.source_table, parsed.data.source_id);

  if (!context) {
    fallbackError("The record could not be found.");
  }

  const upload = await resolveUploadedObject(
    formData,
    `documents/${context.moduleKey}/${context.sourceId}`,
    (message) => activityError(context.route, message),
  );

  const key = upload.key;
  const title = parsed.data.title || upload.fileName;

  const supabase = getOpsSupabaseServiceClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      category: context.category,
      description: `Linked to ${context.label}.`,
      status: "active",
      title,
      uploaded_by: profile.id,
      visibility: parsed.data.visibility,
    })
    .select("id")
    .single<{ id: string }>();

  if (documentError || !document) {
    await deleteOpsR2Object(key).catch(() => null);
    activityError(context.route, documentError?.message ?? "The attachment could not be logged.");
  }

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      checksum_sha256: upload.checksum,
      content_type: upload.contentType,
      document_id: document.id,
      file_name: upload.fileName,
      file_size_bytes: upload.size,
      r2_key: key,
      uploaded_by: profile.id,
      version_number: 1,
    })
    .select("id")
    .single<{ id: string }>();

  if (versionError || !version) {
    await Promise.all([
      deleteOpsR2Object(key).catch(() => null),
      supabase
        .from("documents")
        .update({ archived_at: new Date().toISOString(), status: "archived" })
        .eq("id", document.id)
        .then(() => null),
    ]);
    activityError(context.route, versionError?.message ?? "The attachment version could not be logged.");
  }

  const { error: linkError } = await supabase.from("document_links").insert({
    created_by: profile.id,
    document_id: document.id,
    module_key: context.moduleKey,
    site_id: context.siteId,
    source_id: context.sourceId,
    source_table: context.sourceTable,
  });

  if (linkError) {
    await Promise.all([
      deleteOpsR2Object(key).catch(() => null),
      supabase
        .from("documents")
        .update({ archived_at: new Date().toISOString(), status: "archived" })
        .eq("id", document.id)
        .then(() => null),
    ]);
    activityError(context.route, linkError.message);
  }

  await recordOpsAuditEvent({
    action: "record.attachment_uploaded",
    actorUserId: profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: {
      content_type: upload.contentType,
      file_name: upload.fileName,
      file_size_bytes: upload.size,
      site_id: context.siteId,
      source_label: context.label,
      version_id: version.id,
      visibility: parsed.data.visibility,
    },
    moduleKey: context.moduleKey,
    sourceId: context.sourceId,
    sourceTable: context.sourceTable,
    summary: `Uploaded attachment for ${context.label}`,
  }).catch(() => null);

  revalidatePath(context.route);
  revalidatePath("/ops/documents");
  redirect(`${context.route}?updated=attachment`);
}

export async function addOpsRecordCommentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    fallbackError("Your role cannot add comments yet.");
  }

  const parsed = commentSchema.safeParse({
    body: field(formData, "body"),
    source_id: field(formData, "source_id"),
    source_table: field(formData, "source_table"),
  });

  if (!parsed.success) {
    fallbackError(parsed.error.issues[0]?.message ?? "Check the comment.");
  }

  const comment = validateOpsRecordCommentBody(parsed.data.body);

  if (!comment.ok) {
    fallbackError(comment.message);
  }

  const context = await resolveRecordContext(parsed.data.source_table, parsed.data.source_id);

  if (!context) {
    fallbackError("The record could not be found.");
  }

  // Phase Q: extract @mentions before insert so we can store them on the row
  // for the /ops/inbox query path.
  const activeUsers = await fetchOpsActiveUsers();
  const mentionedUserIds = extractMentionedUserIds(comment.body, activeUsers).filter(
    (id) => id !== profile.id,
  );

  const supabase = getOpsSupabaseServiceClient();
  const { data: inserted, error } = await supabase
    .from("record_comments")
    .insert({
      author_id: profile.id,
      body: comment.body,
      is_internal: true,
      mentioned_user_ids: mentionedUserIds,
      module_key: context.moduleKey,
      site_id: context.siteId,
      source_id: context.sourceId,
      source_table: context.sourceTable,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !inserted) {
    activityError(context.route, error?.message ?? "The comment could not be saved.");
  }

  await recordOpsAuditEvent({
    action: "record.comment_added",
    actorUserId: profile.id,
    entityId: context.sourceId,
    entityType: context.sourceTable,
    metadata: {
      site_id: context.siteId,
      mention_count: mentionedUserIds.length,
    },
    moduleKey: context.moduleKey,
    sourceId: context.sourceId,
    sourceTable: context.sourceTable,
    summary: `${profile.full_name} commented on ${context.label}`,
  }).catch(() => null);

  // Notify every @mentioned user — give them a direct link back to the record.
  await Promise.all(
    mentionedUserIds.map((recipientId) =>
      queueOpsNotification({
        actionHref: `/ops/inbox#cm-${inserted.id}`,
        body: `${profile.full_name} mentioned you on ${context.label}: ${comment.body.slice(0, 160)}`,
        idempotencyKey: `mention:${inserted.id}:${recipientId}`,
        moduleKey: context.moduleKey,
        recipientId,
        sourceId: context.sourceId,
        sourceTable: context.sourceTable,
        title: `${profile.full_name} mentioned you`,
      }).catch(() => null),
    ),
  );

  revalidatePath(context.route);
  if (mentionedUserIds.length > 0) {
    revalidatePath("/ops/inbox");
    revalidatePath("/ops/notifications");
  }
  redirect(`${context.route}?updated=comment`);
}
