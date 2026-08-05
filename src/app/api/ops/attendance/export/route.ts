import { NextResponse } from "next/server";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  fetchOpsAttendanceRecords,
  type OpsAttendanceFilters,
} from "@/lib/ops/attendance";
import {
  attendanceExportFilename,
  buildAttendanceRegisterXlsx,
} from "@/lib/ops/attendance-export";
import { logOpsServerError } from "@/lib/ops/log";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import type { OpsAttendancePresence } from "@/lib/ops/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Attendance register export. Honours the same filters as /ops/attendance. */
const EXPORT_ROW_LIMIT = 5000;

function presenceParam(value: string | null): OpsAttendancePresence | null {
  return value === "present" || value === "late" || value === "absent" ? value : null;
}

function dateParam(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function scopeLabel(filters: OpsAttendanceFilters) {
  const parts = [
    filters.dateFrom || filters.dateTo
      ? `${filters.dateFrom ?? "start"} to ${filters.dateTo ?? "today"}`
      : "All dates",
    filters.siteId ? "Filtered site" : "All sites",
  ];
  if (filters.presence) parts.push(filters.presence);
  if (filters.approval) parts.push(filters.approval);
  return parts.join(" | ");
}

export async function GET(request: Request) {
  try {
    const { profile } = await requireOpsUser();

    if (!canAccessOpsHref(profile.role, "/ops/attendance", await fetchOpsModuleAccessOverrides())) {
      return NextResponse.json(
        { error: "Your role cannot export attendance." },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const filters: OpsAttendanceFilters = {
      siteId: url.searchParams.get("site_id") || null,
      workerId: url.searchParams.get("worker_id") || null,
      presence: presenceParam(url.searchParams.get("presence")),
      approval:
        url.searchParams.get("approval") === "approved"
          ? "approved"
          : url.searchParams.get("approval") === "pending"
            ? "pending"
            : null,
      dateFrom: dateParam(url.searchParams.get("date_from")),
      dateTo: dateParam(url.searchParams.get("date_to")),
    };

    // fetchOpsAttendanceRecords applies the caller's site-assignment scoping, so
    // a supervisor can only ever export their own sites.
    const records = await fetchOpsAttendanceRecords(filters, { limit: EXPORT_ROW_LIMIT });
    const label = scopeLabel(filters);
    const workbook = await buildAttendanceRegisterXlsx(records, {
      generatedBy: profile.full_name,
      scopeLabel: label,
    });

    await recordOpsAuditEvent({
      action: "attendance.excel_exported",
      actorUserId: profile.id,
      entityType: "attendance_record",
      metadata: { filters, records: records.length },
      moduleKey: "attendance",
      sourceTable: "attendance_records",
      summary: `${profile.full_name} exported ${records.length} attendance records to Excel`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${attendanceExportFilename(label)}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    logOpsServerError(error, { module: "attendance", action: "exportAttendanceExcel" });
    return NextResponse.json(
      { error: "The attendance Excel file could not be generated." },
      { status: 500 },
    );
  }
}
