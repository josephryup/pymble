import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItChecklistRun } from "@/lib/ops/it-checklists";
import {
  archiveItChecklistRunAction,
  completeItChecklistRunAction,
  toggleItChecklistItemAction,
} from "@/lib/ops/it-checklist-actions";
import { canManageIT } from "@/lib/ops/it-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  firstParam,
  OPS_DANGER_BUTTON_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsItChecklistDetailPage({ params, searchParams }: PageProps) {
  const [{ runId }, sp, { profile }] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/checklists")) {
    notFound();
  }

  const run = await fetchOpsItChecklistRun(runId);
  if (!run || run.archived_at) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const doneCount = run.items.filter((item) => item.is_done).length;
  const allDone = run.items.length > 0 && doneCount === run.items.length;
  const error = firstParam(sp.error);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <OpsRealtimeRefresh tables={["it_checklist_items", "it_checklist_runs"]} />
      <OpsPageHeader
        eyebrow={run.kind === "onboarding" ? "Onboarding checklist" : "Offboarding checklist"}
        title={run.employee_name}
        description={`${doneCount}/${run.items.length} steps complete`}
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/checklists">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All checklists
          </Link>
        }
      />

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</div>
      ) : null}

      {run.status === "completed" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">
          Checklist completed{run.completed_at ? ` on ${run.completed_at.slice(0, 10)}` : ""}.
        </div>
      ) : null}

      <ul className="space-y-2">
        {run.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-primary-dark/10 bg-white p-3">
            <span className={`flex items-center gap-2 text-sm ${item.is_done ? "text-primary-dark/50 line-through" : "text-primary-dark"}`}>
              {item.is_done ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> : <Circle className="size-4 text-primary-dark/30" aria-hidden="true" />}
              {item.label}
            </span>
            {canManage && run.status !== "completed" ? (
              <form action={toggleItChecklistItemAction}>
                <input name="run_id" type="hidden" value={run.id} />
                <input name="item_id" type="hidden" value={item.id} />
                <input name="is_done" type="hidden" value={item.is_done ? "false" : "true"} />
                <button className="text-xs font-semibold text-primary-blue hover:underline" type="submit">
                  {item.is_done ? "Undo" : "Mark done"}
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {canManage && run.status !== "completed" ? (
        <div className="flex flex-wrap gap-2">
          <form action={completeItChecklistRunAction}>
            <input name="run_id" type="hidden" value={run.id} />
            <button className={OPS_PRIMARY_BUTTON_CLASS} disabled={!allDone} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Mark complete
            </button>
          </form>
          <form action={archiveItChecklistRunAction}>
            <input name="run_id" type="hidden" value={run.id} />
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">Archive</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
