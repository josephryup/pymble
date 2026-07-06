import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

// ---------------------------------------------------------------------------
// E1 — LTIFR (Lost-Time Injury Frequency Rate)
// ---------------------------------------------------------------------------
// LTIFR = (lost-time injuries / total hours worked) * 1,000,000
// PDF asks for "LTIFR" as a top HSE KPI.

export type OpsLtifrSummary = {
  windowDays: number;
  hoursWorked: number;
  lostTimeIncidents: number;
  totalRecordable: number;
  totalNearMisses: number;
  ltifr: number | null;
  trifr: number | null;
};

const HSE_WINDOW_DAYS = 365;

const RECORDABLE_INCIDENT_TYPES = new Set([
  "first_aid",
  "medical_treatment",
  "lost_time",
]);

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function ratePerMillion(numerator: number, hours: number) {
  if (hours <= 0) return null;
  return Math.round((numerator / hours) * 1_000_000 * 10) / 10;
}

export async function fetchOpsLtifr(now = new Date()): Promise<OpsLtifrSummary> {
  const since = new Date(now.getTime() - HSE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const supabase = getOpsSupabaseServiceClient();
  const sinceIso = since.toISOString();

  const [attendanceResult, incidentsResult] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("hours_worked")
      .gte("clock_in_at", sinceIso),
    supabase
      .from("hse_incidents")
      .select("incident_type, status")
      .gte("occurred_at", sinceIso)
      .neq("status", "cancelled"),
  ]);

  if (attendanceResult.error || incidentsResult.error) {
    return {
      windowDays: HSE_WINDOW_DAYS,
      hoursWorked: 0,
      lostTimeIncidents: 0,
      totalRecordable: 0,
      totalNearMisses: 0,
      ltifr: null,
      trifr: null,
    };
  }

  const hours = ((attendanceResult.data ?? []) as Array<{ hours_worked: number | string }>).reduce(
    (sum, row) => sum + toNumber(row.hours_worked),
    0,
  );

  const incidents = (incidentsResult.data ?? []) as Array<{ incident_type: string }>;
  const lostTime = incidents.filter((row) => row.incident_type === "lost_time").length;
  const recordable = incidents.filter((row) => RECORDABLE_INCIDENT_TYPES.has(row.incident_type)).length;
  const nearMisses = incidents.filter((row) => row.incident_type === "near_miss").length;

  return {
    windowDays: HSE_WINDOW_DAYS,
    hoursWorked: hours,
    lostTimeIncidents: lostTime,
    totalRecordable: recordable,
    totalNearMisses: nearMisses,
    ltifr: ratePerMillion(lostTime, hours),
    trifr: ratePerMillion(recordable, hours),
  };
}

// ---------------------------------------------------------------------------
// E2 — PPE compliance & audit/inspection scores
// ---------------------------------------------------------------------------

export type OpsHseComplianceSummary = {
  ppeIssued: number;
  activeEmployees: number;
  ppeCompliancePct: number | null;
  inspectionsCount: number;
  inspectionsAvgScore: number | null;
  auditsCount: number;
  auditsAvgScore: number | null;
  trainingCompliancePct: number | null;
  trainingCompletedCount: number;
  trainingTotalCount: number;
};

export async function fetchOpsHseComplianceKpis(): Promise<OpsHseComplianceSummary> {
  const supabase = getOpsSupabaseServiceClient();

  const since = new Date();
  since.setDate(since.getDate() - 365);
  const sinceDate = since.toISOString().slice(0, 10);

  const [
    employeesResult,
    ppeResult,
    inspectionsResult,
    auditsResult,
    trainingResult,
  ] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("ppe_issues")
      .select("employee_id", { count: "exact" })
      .eq("status", "issued"),
    supabase
      .from("hse_inspections")
      .select("score, status")
      .eq("status", "completed"),
    supabase
      .from("hse_compliance_audits")
      .select("score, status")
      .eq("status", "completed"),
    supabase
      .from("safety_training_records")
      .select("status, completed_date, expiry_date")
      .gte("created_at", `${sinceDate}T00:00:00Z`),
  ]);

  const activeEmployees = employeesResult.count ?? 0;
  // Count unique employees currently holding issued PPE.
  const issuedEmployeeIds = new Set<string>();
  for (const row of (ppeResult.data ?? []) as Array<{ employee_id: string | null }>) {
    if (row.employee_id) issuedEmployeeIds.add(row.employee_id);
  }
  const ppeIssued = issuedEmployeeIds.size;
  const ppeCompliancePct =
    activeEmployees > 0 ? Math.round((ppeIssued / activeEmployees) * 100) : null;

  const inspections = ((inspectionsResult.data ?? []) as Array<{ score: number | string }>).map(
    (row) => toNumber(row.score),
  );
  const inspectionsAvgScore =
    inspections.length > 0
      ? Math.round((inspections.reduce((sum, value) => sum + value, 0) / inspections.length) * 10) / 10
      : null;

  const audits = ((auditsResult.data ?? []) as Array<{ score: number | string }>).map((row) =>
    toNumber(row.score),
  );
  const auditsAvgScore =
    audits.length > 0
      ? Math.round((audits.reduce((sum, value) => sum + value, 0) / audits.length) * 10) / 10
      : null;

  const trainings = (trainingResult.data ?? []) as Array<{
    status: string;
    completed_date: string | null;
    expiry_date: string | null;
  }>;
  const today = new Date().toISOString().slice(0, 10);
  const trainingCompleted = trainings.filter((row) => {
    if (row.status !== "completed") return false;
    if (row.expiry_date && row.expiry_date < today) return false;
    return true;
  }).length;
  const trainingCompliancePct =
    trainings.length > 0 ? Math.round((trainingCompleted / trainings.length) * 100) : null;

  return {
    ppeIssued,
    activeEmployees,
    ppeCompliancePct,
    inspectionsCount: inspections.length,
    inspectionsAvgScore,
    auditsCount: audits.length,
    auditsAvgScore,
    trainingCompliancePct,
    trainingCompletedCount: trainingCompleted,
    trainingTotalCount: trainings.length,
  };
}

// ---------------------------------------------------------------------------
// E3 — Incident trend & severity mix (dashboard charts)
// ---------------------------------------------------------------------------

export type OpsHseMonthlyIncidentPoint = {
  /** Short chart label, e.g. "Feb". */
  label: string;
  recordable: number;
  nearMisses: number;
  lostTime: number;
};

export type OpsHseSeverityCount = {
  severity: string;
  count: number;
};

export type OpsHseIncidentTrend = {
  months: number;
  points: OpsHseMonthlyIncidentPoint[];
  /** Severity mix across the same window (cancelled excluded). */
  severity: OpsHseSeverityCount[];
};

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  month: "short",
  timeZone: "Africa/Lusaka",
});

/**
 * Monthly incident counts for the HSE dashboard trend chart. One query,
 * aggregated in-process — incident volume is small.
 */
export async function fetchOpsHseIncidentTrend(months = 6): Promise<OpsHseIncidentTrend> {
  const supabase = getOpsSupabaseServiceClient();
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const { data, error } = await supabase
    .from("hse_incidents")
    .select("occurred_at, incident_type, severity")
    .gte("occurred_at", windowStart.toISOString())
    .neq("status", "cancelled");

  const empty: OpsHseIncidentTrend = { months, points: [], severity: [] };
  if (error) {
    return empty;
  }

  const rows = (data ?? []) as Array<{
    occurred_at: string;
    incident_type: string;
    severity: string;
  }>;

  const byMonth = new Map<string, OpsHseMonthlyIncidentPoint>();
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${month.getFullYear()}-${month.getMonth()}`;
    byMonth.set(key, {
      label: MONTH_LABEL_FORMAT.format(month),
      recordable: 0,
      nearMisses: 0,
      lostTime: 0,
    });
  }

  const severityCounts = new Map<string, number>();
  for (const row of rows) {
    const occurred = new Date(row.occurred_at);
    const point = byMonth.get(`${occurred.getFullYear()}-${occurred.getMonth()}`);
    if (point) {
      if (row.incident_type === "near_miss") point.nearMisses += 1;
      else if (RECORDABLE_INCIDENT_TYPES.has(row.incident_type)) point.recordable += 1;
      if (row.incident_type === "lost_time") point.lostTime += 1;
    }
    severityCounts.set(row.severity, (severityCounts.get(row.severity) ?? 0) + 1);
  }

  // Nothing recorded in the window — let the chart render its empty state.
  if (rows.length === 0) {
    return empty;
  }

  const SEVERITY_ORDER = ["low", "medium", "high", "critical"];
  const severity = [...severityCounts.entries()]
    .sort(
      (a, b) => SEVERITY_ORDER.indexOf(a[0]) - SEVERITY_ORDER.indexOf(b[0]),
    )
    .map(([key, count]) => ({ severity: key, count }));

  return { months, points: [...byMonth.values()], severity };
}
