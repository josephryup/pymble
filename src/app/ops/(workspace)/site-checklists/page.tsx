import {
  AlertTriangle,
  Archive,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Lock,
  Play,
  RotateCcw,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsCollapsible } from "@/components/ops/OpsCollapsible";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import {
  OpsListControls,
  OpsPaginationControls,
  type OpsListSelectFilter,
} from "@/components/ops/OpsListControls";
import { parseOpsListState } from "@/lib/ops/listing";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsOfflineForm } from "@/components/ops/OpsOfflineForm";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canArchiveOpsQaChecklist,
  canCreateOpsEngineeringControl,
  canReleaseOpsQaHoldPoint,
  canSignOffOpsQaChecklist,
  canViewOpsEngineeringControls,
} from "@/lib/ops/engineering-controls-permissions";
import { todayInLusaka } from "@/lib/ops/format";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  acknowledgeQaChecklistAction,
  archiveQaChecklistAction,
  attachQaChecklistEvidenceAction,
  completeQaChecklistAction,
  overrideQaHoldPointAction,
  reopenQaChecklistAction,
  setQaChecklistItemAction,
  startQaChecklistAction,
} from "@/lib/ops/qa-checklist-actions";
import { qaChecklistTemplateOptions } from "@/lib/ops/qa-checklist-templates";
import { isAwaitingQaSignOff, type QaItemResult } from "@/lib/ops/qa-checklist-rules";
import {
  fetchOpsQaChecklistStats,
  fetchPaginatedOpsQaChecklistRuns,
  type QaChecklistRun,
} from "@/lib/ops/qa-checklists";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import type { OpsQaInspectionStatus, OpsUserRole } from "@/lib/ops/types";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_NOTICE_WARNING_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  opsStatusBadgeClass,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

/** Statuses a live checklist can be filtered by — cancelled runs are excluded
 * from the read model entirely, so offering it would return nothing. */
const QA_STATUS_OPTIONS: OpsQaInspectionStatus[] = [
  "planned",
  "completed",
  "action_required",
  "closed",
];

function isQaStatus(value: string | undefined): value is OpsQaInspectionStatus {
  return Boolean(value) && (QA_STATUS_OPTIONS as string[]).includes(value!);
}

const RESULT_OPTIONS: Array<{ value: QaItemResult; label: string }> = [
  { value: "pending", label: "—" },
  { value: "pass", label: "Yes" },
  { value: "fail", label: "No" },
  { value: "observation", label: "Observation" },
  { value: "not_applicable", label: "N/A" },
];

function checklistNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "checklist", "Checklist started. Work through the items below.");
  if (created) return created;

  const updated = firstParam(params.updated);
  const messages: Record<string, string> = {
    acknowledged: "Sign-off recorded. The checklist is complete.",
    archived: "Checklist archived. It can be restored from the archive.",
    completed: "Checklist completed.",
    evidence: "Photo attached.",
    item: "Answer saved.",
    override: "Hold point released. The reason is recorded on the checklist.",
    reopened: "Checklist reopened for correction. The sign-off was cleared with it.",
  };

  return updated && messages[updated]
    ? { tone: "success" as const, message: messages[updated] }
    : null;
}

function ChecklistRunCard({
  expanded,
  run,
  role,
  userId,
}: {
  expanded: boolean;
  run: QaChecklistRun;
  role: OpsUserRole;
  userId: string;
}) {
  const isOpen = run.status === "planned";
  const canEdit = isOpen && canCreateOpsEngineeringControl(role);
  const holdPointBlocker = run.evaluation.blockers.find((blocker) => blocker.code === "hold_points");
  const released = Boolean(run.overrideAt);
  const fieldworkDone =
    run.evaluation.blockers.filter((blocker) => !(released && blocker.code === "hold_points"))
      .length === 0;
  const awaitingSignOff = isAwaitingQaSignOff({
    evaluation: run.evaluation,
    holdPointsReleased: released,
    pmSignedAt: run.pmSignedAt,
  });
  const canSignOff =
    isOpen && awaitingSignOff && canSignOffOpsQaChecklist(role) && run.inspectorId !== userId;

  return (
    // The whole header is the toggle. A site with several checklists open was
    // previously one unbroken page of every item and every form (UI/UX audit
    // §3); collapsed, the page becomes a list you can scan.
    <OpsCollapsible
      id={`run-${run.id}`}
      meta={
        <div className="rounded-md border border-border px-4 py-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Score
          </p>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {run.evaluation.score}%
          </p>
          <p className="text-xs font-normal text-muted-foreground">
            {run.evaluation.passed}/{run.evaluation.total} passed
          </p>
        </div>
      }
      open={expanded}
      title={
        <div className="font-sans text-base font-normal">
          <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-lg font-bold text-foreground">{run.process}</h3>
              <span className={opsStatusBadgeClass(run.status)}>{run.status.replace("_", " ")}</span>
              {run.pmSignedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                  <UserCheck className="size-3" aria-hidden="true" />
                  PM signed
                </span>
              ) : null}
              {awaitingSignOff ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-sky-700">
                  <FileSignature className="size-3" aria-hidden="true" />
                  Awaiting PM sign-off
                </span>
              ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.inspectionNumber} · {run.siteLabel}
            {run.location ? ` · ${run.location}` : ""} · {run.inspectionDate}
          </p>
          {/* Who is answerable for these answers — the point of the record. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Initiated by <strong className="text-foreground">{run.initiatorName}</strong>
            {run.pmSignedAt ? (
              <>
                {" · signed off by "}
                <strong className="text-foreground">{run.pmSignedByName || "Projects Manager"}</strong>
                {` on ${new Date(run.pmSignedAt).toLocaleDateString("en-ZM")}`}
              </>
            ) : null}
          </p>
          {run.needsTemplateReview ? (
            <p className="mt-2 text-xs font-semibold text-orange-700">
              This checklist was drafted, not supplied — have an engineer review the items before
              relying on it.
            </p>
          ) : null}
        </div>
      }
      variant="panel"
    >
      {run.evaluation.blockers.length > 0 && isOpen ? (
        <div className={`m-5 ${OPS_NOTICE_WARNING_CLASS}`}>
          <p className="font-bold">Cannot complete yet</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {run.evaluation.blockers.map((blocker) => (
              <li key={blocker.code}>
                {blocker.message}
                {blocker.lineNumbers.length > 0 ? ` (items ${blocker.lineNumbers.join(", ")})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {released ? (
        <div className="mx-5 mt-5 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <p className="font-bold">
            <ShieldAlert className="mr-1 inline size-4" aria-hidden="true" />
            Hold point released
          </p>
          <p className="mt-1">{run.overrideReason}</p>
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {run.items.map((item) => (
          <li className="p-5" key={item.id}>
            <div className="flex flex-wrap items-start gap-2">
              <span className="text-sm font-bold text-muted-foreground">{item.lineNumber}.</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">
                  {item.text}
                  {item.isHoldPoint ? (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-red-700">
                      <Lock className="size-2.5" aria-hidden="true" />
                      Hold point
                    </span>
                  ) : null}
                </p>
                {item.criterion ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">Accept if: {item.criterion}</p>
                ) : null}
                {item.photoCount > 0 ? (
                  <p className="mt-0.5 text-xs font-semibold text-emerald-700">
                    <Camera className="mr-1 inline size-3" aria-hidden="true" />
                    {item.photoCount} photo{item.photoCount === 1 ? "" : "s"} attached
                  </p>
                ) : null}
              </div>
            </div>

            {canEdit ? (
              <form
                action={setQaChecklistItemAction}
                className="mt-3 grid gap-2 sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_auto]"
              >
                <input name="run_id" type="hidden" value={run.id} />
                <input name="item_id" type="hidden" value={item.id} />
                <label className={`${OPS_LABEL_CLASS} min-w-0`}>
                  Result
                  <select className={OPS_INPUT_CLASS} defaultValue={item.result} name="result">
                    {RESULT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${OPS_LABEL_CLASS} min-w-0`}>
                  Note
                  <input className={OPS_INPUT_CLASS} defaultValue={item.notes} name="notes" />
                </label>
                <div className="flex items-end">
                  <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Result: <strong>{item.result}</strong>
                {item.notes ? ` · ${item.notes}` : ""}
              </p>
            )}

            {canEdit && item.result === "fail" ? (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50/60 p-3">
                <p className="text-xs font-bold text-red-800">
                  A photo is required for this failure before the checklist can be completed.
                </p>
                <OpsOfflineForm
                  action={attachQaChecklistEvidenceAction}
                  className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"
                  kind="qa_checklist.evidence"
                  replayEndpoint="/api/ops/offline/photos"
                  summary={`Evidence for ${run.inspectionNumber} item ${item.lineNumber}`}
                >
                  <input name="run_id" type="hidden" value={run.id} />
                  <input name="site_id" type="hidden" value={run.siteId} />
                  <input name="tag" type="hidden" value="progress" />
                  <input name="qa_inspection_item_id" type="hidden" value={item.id} />
                  <input
                    name="caption"
                    type="hidden"
                    value={`${run.inspectionNumber} item ${item.lineNumber}`}
                  />
                  <input
                    accept="image/*"
                    capture="environment"
                    className={OPS_INPUT_CLASS}
                    name="photo"
                    required
                    type="file"
                  />
                  <OpsSubmitButton className={OPS_SECONDARY_BUTTON_CLASS} pendingLabel="Uploading...">
                    <Camera className="size-4" aria-hidden="true" />
                    Attach
                  </OpsSubmitButton>
                </OpsOfflineForm>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 p-5">
        {/*
          The engineer no longer closes their own checklist. Once the fieldwork
          is done it waits for the Projects Manager, whose acknowledgement is
          what completes it.
        */}
        {canEdit && !run.pmSignedAt ? (
          <p className="text-sm text-muted-foreground">
            {fieldworkDone
              ? "Ready for the Projects Manager to acknowledge. Completing is their sign-off."
              : "Answer every item and photograph the failures, then it goes to the Projects Manager."}
          </p>
        ) : null}

        {canEdit && run.pmSignedAt ? (
          <form action={completeQaChecklistAction}>
            <input name="run_id" type="hidden" value={run.id} />
            <OpsConfirmSubmitButton
              className={OPS_PRIMARY_BUTTON_CLASS}
              confirmText="Confirm complete"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Complete checklist
            </OpsConfirmSubmitButton>
          </form>
        ) : null}

        {canSignOff ? (
          <form action={acknowledgeQaChecklistAction} className="grid w-full gap-2">
            <label className={`${OPS_LABEL_CLASS} min-w-0`}>
              Sign-off note (optional)
              <input
                className={OPS_INPUT_CLASS}
                name="note"
                placeholder="Anything the record should carry"
              />
            </label>
            <input name="run_id" type="hidden" value={run.id} />
            <div>
              <OpsConfirmSubmitButton
                className={OPS_PRIMARY_BUTTON_CLASS}
                confirmText="Confirm sign-off"
              >
                <UserCheck className="size-4" aria-hidden="true" />
                Acknowledge and complete
              </OpsConfirmSubmitButton>
            </div>
          </form>
        ) : null}

        {isOpen && awaitingSignOff && canSignOffOpsQaChecklist(role) && run.inspectorId === userId ? (
          <p className="text-sm text-muted-foreground">
            You started this checklist, so somebody else has to acknowledge it.
          </p>
        ) : null}

        {run.pmSignOffNote ? (
          <p className="w-full text-sm text-muted-foreground">
            Sign-off note: “{run.pmSignOffNote}”
          </p>
        ) : null}

        {isOpen && holdPointBlocker && !released && canReleaseOpsQaHoldPoint(role) ? (
          <OpsCollapsible
            className="bg-orange-50/60"
            title="Release hold point (senior sign-off)"
            tone="warning"
          >
            {run.inspectorId === userId ? (
              <p className="mt-2 text-sm text-orange-900">
                You ran this inspection, so you cannot release its own hold point. Ask a second
                person.
              </p>
            ) : (
              <form action={overrideQaHoldPointAction} className="mt-2 grid gap-2">
                <input name="run_id" type="hidden" value={run.id} />
                <label className={OPS_LABEL_CLASS}>
                  Why is it safe to proceed?
                  <textarea
                    className={OPS_INPUT_CLASS}
                    minLength={15}
                    name="reason"
                    required
                    rows={2}
                  />
                </label>
                <div>
                  <OpsConfirmSubmitButton
                    className={OPS_DANGER_BUTTON_CLASS}
                    confirmText="Confirm release"
                  >
                    <ShieldAlert className="size-4" aria-hidden="true" />
                    Record override
                  </OpsConfirmSubmitButton>
                </div>
              </form>
            )}
          </OpsCollapsible>
        ) : null}

        {!isOpen && canReleaseOpsQaHoldPoint(role) ? (
          <form action={reopenQaChecklistAction}>
            <input name="run_id" type="hidden" value={run.id} />
            <OpsConfirmSubmitButton
              className={OPS_SECONDARY_BUTTON_CLASS}
              confirmText="Confirm reopen"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Reopen
            </OpsConfirmSubmitButton>
          </form>
        ) : null}

        {canArchiveOpsQaChecklist(role) ? (
          <form action={archiveQaChecklistAction}>
            <input name="run_id" type="hidden" value={run.id} />
            <OpsConfirmSubmitButton
              className={OPS_DANGER_BUTTON_CLASS}
              confirmText="Confirm archive"
            >
              <Archive className="size-4" aria-hidden="true" />
              Archive
            </OpsConfirmSubmitButton>
          </form>
        ) : null}
      </div>
    </OpsCollapsible>
  );
}

export default async function OpsSiteChecklistsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (
    !canAccessOpsHref(auth.profile.role, "/ops/site-checklists", await fetchOpsModuleAccessOverrides()) ||
    !canViewOpsEngineeringControls(auth.profile.role)
  ) {
    notFound();
  }

  // The list used to be a hard `limit: 30` with nothing past it — a site that
  // ran more inspections than that simply could not reach the older ones.
  const listState = parseOpsListState(params, { defaultPageSize: 10 });
  const siteFilter = firstParam(params.site) ?? "";
  const requestedStatus = firstParam(params.status);
  const statusFilter: OpsQaInspectionStatus | "" = isQaStatus(requestedStatus)
    ? requestedStatus
    : "";

  const [runPage, stats, siteOptions] = await Promise.all([
    fetchPaginatedOpsQaChecklistRuns({
      listState,
      siteId: siteFilter || null,
      status: statusFilter || null,
    }),
    fetchOpsQaChecklistStats(),
    fetchActiveSiteOptions(),
  ]);
  const runs = runPage.items;

  const notice = checklistNotice(params);
  const canStart = canCreateOpsEngineeringControl(auth.profile.role);
  const templates = qaChecklistTemplateOptions();
  // Cards are collapsed by default; every action redirects with ?open=<id> so
  // the checklist you were working on comes back expanded.
  const openRunId = firstParam(params.open) ?? "";

  const listFilters: OpsListSelectFilter[] = [
    {
      label: "Site",
      name: "site",
      options: [
        { label: "All sites", value: "" },
        ...siteOptions.map((site) => ({ label: `${site.code} - ${site.name}`, value: site.id })),
      ],
      value: siteFilter,
    },
    {
      label: "Status",
      name: "status",
      options: [
        { label: "All statuses", value: "" },
        ...QA_STATUS_OPTIONS.map((status) => ({
          label: status.replace(/_/g, " "),
          value: status,
        })),
      ],
      value: statusFilter,
    },
  ];
  const hasActiveFilter =
    listState.query.length > 0 || siteFilter.length > 0 || statusFilter.length > 0;

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Engineering"
        title="Site checklists"
        description="Run the company inspection checklist for a construction process. Failures need a photo, and hold points must pass before the work is covered up."
      />

      {notice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-semibold ${
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/site-checklists"
          icon={ClipboardCheck}
          label="Open checklists"
          value={stats.open.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/site-checklists"
          icon={Lock}
          label="Blocked by hold point"
          tone={stats.blockedByHoldPoint > 0 ? "critical" : "good"}
          value={stats.blockedByHoldPoint.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/site-checklists"
          icon={AlertTriangle}
          label="Failed items"
          tone={stats.failedItems > 0 ? "warn" : "good"}
          value={stats.failedItems.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/site-checklists"
          icon={FileSignature}
          label="Awaiting PM sign-off"
          tone={stats.awaitingSignOff > 0 ? "warn" : "good"}
          value={stats.awaitingSignOff.toLocaleString("en-ZM")}
        />
      </section>

      {canStart && siteOptions.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Play className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">Start a checklist</h2>
              <p className="text-sm text-muted-foreground">
                The items are the company standard for that process — you never retype them.
              </p>
            </div>
          </div>
          <OpsOfflineForm
            action={startQaChecklistAction}
            className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"
            kind="qa_checklist.start"
            replayEndpoint="/api/ops/offline/qa-checklists"
            summary="Site checklist"
          >
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Construction process
              <select className={OPS_INPUT_CLASS} defaultValue="" name="template_key" required>
                <option value="" disabled>
                  Select a process
                </option>
                {templates.map((template) => (
                  <option key={template.value} value={template.value}>
                    {template.label} ({template.itemCount} checks, {template.holdPointCount} hold
                    points)
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Site
              <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                <option value="" disabled>
                  Select a site
                </option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.code} - {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Location on site
              <input className={OPS_INPUT_CLASS} name="location" placeholder="Block B, ground floor" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Date
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={todayInLusaka()}
                name="inspection_date"
                required
                type="date"
              />
            </label>
            <div className="flex items-end lg:col-span-4">
              <OpsSubmitButton
                className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`}
                pendingLabel="Starting..."
              >
                <Play className="size-4" aria-hidden="true" />
                Start checklist
              </OpsSubmitButton>
            </div>
          </OpsOfflineForm>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card" id="checklist-list">
        <OpsListControls
          action="/ops/site-checklists"
          filters={listFilters}
          params={params}
          placeholder="Inspection number, title or location"
          query={listState.query}
          resultLabel="checklists"
        />
        {runs.length > 0 ? (
          <div className="space-y-4 p-5">
            {runs.map((run) => (
              <ChecklistRunCard
                expanded={run.id === openRunId}
                key={run.id}
                role={auth.profile.role}
                run={run}
                userId={auth.profile.id}
              />
            ))}
          </div>
        ) : (
          <OpsEmptyState
            icon={ClipboardCheck}
            title={hasActiveFilter ? "No checklists match this search" : "No checklists yet"}
            description={
              hasActiveFilter
                ? "Clear the search, or pick a different site or status."
                : "Start one above. Every construction process has a standard set of checks ready to run."
            }
          />
        )}
        <OpsPaginationControls
          anchor="checklist-list"
          basePath="/ops/site-checklists"
          filters={listFilters}
          pagination={runPage.pagination}
          params={params}
          query={listState.query}
          resultLabel="checklists"
        />
      </section>
    </div>
  );
}
