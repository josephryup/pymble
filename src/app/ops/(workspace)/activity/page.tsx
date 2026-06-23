import { Activity as ActivityIcon, Clock3, UserCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  fetchOpsActivityLog,
  fetchOpsActivityModuleKeys,
  type OpsActivityLogEntry,
} from "@/lib/ops/activity-log";
import { parseOpsListState } from "@/lib/ops/listing";
import { canViewOpsBackoffice } from "@/lib/ops/permissions";
import { formatOpsRole } from "@/lib/ops/roles";
import { firstParam, type OpsSearchParams } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function moduleLabel(key: string) {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toneClass(tone: OpsActivityLogEntry["tone"]) {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warn") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lusaka",
  }).format(new Date(value));
}

export default async function OpsActivityLogPage({ searchParams }: PageProps) {
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  if (!canViewOpsBackoffice(profile.role)) {
    notFound();
  }

  const listState = parseOpsListState(search, { defaultPageSize: 25 });
  const moduleParam = firstParam(search.module) ?? "";
  const [result, moduleKeys] = await Promise.all([
    fetchOpsActivityLog({
      listState,
      moduleKey: moduleParam || undefined,
      query: listState.query,
    }),
    fetchOpsActivityModuleKeys(),
  ]);

  const filters = [
    {
      label: "Module",
      name: "module",
      options: [
        { label: "All modules", value: "" },
        ...moduleKeys.map((key) => ({ label: moduleLabel(key), value: key })),
      ],
      value: moduleParam,
    },
  ];

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["audit_events"]} />
      <OpsPageHeader
        eyebrow="Oversight"
        title="System activity log"
        description="Every recorded action across the workspace — who did what, when, and in which module."
      />

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <OpsListControls
          action="/ops/activity"
          filters={filters}
          placeholder="Search by summary or action"
          query={listState.query}
          resultLabel="activity events"
        />

        {result.items.length > 0 ? (
          <ul className="divide-y divide-primary-dark/10">
            {result.items.map((entry) => (
              <li className="flex items-start gap-3 p-4" key={entry.id}>
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border ${toneClass(entry.tone)}`}
                >
                  <ActivityIcon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-primary-dark">{entry.message}</p>
                    {entry.module_key ? (
                      <span className="inline-flex shrink-0 rounded-full border border-primary-dark/10 bg-primary-dark/[0.03] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary-dark/60">
                        {moduleLabel(entry.module_key)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-primary-dark/50">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      {formatWhen(entry.created_at)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-primary-dark/70">
                      <UserCircle2 className="size-3.5" aria-hidden="true" />
                      {entry.actor_name ?? "Automated task"}
                      {entry.actor_role ? (
                        <span className="font-medium text-primary-dark/45">
                          · {formatOpsRole(entry.actor_role)}
                        </span>
                      ) : null}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <OpsEmptyState
            icon={ActivityIcon}
            title="No activity matches your filters"
            description="Adjust the search or module filter to widen the activity log."
            actions={[]}
          />
        )}

        <div className="border-t border-primary-dark/10 p-4">
          <OpsPaginationControls
            basePath="/ops/activity"
            filters={filters}
            pagination={result.pagination}
            query={listState.query}
            resultLabel="activity events"
          />
        </div>
      </section>
    </div>
  );
}
