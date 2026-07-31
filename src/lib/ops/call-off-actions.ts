"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsBoqLineActuals } from "@/lib/ops/boq-actuals";
import { canCreateOpsMaterialRequest } from "@/lib/ops/material-request-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * "Draw from schedule" — the call-off (audit §4.4).
 *
 * The business ask, in their words: *when making material requests it can be
 * clicked saying we need these materials from material schedule*.
 *
 * The design rule that makes this work where the old dropdown did not: picking
 * from the schedule is the PRIMARY path and pre-fills everything, so the link
 * populates itself. The previous approach — an optional select buried inside a
 * collapsed `<details>` on the single-item form — produced 0 links out of 337
 * items, because it asked people to do extra work for someone else's benefit.
 * Here the fast path and the correct path are the same path.
 *
 * Quantities default to what REMAINS on each line (planned − already
 * requested), not the full planned quantity, so a second call-off against a
 * part-consumed line cannot silently double-order.
 */

const MATERIAL_REQUEST_ROUTE = "/ops/material-requests";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function callOffError(message: string): never {
  throw new Error(safeOpsActionErrorMessage(message));
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

const headerSchema = z.object({
  site_id: z.string().regex(UUID, "Select a site."),
  title: z.string().trim().min(2, "Give the call-off a title.").max(160),
  needed_by: z.string().trim().default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

type ScheduleLineRow = {
  id: string;
  description: string;
  unit: string;
  quantity: number | string;
  unit_rate: number | string;
  needed_by: string | null;
  supplier_id: string | null;
  supplier_name_freeform: string | null;
  cost_code_id: string | null;
  boq_id: string;
};

/**
 * Create a material request pre-filled from the schedule lines the user ticked.
 *
 * Form shape: `line::<boqLineItemId>` = requested quantity (blank or 0 skips
 * the line).
 */
export async function createCallOffFromScheduleAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsMaterialRequest(profile.role)) {
    callOffError("Your role cannot raise material requests.");
  }

  const parsed = headerSchema.safeParse({
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
    needed_by: field(formData, "needed_by"),
    priority: field(formData, "priority") || "normal",
  });
  if (!parsed.success) {
    callOffError(parsed.error.issues[0]?.message ?? "Check the call-off details.");
  }

  // Collect the ticked lines and their quantities.
  const requested = new Map<string, number>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("line::") || typeof value !== "string") continue;
    const lineId = key.slice("line::".length);
    if (!UUID.test(lineId)) continue;
    const quantity = Number(value.trim());
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    requested.set(lineId, quantity);
  }

  if (requested.size === 0) {
    callOffError("Tick at least one schedule line and give it a quantity.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: lineRows, error: lineError } = await supabase
    .from("boq_line_items")
    .select(
      "id, description, unit, quantity, unit_rate, needed_by, supplier_id, supplier_name_freeform, cost_code_id, boq_id, document:boq_documents!boq_line_items_boq_id_fkey(site_id, status, superseded_at, archived_at, deleted_at)",
    )
    .in("id", Array.from(requested.keys()));

  if (lineError) {
    callOffError(lineError.message);
  }

  type Row = ScheduleLineRow & {
    document:
      | {
          site_id: string;
          status: string;
          superseded_at: string | null;
          archived_at: string | null;
          deleted_at: string | null;
        }
      | Array<{
          site_id: string;
          status: string;
          superseded_at: string | null;
          archived_at: string | null;
          deleted_at: string | null;
        }>
      | null;
  };

  const lines: ScheduleLineRow[] = [];
  for (const row of (lineRows ?? []) as unknown as Row[]) {
    const document = Array.isArray(row.document) ? (row.document[0] ?? null) : row.document;
    // Only live issued schedules on the chosen site can be drawn from. A
    // superseded or archived phase is not a plan any more.
    if (
      !document ||
      document.site_id !== parsed.data.site_id ||
      document.status !== "issued" ||
      document.superseded_at ||
      document.archived_at ||
      document.deleted_at
    ) {
      continue;
    }
    lines.push(row);
  }

  if (lines.length === 0) {
    callOffError(
      "None of those lines belong to a live issued schedule for this site. Refresh and try again.",
    );
  }

  // Guard against over-drawing: warn-shaped, consistent with §7.2 — the line
  // is still requested, but the over-draw is recorded so it is never silent.
  const actuals = await fetchOpsBoqLineActuals(lines.map((line) => line.id)).catch(
    () => new Map(),
  );
  const overDrawn: string[] = [];
  for (const line of lines) {
    const planned = toNumber(line.quantity);
    const already = actuals.get(line.id)?.requestedQuantity ?? 0;
    const asking = requested.get(line.id) ?? 0;
    if (already + asking > planned) {
      overDrawn.push(line.description);
    }
  }

  const { data: request, error: requestError } = await supabase
    .from("material_requests")
    .insert({
      description:
        "Called off from the material schedule." +
        (overDrawn.length > 0
          ? ` Over-drawn against plan: ${overDrawn.join(", ")}.`
          : ""),
      needed_by: parsed.data.needed_by || null,
      priority: parsed.data.priority,
      requested_by: profile.id,
      scope: "site",
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, request_number")
    .single<{ id: string; request_number: string }>();

  if (requestError || !request) {
    callOffError(requestError?.message ?? "Could not create the call-off.");
  }

  const { error: itemError } = await supabase.from("material_request_items").insert(
    lines.map((line, index) => {
      const quantity = requested.get(line.id) ?? 0;
      const rate = toNumber(line.unit_rate);
      return {
        request_id: request.id,
        line_number: index + 1,
        item_name: line.description,
        unit: line.unit,
        quantity,
        estimated_unit_cost: rate,
        specification: "",
        notes: "",
        supplier_id: line.supplier_id,
        supplier_name_freeform: line.supplier_name_freeform,
        // The whole point: the link is made by the fast path, not bolted on.
        boq_line_item_id: line.id,
        cost_code_id: line.cost_code_id,
      };
    }),
  );

  if (itemError) {
    callOffError(itemError.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.called_off_from_schedule",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      request_number: request.request_number,
      lines: lines.length,
      over_drawn: overDrawn,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: `Called off ${lines.length} schedule line(s) into ${request.request_number}${
      overDrawn.length > 0 ? ` (${overDrawn.length} over plan)` : ""
    }`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  revalidatePath("/ops/material-schedule");
  redirect(
    `${MATERIAL_REQUEST_ROUTE}?updated=called_off&lines=${lines.length}&over=${overDrawn.length}#mr-${request.id}`,
  );
}
