import { ArchiveRestore, ArrowUpRight, Boxes, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsPaginationControls } from "@/components/ops/OpsListControls";
import {
  deleteOpsArchivedItemAction,
  restoreOpsArchivedItemAction,
} from "@/lib/ops/archive-actions";
import {
  fetchOpsArchiveSummary,
  fetchOpsArchivedItems,
  isOpsArchiveType,
  OPS_ARCHIVE_TYPES,
  type OpsArchiveType,
} from "@/lib/ops/archive";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import { canDeleteOpsArchived, canViewOpsBackoffice } from "@/lib/ops/permissions";
import {
  firstParam,
  OPS_DANGER_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_SUCCESS_CLASS,
  OPS_NOTICE_ERROR_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function formatWhen(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lusaka",
  }).format(new Date(value));
}

export default async function OpsArchivePage({ searchParams }: PageProps) {
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  if (!canViewOpsBackoffice(profile.role)) {
    notFound();
  }

  const summary = await fetchOpsArchiveSummary();

  const typeParam = firstParam(search.type);
  const selectedType: OpsArchiveType =
    typeParam && isOpsArchiveType(typeParam)
      ? typeParam
      : (summary.find((entry) => entry.count > 0)?.type ?? OPS_ARCHIVE_TYPES[0]);

  const listState = parseOpsListState(search, { defaultPageSize: 20 });
  const result = await fetchOpsArchivedItems(selectedType, listState);
  const activeEntry = summary.find((entry) => entry.type === selectedType);
  const canDelete = canDeleteOpsArchived(profile.role);

  const updated = firstParam(search.updated);
  const restored = updated === "restored";
  const deleted = updated === "deleted";
  const error = firstParam(search.error);

  const paginationFilters = [
    { label: "Type", name: "type", options: [], value: selectedType },
  ];

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Oversight"
        title="Archive"
        description="Records archived across the workspace. Leadership and the Operations Manager can restore them."
      />

      {restored ? (
        <div
          className={OPS_NOTICE_SUCCESS_CLASS}
          role="status"
        >
          Record restored. It is active again in its module.
        </div>
      ) : null}
      {deleted ? (
        <div
          className={OPS_NOTICE_SUCCESS_CLASS}
          role="status"
        >
          Record permanently deleted.
        </div>
      ) : null}
      {error ? (
        <div
          className={OPS_NOTICE_ERROR_CLASS}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {summary.map((entry) => {
          const isActive = entry.type === selectedType;
          return (
            <Link
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                isActive
                  ? "border-primary-blue bg-primary-blue text-white"
                  : "border-border bg-card text-foreground/70 hover:border-primary-blue/40"
              }`}
              href={`/ops/archive?type=${entry.type}`}
              key={entry.type}
            >
              {entry.label}
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-black ${
                  isActive ? "bg-white/20" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {entry.count}
              </span>
            </Link>
          );
        })}
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Archived {activeEntry?.label ?? ""}
            </p>
            <h2 className="font-heading text-xl font-bold text-foreground">
              {result.pagination.total} archived record
              {result.pagination.total === 1 ? "" : "s"}
            </h2>
          </div>
          {activeEntry ? (
            <Link
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-blue hover:underline"
              href={activeEntry.moduleHref}
            >
              Open module
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {result.items.length > 0 ? (
          <ul className="divide-y divide-border">
            {result.items.map((item) => (
              <li
                className="flex flex-col gap-3 p-4 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between"
                key={`${item.type}-${item.id}`}
              >
                <div className="min-w-0">
                  <p className="font-bold text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.subtitle ? `${item.subtitle} · ` : ""}
                    Archived {formatWhen(item.archivedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 min-[640px]:flex-row">
                  <form action={restoreOpsArchivedItemAction}>
                    <input name="type" type="hidden" value={item.type} />
                    <input name="id" type="hidden" value={item.id} />
                    <OpsConfirmSubmitButton
                      className={`${OPS_SECONDARY_BUTTON_CLASS} w-full min-[640px]:w-auto`}
                      confirmText="Confirm restore"
                    >
                      <ArchiveRestore className="size-4" aria-hidden="true" />
                      Restore
                    </OpsConfirmSubmitButton>
                  </form>
                  {canDelete ? (
                    <form action={deleteOpsArchivedItemAction}>
                      <input name="type" type="hidden" value={item.type} />
                      <input name="id" type="hidden" value={item.id} />
                      <OpsConfirmSubmitButton
                        className={`${OPS_DANGER_BUTTON_CLASS} w-full min-[640px]:w-auto`}
                        confirmText="Delete permanently"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Delete
                      </OpsConfirmSubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <OpsEmptyState
            icon={Boxes}
            title="Nothing archived here"
            description="When records of this type are archived, they will appear here ready to restore."
            actions={[]}
          />
        )}

        <div className="border-t border-border p-4">
          <OpsPaginationControls
            basePath="/ops/archive"
            filters={paginationFilters}
            pagination={result.pagination}
            query=""
            resultLabel="archived records"
          />
        </div>
      </section>
    </div>
  );
}
