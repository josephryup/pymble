import type {
  OpsFleetOperatorDocumentStatus,
  OpsPriority,
  OpsTransportRequestStatus,
  OpsTransportRequestType,
} from "@/lib/ops/types";

export type OpsFleetDispatchTransportSource = {
  actual_cost: number | string | null;
  assigned_equipment_id?: string | null;
  assigned_operator_employee_id?: string | null;
  assigned_operator_worker_id?: string | null;
  destination: string;
  estimated_cost: number | string | null;
  origin: string;
  passenger_count: number | string | null;
  priority: OpsPriority;
  request_number: string;
  request_type: OpsTransportRequestType;
  requested_for: string;
  scheduled_at: string | null;
  status: OpsTransportRequestStatus;
  title: string;
};

export type OpsFleetDispatchDay = {
  assigned_transports: number;
  date: string;
  estimated_cost: number;
  label: string;
  passenger_count: number;
  transports: number;
  unassigned_transports: number;
  urgent_transports: number;
};

export type OpsFleetUsageVarianceRow = {
  actual_cost: number;
  estimated_cost: number;
  request_number: string;
  route: string;
  scheduled_date: string;
  title: string;
  variance_amount: number;
  variance_percent: number | null;
};

export type OpsFleetDispatchReport = {
  days: OpsFleetDispatchDay[];
  totals: {
    assignedTransports: number;
    costOverrunCount: number;
    estimatedCost: number;
    passengerCount: number;
    transportCount: number;
    unassignedTransports: number;
    urgentTransports: number;
  };
  variance: {
    actualCost: number;
    averageVariancePercent: number | null;
    estimatedCost: number;
    overrunCount: number;
    rows: OpsFleetUsageVarianceRow[];
    varianceAmount: number;
    variancePercent: number | null;
  };
};

export type OpsFleetOperatorExpiryBucket = "expired" | "due_soon" | "valid" | "no_expiry" | "archived";

export type OpsFleetOperatorDocumentSource = {
  document_type: string;
  expires_at: string | null;
  id: string;
  issued_at: string | null;
  operator_id: string;
  operator_name: string;
  operator_reference: string;
  operator_type: "employee" | "worker";
  reference_number: string;
  reminder_days: number | string | null;
  status: OpsFleetOperatorDocumentStatus;
  title: string;
};

export type OpsFleetOperatorDocumentRow = OpsFleetOperatorDocumentSource & {
  bucket: OpsFleetOperatorExpiryBucket;
  days_until_expiry: number | null;
};

export type OpsFleetOperatorComplianceReport = {
  activeDocuments: number;
  archivedDocuments: number;
  dueSoonDocuments: number;
  expiredDocuments: number;
  noExpiryDocuments: number;
  rows: OpsFleetOperatorDocumentRow[];
  validDocuments: number;
};

export type OpsFleetProfitabilitySourceType =
  | "equipment_recovery"
  | "fuel_cost"
  | "maintenance_cost"
  | "transport_recovery";

export type OpsFleetProfitabilitySource = {
  amount: number | string | null;
  equipment_code?: string | null;
  equipment_id?: string | null;
  equipment_name?: string | null;
  occurred_on: string | null;
  site_code?: string | null;
  site_id?: string | null;
  site_name?: string | null;
  source_type: OpsFleetProfitabilitySourceType;
};

export type OpsFleetProfitabilityRow = {
  contribution_amount: number;
  contribution_percent: number | null;
  id: string;
  name: string;
  operating_cost: number;
  recovery_amount: number;
  reference: string;
};

export type OpsFleetProfitabilityReport = {
  contributionAmount: number;
  contributionPercent: number | null;
  equipmentRows: OpsFleetProfitabilityRow[];
  operatingCost: number;
  recoveryAmount: number;
  siteRows: OpsFleetProfitabilityRow[];
  sourceCount: number;
  windowDays: number;
};

const activeDispatchStatuses = new Set<OpsTransportRequestStatus>([
  "approved",
  "scheduled",
]);

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  return new Date(utc).toISOString().slice(0, 10);
}

function dayLabel(date: string, today: string) {
  if (date === today) {
    return "Today";
  }

  if (date === addDays(today, 1)) {
    return "Tomorrow";
  }

  return new Intl.DateTimeFormat("en-ZM", {
    day: "2-digit",
    month: "short",
    timeZone: "Africa/Lusaka",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00+02:00`));
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }

  return (numerator / denominator) * 100;
}

function calendarDayDelta(targetDate: string, todayDate: string) {
  const target = dateOnly(targetDate)?.split("-").map(Number) ?? [];
  const today = dateOnly(todayDate)?.split("-").map(Number) ?? [];

  if (target.length !== 3 || today.length !== 3) {
    return 0;
  }

  return Math.round(
    (Date.UTC(target[0], target[1] - 1, target[2]) -
      Date.UTC(today[0], today[1] - 1, today[2])) /
      86_400_000,
  );
}

function operatorExpiryBucket(
  row: Pick<OpsFleetOperatorDocumentSource, "expires_at" | "reminder_days" | "status">,
  todayDate: string,
): {
  bucket: OpsFleetOperatorExpiryBucket;
  daysUntilExpiry: number | null;
} {
  if (row.status === "archived") {
    return { bucket: "archived", daysUntilExpiry: null };
  }

  if (!row.expires_at) {
    return { bucket: "no_expiry", daysUntilExpiry: null };
  }

  const daysUntilExpiry = calendarDayDelta(row.expires_at, todayDate);

  if (daysUntilExpiry < 0) {
    return { bucket: "expired", daysUntilExpiry };
  }

  if (daysUntilExpiry <= normalizeNumber(row.reminder_days ?? 30)) {
    return { bucket: "due_soon", daysUntilExpiry };
  }

  return { bucket: "valid", daysUntilExpiry };
}

function isProfitabilityRecovery(sourceType: OpsFleetProfitabilitySourceType) {
  return sourceType === "equipment_recovery" || sourceType === "transport_recovery";
}

function createProfitabilityRow({
  id,
  name,
  reference,
}: {
  id: string;
  name: string;
  reference: string;
}): OpsFleetProfitabilityRow {
  return {
    contribution_amount: 0,
    contribution_percent: null,
    id,
    name,
    operating_cost: 0,
    recovery_amount: 0,
    reference,
  };
}

function finalizeProfitabilityRows(rows: Iterable<OpsFleetProfitabilityRow>, limit = 6) {
  return Array.from(rows)
    .map((row) => ({
      ...row,
      contribution_amount: row.recovery_amount - row.operating_cost,
      contribution_percent: percentage(row.recovery_amount - row.operating_cost, row.recovery_amount),
    }))
    .sort((a, b) => {
      if (a.contribution_amount !== b.contribution_amount) {
        return a.contribution_amount - b.contribution_amount;
      }

      return b.recovery_amount - a.recovery_amount;
    })
    .slice(0, limit);
}

function dispatchDate(row: OpsFleetDispatchTransportSource) {
  return dateOnly(row.scheduled_at) ?? dateOnly(row.requested_for);
}

function isAssigned(row: OpsFleetDispatchTransportSource) {
  return Boolean(
    row.assigned_equipment_id ||
      row.assigned_operator_employee_id ||
      row.assigned_operator_worker_id,
  );
}

export function buildOpsFleetDispatchReport({
  horizonDays = 14,
  todayDate,
  transports,
}: {
  horizonDays?: number;
  todayDate: string;
  transports: OpsFleetDispatchTransportSource[];
}): OpsFleetDispatchReport {
  const dayMap = new Map<string, OpsFleetDispatchDay>();

  for (let index = 0; index < horizonDays; index += 1) {
    const date = addDays(todayDate, index);
    dayMap.set(date, {
      assigned_transports: 0,
      date,
      estimated_cost: 0,
      label: dayLabel(date, todayDate),
      passenger_count: 0,
      transports: 0,
      unassigned_transports: 0,
      urgent_transports: 0,
    });
  }

  for (const row of transports) {
    if (!activeDispatchStatuses.has(row.status)) {
      continue;
    }

    const date = dispatchDate(row);

    if (!date || !dayMap.has(date)) {
      continue;
    }

    const day = dayMap.get(date);

    if (!day) {
      continue;
    }

    day.transports += 1;
    day.passenger_count += normalizeNumber(row.passenger_count);
    day.estimated_cost += normalizeNumber(row.estimated_cost);

    if (row.priority === "urgent" || row.priority === "high") {
      day.urgent_transports += 1;
    }

    if (isAssigned(row)) {
      day.assigned_transports += 1;
    } else {
      day.unassigned_transports += 1;
    }
  }

  const varianceRows = transports
    .filter((row) => row.status === "completed")
    .map((row) => {
      const estimatedCost = normalizeNumber(row.estimated_cost);
      const actualCost = normalizeNumber(row.actual_cost);
      const varianceAmount = actualCost - estimatedCost;

      return {
        actual_cost: actualCost,
        estimated_cost: estimatedCost,
        request_number: row.request_number,
        route: `${row.origin || "Origin"} -> ${row.destination || "Destination"}`,
        scheduled_date: dispatchDate(row) ?? row.requested_for,
        title: row.title,
        variance_amount: varianceAmount,
        variance_percent: percentage(varianceAmount, estimatedCost),
      } satisfies OpsFleetUsageVarianceRow;
    })
    .sort((a, b) => b.variance_amount - a.variance_amount)
    .slice(0, 8);
  const varianceTotals = transports
    .filter((row) => row.status === "completed")
    .reduce(
      (sum, row) => {
        const estimatedCost = normalizeNumber(row.estimated_cost);
        const actualCost = normalizeNumber(row.actual_cost);
        const varianceAmount = actualCost - estimatedCost;
        return {
          actualCost: sum.actualCost + actualCost,
          estimatedCost: sum.estimatedCost + estimatedCost,
          overrunCount: sum.overrunCount + (varianceAmount > 0 ? 1 : 0),
        };
      },
      { actualCost: 0, estimatedCost: 0, overrunCount: 0 },
  );
  const days = [...dayMap.values()];
  const variancePercentRows = varianceRows.filter((row) => row.variance_percent !== null);
  const totals = days.reduce(
    (sum, day) => ({
      assignedTransports: sum.assignedTransports + day.assigned_transports,
      costOverrunCount: varianceTotals.overrunCount,
      estimatedCost: sum.estimatedCost + day.estimated_cost,
      passengerCount: sum.passengerCount + day.passenger_count,
      transportCount: sum.transportCount + day.transports,
      unassignedTransports: sum.unassignedTransports + day.unassigned_transports,
      urgentTransports: sum.urgentTransports + day.urgent_transports,
    }),
    {
      assignedTransports: 0,
      costOverrunCount: 0,
      estimatedCost: 0,
      passengerCount: 0,
      transportCount: 0,
      unassignedTransports: 0,
      urgentTransports: 0,
    },
  );
  const varianceAmount = varianceTotals.actualCost - varianceTotals.estimatedCost;

  return {
    days,
    totals,
    variance: {
      ...varianceTotals,
      averageVariancePercent:
        variancePercentRows.length > 0
          ? variancePercentRows.reduce((sum, row) => sum + (row.variance_percent ?? 0), 0) /
            variancePercentRows.length
          : null,
      rows: varianceRows,
      varianceAmount,
      variancePercent: percentage(varianceAmount, varianceTotals.estimatedCost),
    },
  };
}

export function buildOpsFleetOperatorComplianceReport({
  documents,
  todayDate,
}: {
  documents: OpsFleetOperatorDocumentSource[];
  todayDate: string;
}): OpsFleetOperatorComplianceReport {
  const bucketWeight: Record<OpsFleetOperatorExpiryBucket, number> = {
    expired: 0,
    due_soon: 1,
    no_expiry: 2,
    valid: 3,
    archived: 4,
  };
  const rows = documents
    .map((document) => {
      const expiry = operatorExpiryBucket(document, todayDate);

      return {
        ...document,
        bucket: expiry.bucket,
        days_until_expiry: expiry.daysUntilExpiry,
      };
    })
    .sort((a, b) => {
      const bucketSort = bucketWeight[a.bucket] - bucketWeight[b.bucket];

      if (bucketSort !== 0) {
        return bucketSort;
      }

      return (a.days_until_expiry ?? 9999) - (b.days_until_expiry ?? 9999);
    });

  return {
    activeDocuments: rows.filter((row) => row.status === "active").length,
    archivedDocuments: rows.filter((row) => row.status === "archived").length,
    dueSoonDocuments: rows.filter((row) => row.bucket === "due_soon").length,
    expiredDocuments: rows.filter((row) => row.bucket === "expired").length,
    noExpiryDocuments: rows.filter((row) => row.bucket === "no_expiry").length,
    rows: rows.slice(0, 8),
    validDocuments: rows.filter((row) => row.bucket === "valid").length,
  };
}

export function buildOpsFleetProfitabilityReport({
  sources,
  todayDate,
  windowDays = 90,
}: {
  sources: OpsFleetProfitabilitySource[];
  todayDate: string;
  windowDays?: number;
}): OpsFleetProfitabilityReport {
  const startDate = addDays(todayDate, -(Math.max(1, windowDays) - 1));
  const siteRows = new Map<string, OpsFleetProfitabilityRow>();
  const equipmentRows = new Map<string, OpsFleetProfitabilityRow>();
  let recoveryAmount = 0;
  let operatingCost = 0;
  let sourceCount = 0;

  for (const source of sources) {
    const occurredOn = dateOnly(source.occurred_on);

    if (!occurredOn || occurredOn < startDate || occurredOn > todayDate) {
      continue;
    }

    const amount = normalizeNumber(source.amount);

    if (amount <= 0) {
      continue;
    }

    sourceCount += 1;

    const siteId = source.site_id ?? "unlinked-site";
    const siteRow =
      siteRows.get(siteId) ??
      createProfitabilityRow({
        id: siteId,
        name: source.site_name ?? "Unlinked site",
        reference: source.site_code ?? "Site",
      });
    siteRows.set(siteId, siteRow);

    const equipmentId = source.equipment_id ?? "unlinked-equipment";
    const equipmentRow =
      equipmentRows.get(equipmentId) ??
      createProfitabilityRow({
        id: equipmentId,
        name: source.equipment_name ?? "Unlinked equipment",
        reference: source.equipment_code ?? "Equipment",
      });
    equipmentRows.set(equipmentId, equipmentRow);

    if (isProfitabilityRecovery(source.source_type)) {
      recoveryAmount += amount;
      siteRow.recovery_amount += amount;
      equipmentRow.recovery_amount += amount;
    } else {
      operatingCost += amount;
      siteRow.operating_cost += amount;
      equipmentRow.operating_cost += amount;
    }
  }

  const contributionAmount = recoveryAmount - operatingCost;

  return {
    contributionAmount,
    contributionPercent: percentage(contributionAmount, recoveryAmount),
    equipmentRows: finalizeProfitabilityRows(equipmentRows.values()),
    operatingCost,
    recoveryAmount,
    siteRows: finalizeProfitabilityRows(siteRows.values()),
    sourceCount,
    windowDays,
  };
}
