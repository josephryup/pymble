import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItChecklistKind, OpsItChecklistStatus } from "@/lib/ops/types";

export type OpsItChecklistRun = {
  archived_at: string | null;
  completed_at: string | null;
  created_at: string;
  done_count: number;
  employee_name: string;
  id: string;
  item_count: number;
  kind: OpsItChecklistKind;
  notes: string;
  status: OpsItChecklistStatus;
};

export type OpsItChecklistItem = {
  done_at: string | null;
  id: string;
  is_done: boolean;
  label: string;
  run_id: string;
  sort_order: number;
};

/** Default runbook steps seeded when a new checklist run is created. */
export const IT_CHECKLIST_TEMPLATES: Record<OpsItChecklistKind, string[]> = {
  offboarding: [
    "Disable email account",
    "Revoke system / ERP access",
    "Recover laptop, phone, and other equipment",
    "Revoke network and Wi-Fi access",
    "Back up and hand over user data",
    "Forward or archive the mailbox",
    "Update the access register",
  ],
  onboarding: [
    "Create email account",
    "Create system / ERP account",
    "Assign laptop / desktop and peripherals",
    "Set up network and Wi-Fi access",
    "Grant required application access",
    "Brief on IT and security policies",
    "Record everything in the access register",
  ],
};

export async function fetchOpsItChecklistRuns(): Promise<OpsItChecklistRun[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data: runs, error } = await supabase
    .from("it_checklist_runs")
    .select("id, employee_name, kind, status, notes, completed_at, archived_at, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<Omit<OpsItChecklistRun, "done_count" | "item_count">[]>();

  if (error) {
    throw error;
  }
  const runRows = runs ?? [];
  if (runRows.length === 0) {
    return [];
  }

  const { data: items, error: itemsError } = await supabase
    .from("it_checklist_items")
    .select("run_id, is_done")
    .in(
      "run_id",
      runRows.map((run) => run.id),
    )
    .returns<{ is_done: boolean; run_id: string }[]>();

  if (itemsError) {
    throw itemsError;
  }

  const counts = new Map<string, { done: number; total: number }>();
  for (const item of items ?? []) {
    const entry = counts.get(item.run_id) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (item.is_done) {
      entry.done += 1;
    }
    counts.set(item.run_id, entry);
  }

  return runRows.map((run) => ({
    ...run,
    done_count: counts.get(run.id)?.done ?? 0,
    item_count: counts.get(run.id)?.total ?? 0,
  }));
}

export type OpsItChecklistRunDetail = {
  archived_at: string | null;
  completed_at: string | null;
  created_at: string;
  employee_name: string;
  id: string;
  items: OpsItChecklistItem[];
  kind: OpsItChecklistKind;
  notes: string;
  status: OpsItChecklistStatus;
};

export async function fetchOpsItChecklistRun(
  runId: string,
): Promise<OpsItChecklistRunDetail | null> {
  const supabase = getOpsSupabaseServiceClient();
  const { data: run, error } = await supabase
    .from("it_checklist_runs")
    .select("id, employee_name, kind, status, notes, completed_at, archived_at, created_at")
    .eq("id", runId)
    .maybeSingle<Omit<OpsItChecklistRunDetail, "items">>();

  if (error) {
    throw error;
  }
  if (!run) {
    return null;
  }

  const { data: items, error: itemsError } = await supabase
    .from("it_checklist_items")
    .select("id, run_id, label, is_done, sort_order, done_at")
    .eq("run_id", runId)
    .order("sort_order", { ascending: true })
    .returns<OpsItChecklistItem[]>();

  if (itemsError) {
    throw itemsError;
  }

  return { ...run, items: items ?? [] };
}
