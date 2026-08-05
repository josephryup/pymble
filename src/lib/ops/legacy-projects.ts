import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsFinanceBridge } from "@/lib/ops/finance-permissions";
import type { OpsLegacyCostTreatment } from "@/lib/ops/payables-core";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The legacy project register.
 *
 * These are completed projects that exist only so their unpaid balances can be
 * recorded and reported. They are deliberately NOT sites: no budgets, no
 * programme, no team, no operational dashboards. The moment one of these grows
 * a budget or an attendance record, it should have been a site.
 */

export type OpsLegacyProject = {
  client_name: string;
  code: string;
  completed_on: string | null;
  cost_treatment: OpsLegacyCostTreatment;
  description: string;
  id: string;
  is_active: boolean;
  name: string;
  notes: string;
};

export type OpsLegacyProjectWithBalance = OpsLegacyProject & {
  /** Payables raised against this project that are not yet paid or cancelled. */
  outstanding_amount: number;
  outstanding_count: number;
  /** Settled, for context — a project with nothing left is worth showing as done. */
  paid_amount: number;
};

export async function fetchOpsLegacyProjects(): Promise<OpsLegacyProjectWithBalance[]> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();

  const [{ data: projects, error }, { data: payables }] = await Promise.all([
    supabase
      .from("legacy_projects")
      .select(
        "id, code, name, client_name, description, completed_on, cost_treatment, is_active, notes",
      )
      .order("code"),
    supabase
      .from("payment_requests")
      .select("legacy_project_id, requested_amount, status")
      .eq("charge_target", "legacy_project")
      .is("archived_at", null),
  ]);

  if (error || !projects) {
    return [];
  }

  const balances = new Map<string, { outstanding: number; count: number; paid: number }>();

  for (const row of (payables ?? []) as {
    legacy_project_id: string | null;
    requested_amount: number | string;
    status: string;
  }[]) {
    if (!row.legacy_project_id) continue;

    const amount = Number(row.requested_amount ?? 0);
    const entry = balances.get(row.legacy_project_id) ?? { count: 0, outstanding: 0, paid: 0 };

    if (row.status === "paid") {
      entry.paid += amount;
    } else if (row.status !== "cancelled" && row.status !== "rejected") {
      // Everything still in flight is money we owe — draft included, because a
      // payable someone has keyed but not submitted is still a real debt.
      entry.outstanding += amount;
      entry.count += 1;
    }

    balances.set(row.legacy_project_id, entry);
  }

  return (projects as OpsLegacyProject[]).map((project) => {
    const balance = balances.get(project.id);
    return {
      ...project,
      outstanding_amount: balance?.outstanding ?? 0,
      outstanding_count: balance?.count ?? 0,
      paid_amount: balance?.paid ?? 0,
    };
  });
}

/** Options for the payable form. Active projects only — see assertChargeTargetExists. */
export async function fetchOpsLegacyProjectOptions() {
  const projects = await fetchOpsLegacyProjects();
  return projects
    .filter((project) => project.is_active)
    .map((project) => ({
      cost_treatment: project.cost_treatment,
      id: project.id,
      label: `${project.code} — ${project.name}`,
    }));
}

/**
 * Active cost centres, for charging a payable that belongs to no project at
 * all — office rent, insurance, professional fees.
 *
 * Lives here rather than in a cost-centre module because the only thing that
 * needs it today is the payable form's third charge target, and it is the same
 * question: what does this cost belong to, if not a project?
 */
export async function fetchOpsCostCentreOptions() {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("cost_centres")
    .select("id, code, name")
    .eq("is_active", true)
    .order("code");

  if (error || !data) {
    return [];
  }

  return (data as { id: string; code: string; name: string }[]).map((centre) => ({
    id: centre.id,
    label: `${centre.code} — ${centre.name}`,
  }));
}
