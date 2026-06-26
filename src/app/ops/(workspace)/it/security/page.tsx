import { DatabaseBackup, Plus, ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { canManageIT } from "@/lib/ops/it-permissions";
import {
  fetchOpsItBackupRecords,
  fetchOpsItSecurityIncidents,
  fetchOpsItSecurityStats,
} from "@/lib/ops/it-security";
import {
  archiveItBackupRecordAction,
  archiveItSecurityIncidentAction,
  createItBackupRecordAction,
  createItSecurityIncidentAction,
  setItBackupStatusAction,
  setItSecurityIncidentStatusAction,
} from "@/lib/ops/it-security-actions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import type { OpsItBackupStatus, OpsItIncidentSeverity, OpsItIncidentStatus } from "@/lib/ops/types";
import {
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

const SEVERITY_LABELS: Record<OpsItIncidentSeverity, string> = {
  critical: "Critical",
  high: "High",
  low: "Low",
  medium: "Medium",
};

const SEVERITY_BADGE: Record<OpsItIncidentSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  low: "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65",
  medium: "border-sky-200 bg-sky-50 text-sky-700",
};

const INCIDENT_STATUS_LABELS: Record<OpsItIncidentStatus, string> = {
  investigating: "Investigating",
  open: "Open",
  resolved: "Resolved",
};

const BACKUP_STATUS_LABELS: Record<OpsItBackupStatus, string> = {
  failed: "Failed",
  in_progress: "In progress",
  success: "Success",
};

const BACKUP_STATUS_BADGE: Record<OpsItBackupStatus, string> = {
  failed: "border-red-200 bg-red-50 text-red-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default async function OpsItSecurityPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/security")) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const [incidents, backups, stats] = await Promise.all([
    fetchOpsItSecurityIncidents(),
    fetchOpsItBackupRecords(),
    fetchOpsItSecurityStats(),
  ]);
  const notice =
    noticeFromParams(params, "incident", "Incident logged.") ??
    noticeFromParams(params, "backup", "Backup record added.");

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["it_security_incidents", "it_backup_records"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Security & Backups"
        description="Log cybersecurity incidents and keep backup job status visible so data protection never drifts."
      />

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[720px]:grid-cols-2">
        <OpsKpiCard href="/ops/it/security" icon={ShieldAlert} label="Open incidents" tone={stats.open_incidents > 0 ? "warn" : "good"} value={stats.open_incidents.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/security" icon={DatabaseBackup} label="Failed backups" tone={stats.failed_backups > 0 ? "warn" : "good"} value={stats.failed_backups.toLocaleString("en-ZM")} />
      </section>

      {/* Incidents */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">
          <ShieldAlert className="size-4" aria-hidden="true" /> Security incidents
        </h2>
        {canManage ? (
          <form action={createItSecurityIncidentAction} className="grid gap-3 rounded-xl border border-primary-dark/10 bg-white p-4 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Title<input className={OPS_INPUT_CLASS} name="title" placeholder="e.g. Phishing email reported" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-1`}>Severity<select className={OPS_INPUT_CLASS} defaultValue="medium" name="severity">{Object.entries(SEVERITY_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Summary<input className={OPS_INPUT_CLASS} name="summary" /></label>
            <div className="flex items-end lg:col-span-6 lg:justify-end"><button className={OPS_PRIMARY_BUTTON_CLASS} type="submit"><Plus className="size-4" aria-hidden="true" />Log incident</button></div>
          </form>
        ) : null}
        {incidents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-primary-dark/15 bg-white p-4 text-sm text-primary-dark/55">No security incidents logged. Good.</p>
        ) : (
          <ul className="space-y-2">
            {incidents.map((incident) => (
              <li key={incident.id} className="rounded-xl border border-primary-dark/10 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-bold text-primary-dark">{incident.title}</h3>
                    <p className="mt-1 text-xs text-primary-dark/55">Detected {incident.detected_at}{incident.resolved_at ? ` · Resolved ${incident.resolved_at}` : ""}{incident.summary ? ` · ${incident.summary}` : ""}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${SEVERITY_BADGE[incident.severity]}`}>{SEVERITY_LABELS[incident.severity]}</span>
                    <span className="text-[11px] font-semibold text-primary-dark/55">{INCIDENT_STATUS_LABELS[incident.status]}</span>
                  </div>
                </div>
                {canManage ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-primary-dark/10 pt-3">
                    <form action={setItSecurityIncidentStatusAction} className="flex items-end gap-2">
                      <input name="incident_id" type="hidden" value={incident.id} />
                      <label className={OPS_LABEL_CLASS}>Status<select className={OPS_INPUT_CLASS} defaultValue={incident.status} name="status">{Object.entries(INCIDENT_STATUS_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
                      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Update</button>
                    </form>
                    <form action={archiveItSecurityIncidentAction}>
                      <input name="incident_id" type="hidden" value={incident.id} />
                      <button className={OPS_DANGER_BUTTON_CLASS} type="submit">Archive</button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Backups */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">
          <DatabaseBackup className="size-4" aria-hidden="true" /> Backup jobs
        </h2>
        {canManage ? (
          <form action={createItBackupRecordAction} className="grid gap-3 rounded-xl border border-primary-dark/10 bg-white p-4 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Job name<input className={OPS_INPUT_CLASS} name="name" placeholder="e.g. Nightly DB backup" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Target<input className={OPS_INPUT_CLASS} name="target" placeholder="e.g. Cloudflare R2 + NAS" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-1`}>Frequency<input className={OPS_INPUT_CLASS} name="frequency" placeholder="Daily" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-1`}>Status<select className={OPS_INPUT_CLASS} defaultValue="success" name="status">{Object.entries(BACKUP_STATUS_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
            <div className="flex items-end lg:col-span-6 lg:justify-end"><button className={OPS_PRIMARY_BUTTON_CLASS} type="submit"><Plus className="size-4" aria-hidden="true" />Add backup job</button></div>
          </form>
        ) : null}
        {backups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-primary-dark/15 bg-white p-4 text-sm text-primary-dark/55">No backup jobs recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {backups.map((backup) => (
              <li key={backup.id} className="rounded-xl border border-primary-dark/10 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-bold text-primary-dark">{backup.name}</h3>
                    <p className="mt-1 text-xs text-primary-dark/55">{backup.target || "—"}{backup.frequency ? ` · ${backup.frequency}` : ""}{backup.last_run_at ? ` · Last run ${backup.last_run_at.slice(0, 10)}` : ""}</p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${BACKUP_STATUS_BADGE[backup.status]}`}>{BACKUP_STATUS_LABELS[backup.status]}</span>
                </div>
                {canManage ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-primary-dark/10 pt-3">
                    <form action={setItBackupStatusAction} className="flex items-end gap-2">
                      <input name="backup_id" type="hidden" value={backup.id} />
                      <label className={OPS_LABEL_CLASS}>Status<select className={OPS_INPUT_CLASS} defaultValue={backup.status} name="status">{Object.entries(BACKUP_STATUS_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
                      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Update</button>
                    </form>
                    <form action={archiveItBackupRecordAction}>
                      <input name="backup_id" type="hidden" value={backup.id} />
                      <button className={OPS_DANGER_BUTTON_CLASS} type="submit">Archive</button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
