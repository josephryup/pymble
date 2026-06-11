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
