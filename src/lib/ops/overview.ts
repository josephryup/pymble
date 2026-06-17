import { getOpsTimelineModuleKeys } from "@/lib/ops/activity-scoping";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsDashboardSnapshot } from "@/lib/ops/dashboard-snapshots";
import {
  fetchOpsOrganizationProfile,
  type OrganizationProfile,
} from "@/lib/ops/organization";
import { canManageOps } from "@/lib/ops/permissions";
import type {
  OpsAttendancePresence,
  OpsBoqStatus,
  OpsInvoiceStatus,
  OpsPayrollStatus,
  OpsSiteStatus,
} from "@/lib/ops/types";

export type OpsOverviewSite = {
  id: string;
  code: string;
  name: string;
  location: string;
  supervisor_name: string;
  client_name: string;
  budget_zmw: number;
  latitude: number | null;
  longitude: number | null;
  status: OpsSiteStatus;
  created_at: string;
};

export type OpsOverviewWorker = {
  id: string;
  worker_code: string;
  full_name: string;
  trade: string;
  site_id: string | null;
};

export type OpsOverviewAttendancePing = {
  id: string;
  site_id: string;
  worker_id: string;
  clock_in_at: string;
  presence: OpsAttendancePresence;
  gps_label: string;
  gps_latitude: number | null;
  gps_longitude: number | null;
  approved_at: string | null;
};

export type OpsOverviewPayrollRun = {
  id: string;
  period_label: string;
  status: OpsPayrollStatus;
  total_net: number;
  created_at: string;
} | null;

export type OpsOverviewBoq = {
  id: string;
  site_id: string;
  title: string;
  status: OpsBoqStatus;
  updated_at: string;
  site: {
    id: string;
    code: string;
    name: string;
  } | null;
  budgeted_total: number;
  actual_total: number;
} | null;

export type OpsOverviewInvoice = {
  id: string;
  invoice_number: string;
  client_name: string;
  status: OpsInvoiceStatus;
  total_amount: number;
  issued_at: string;
} | null;

export type OpsOverviewActivity = {
  id: string;
  message: string;
  actor_name: string | null;
  actor_role: string | null;
  tone: "info" | "warn" | "good";
  created_at: string;
};

type Relation<T> = T | T[] | null;

type RawOverviewSite = Omit<OpsOverviewSite, "budget_zmw" | "latitude" | "longitude"> & {
  budget_zmw: number | string;
  latitude: number | string | null;
  longitude: number | string | null;
};

type RawOverviewAttendancePing = Omit<
  OpsOverviewAttendancePing,
  "gps_latitude" | "gps_longitude"
> & {
  gps_latitude: number | string | null;
  gps_longitude: number | string | null;
};

type RawOverviewPayrollRun = Omit<NonNullable<OpsOverviewPayrollRun>, "total_net"> & {
  total_net: number | string;
};

type RawOverviewBoq = Omit<
  NonNullable<OpsOverviewBoq>,
  "actual_total" | "budgeted_total" | "site"
> & {
  site: Relation<NonNullable<OpsOverviewBoq>["site"]>;
};

type RawOverviewSnapshotBoq = RawOverviewBoq & {
  actual_total: number | string;
  budgeted_total: number | string;
};

type RawOverviewBoqItem = {
  actual_quantity: number | string;
  budgeted_total: number | string;
  unit_rate: number | string;
};

type RawOverviewInvoice = Omit<NonNullable<OpsOverviewInvoice>, "total_amount"> & {
  total_amount: number | string;
};

type RawActivityActor = {
  full_name: string | null;
  role: string | null;
};

type RawActivity = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  actor?: RawActivityActor | RawActivityActor[] | null;
};

type RawOrganizationProfile = Omit<
  OrganizationProfile,
  "headquarters_latitude" | "headquarters_longitude" | "vat_rate"
> & {
  headquarters_latitude: number | string | null;
  headquarters_longitude: number | string | null;
  vat_rate: number | string;
};

type RawOverviewSnapshot = {
  activeDate?: string;
  activity?: RawActivity[] | null;
  attendancePings?: RawOverviewAttendancePing[] | null;
  draftInvoices?: number | string | null;
  draftPayroll?: RawOverviewPayrollRun | null;
  failedPayouts?: number | string | null;
  latestBoq?: RawOverviewSnapshotBoq | null;
  latestInvoice?: RawOverviewInvoice | null;
  openApprovals?: number | string | null;
  openCashAdvances?: number | string | null;
  profile?: RawOrganizationProfile | null;
  sitePhotos?: Array<{ id: string; site_id: string }> | null;
  sites?: RawOverviewSite[] | null;
  workers?: OpsOverviewWorker[] | null;
};

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeCoordinate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatAction(action: string, entityType: string) {
  const noun = entityType.replace(/_/g, " ");

  if (action.endsWith(".created")) {
    return `${noun} created`;
  }

  if (action.endsWith(".approved")) {
    return `${noun} approved`;
  }

  if (action.endsWith(".completed")) {
    return `${noun} completed`;
  }

  if (action.endsWith(".uploaded")) {
    return `${noun} uploaded`;
  }

  if (action.endsWith(".deactivated")) {
    return `${noun} deactivated`;
  }

  return action.replace(/\./g, " ");
}

function activityTone(action: string): OpsOverviewActivity["tone"] {
  if (action.includes("approved") || action.includes("completed") || action.includes("uploaded")) {
    return "good";
  }

  if (action.includes("deactivated") || action.includes("failed")) {
    return "warn";
  }

  return "info";
}

function resolveActivityActor(actor: RawActivity["actor"]) {
  const resolved = Array.isArray(actor) ? (actor[0] ?? null) : (actor ?? null);
  return {
    name: resolved?.full_name?.trim() || null,
    role: resolved?.role || null,
  };
}

function normalizeActivity(items: RawActivity[] | null | undefined) {
  return (items ?? []).map((item) => {
    const actor = resolveActivityActor(item.actor);
    return {
      id: item.id,
      message: formatAction(item.action, item.entity_type),
      actor_name: actor.name,
      actor_role: actor.role,
      tone: activityTone(item.action),
      created_at: item.created_at,
    };
  });
}

function normalizeProfile(profile: RawOrganizationProfile | null | undefined) {
  if (!profile) {
    throw new Error("Pymble organization profile was not found.");
  }

  return {
    ...profile,
    headquarters_latitude: normalizeCoordinate(profile.headquarters_latitude),
    headquarters_longitude: normalizeCoordinate(profile.headquarters_longitude),
    vat_rate: normalizeNumber(profile.vat_rate),
  };
}

function normalizeSites(sites: RawOverviewSite[] | null | undefined) {
  return (sites ?? []).map((site) => ({
    ...site,
    budget_zmw: normalizeNumber(site.budget_zmw),
    latitude: normalizeCoordinate(site.latitude),
    longitude: normalizeCoordinate(site.longitude),
  }));
}

function normalizeAttendancePings(records: RawOverviewAttendancePing[] | null | undefined) {
  return (records ?? []).map((record) => ({
    ...record,
    gps_latitude: normalizeCoordinate(record.gps_latitude),
    gps_longitude: normalizeCoordinate(record.gps_longitude),
  }));
}

function normalizeDraftPayroll(payroll: RawOverviewPayrollRun | null | undefined) {
  return payroll
    ? {
        ...payroll,
        total_net: normalizeNumber(payroll.total_net),
      }
    : null;
}

function normalizeLatestInvoice(invoice: RawOverviewInvoice | null | undefined) {
  return invoice
    ? {
        ...invoice,
        total_amount: normalizeNumber(invoice.total_amount),
      }
    : null;
}

function normalizeLatestBoq(boq: RawOverviewSnapshotBoq | null | undefined): OpsOverviewBoq {
  return boq
    ? {
        ...boq,
        actual_total: normalizeNumber(boq.actual_total),
        budgeted_total: normalizeNumber(boq.budgeted_total),
        site: normalizeRelation(boq.site),
      }
    : null;
}

function normalizeOverviewSnapshot(snapshot: RawOverviewSnapshot) {
  return {
    activeDate: snapshot.activeDate ?? todayInLusaka(),
    profile: normalizeProfile(snapshot.profile),
    sites: normalizeSites(snapshot.sites),
    workers: snapshot.workers ?? [],
    attendancePings: normalizeAttendancePings(snapshot.attendancePings),
    draftPayroll: normalizeDraftPayroll(snapshot.draftPayroll),
    failedPayouts: normalizeNumber(snapshot.failedPayouts),
    draftInvoices: normalizeNumber(snapshot.draftInvoices),
    openApprovals: normalizeNumber(snapshot.openApprovals),
    openCashAdvances: normalizeNumber(snapshot.openCashAdvances),
    latestBoq: normalizeLatestBoq(snapshot.latestBoq),
    latestInvoice: normalizeLatestInvoice(snapshot.latestInvoice),
    sitePhotos: snapshot.sitePhotos ?? [],
    activity: normalizeActivity(snapshot.activity),
  };
}

export async function fetchOpsOverview() {
  await requireOpsUser();

  const supabase = await createOpsServerSessionClient();
  return fetchOpsDashboardSnapshot({
    fallback: fetchOpsOverviewViaQueries,
    load: async () => supabase.rpc("ops_overview_snapshot"),
    name: "overview",
    normalize: (data) => normalizeOverviewSnapshot(data as RawOverviewSnapshot),
  });
}

export type OpsOverview = Awaited<ReturnType<typeof fetchOpsOverview>>;

async function fetchOpsOverviewViaQueries() {
  const { profile: userProfile } = await requireOpsUser();
  const supabase = await createOpsServerSessionClient();
  const activeDate = todayInLusaka();
  const dayStartIso = new Date(`${activeDate}T00:00:00+02:00`).toISOString();
  const dayEndIso = new Date(`${activeDate}T23:59:59.999+02:00`).toISOString();

  const [
    profileResult,
    sitesResult,
    workersResult,
    todayAttendanceResult,
    draftPayrollResult,
    failedPayoutsResult,
    draftInvoicesResult,
    openCashAdvancesResult,
    latestBoqResult,
    latestInvoiceResult,
    sitePhotosResult,
  ] = await Promise.all([
    fetchOpsOrganizationProfile()
      .then((data) => ({ data, error: null }))
      .catch((error) => ({ data: null, error: error as Error })),
    supabase
      .from("sites")
      .select(
        "id, code, name, location, supervisor_name, client_name, budget_zmw, latitude, longitude, status, created_at",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("workers")
      .select("id, worker_code, full_name, trade, site_id")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("attendance_records")
      .select(
        "id, site_id, worker_id, clock_in_at, presence, gps_label, gps_latitude, gps_longitude, approved_at",
      )
      .eq("is_active", true)
      .gte("clock_in_at", dayStartIso)
      .lte("clock_in_at", dayEndIso)
      .order("clock_in_at", { ascending: false })
      .limit(200),
    supabase
      .from("payroll_runs")
      .select("id, period_label, status, total_net, created_at")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RawOverviewPayrollRun>(),
    supabase
      .from("payroll_run_items")
      .select("id", { count: "exact", head: true })
      .eq("payout_status", "failed"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .is("deleted_at", null),
    supabase
      .from("cash_advances")
      .select("id", { count: "exact", head: true })
      .is("deducted_in_run_id", null),
    supabase
      .from("boq_documents")
      .select(
        `
          id,
          site_id,
          title,
          status,
          updated_at,
          site:sites!boq_documents_site_id_fkey(id, code, name)
        `,
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<RawOverviewBoq>(),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, status, total_amount, issued_at")
      .is("deleted_at", null)
      .order("issued_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RawOverviewInvoice>(),
    supabase.from("site_photos").select("id, site_id").limit(500),
  ]);

  const firstError = [
    profileResult.error,
    sitesResult.error,
    workersResult.error,
    todayAttendanceResult.error,
    draftPayrollResult.error,
    failedPayoutsResult.error,
    draftInvoicesResult.error,
    openCashAdvancesResult.error,
    latestBoqResult.error,
    latestInvoiceResult.error,
    sitePhotosResult.error,
  ].find(Boolean);

  if (firstError) {
    throw firstError;
  }

  if (!profileResult.data) {
    throw new Error("Pymble organization profile was not found.");
  }

  const sites = ((sitesResult.data ?? []) as RawOverviewSite[]).map((site) => ({
    ...site,
    budget_zmw: normalizeNumber(site.budget_zmw),
    latitude: normalizeCoordinate(site.latitude),
    longitude: normalizeCoordinate(site.longitude),
  }));
  const workers = (workersResult.data ?? []) as OpsOverviewWorker[];
  const attendancePings = ((todayAttendanceResult.data ?? []) as RawOverviewAttendancePing[]).map(
    (record) => ({
      ...record,
      gps_latitude: normalizeCoordinate(record.gps_latitude),
      gps_longitude: normalizeCoordinate(record.gps_longitude),
    }),
  );
  const draftPayroll = draftPayrollResult.data
    ? {
        ...draftPayrollResult.data,
        total_net: normalizeNumber(draftPayrollResult.data.total_net),
      }
    : null;
  const rawLatestInvoice = latestInvoiceResult.data;
  const latestInvoice = rawLatestInvoice
    ? {
        ...rawLatestInvoice,
        total_amount: normalizeNumber(rawLatestInvoice.total_amount),
      }
    : null;

  let latestBoq: OpsOverviewBoq = null;

  if (latestBoqResult.data) {
    const { data: itemData, error: itemError } = await supabase
      .from("boq_line_items")
      .select("budgeted_total, actual_quantity, unit_rate")
      .eq("boq_id", latestBoqResult.data.id);

    if (itemError) {
      throw itemError;
    }

    const items = (itemData ?? []) as RawOverviewBoqItem[];
    latestBoq = {
      ...latestBoqResult.data,
      actual_total: items.reduce(
        (sum, item) =>
          sum + normalizeNumber(item.actual_quantity) * normalizeNumber(item.unit_rate),
        0,
      ),
      budgeted_total: items.reduce(
        (sum, item) => sum + normalizeNumber(item.budgeted_total),
        0,
      ),
      site: normalizeRelation(latestBoqResult.data.site),
    };
  }

  let activity: OpsOverviewActivity[] = [];

  if (canManageOps(userProfile.role)) {
    let activityQuery = supabase
      .from("audit_events")
      .select(
        "id, action, entity_type, module_key, created_at, actor:users!audit_events_actor_user_id_fkey(full_name, role)",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    const allowedModules = getOpsTimelineModuleKeys(userProfile.role);
    if (allowedModules && allowedModules.length > 0) {
      // Always include events with no module_key (legacy + system events) so we
      // don't silently hide records we have not yet tagged.
      activityQuery = activityQuery.or(
        `module_key.is.null,module_key.in.(${allowedModules.join(",")})`,
      );
    }

    const { data: activityData } = await activityQuery;

    activity = ((activityData ?? []) as unknown as RawActivity[]).slice(0, 6).map((item) => {
      const actor = resolveActivityActor(item.actor);
      return {
        id: item.id,
        message: formatAction(item.action, item.entity_type),
        actor_name: actor.name,
        actor_role: actor.role,
        tone: activityTone(item.action),
        created_at: item.created_at,
      };
    });
  }

  const openApprovals = attendancePings.filter((record) => !record.approved_at).length;
  const failedPayouts = failedPayoutsResult.count ?? 0;
  const draftInvoices = draftInvoicesResult.count ?? 0;

  return {
    activeDate,
    profile: profileResult.data,
    sites,
    workers,
    attendancePings,
    draftPayroll,
    failedPayouts,
    draftInvoices,
    openApprovals,
    openCashAdvances: openCashAdvancesResult.count ?? 0,
    latestBoq,
    latestInvoice,
    sitePhotos: (sitePhotosResult.data ?? []) as Array<{ id: string; site_id: string }>,
    activity,
  };
}
