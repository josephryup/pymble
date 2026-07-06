import { AlertOctagon, Award, GraduationCap, HardHat, ShieldCheck } from "lucide-react";
import { OpsStatTile, type OpsStatTileTone } from "@/components/ops/OpsStatTile";
import type { OpsHseComplianceSummary, OpsLtifrSummary } from "@/lib/ops/hse-kpis";
import { OPS_EYEBROW_CLASS } from "@/lib/ops/ui";

function pctTone(value: number | null, goodThreshold: number, warnThreshold: number): OpsStatTileTone {
  if (value === null) return "muted";
  if (value >= goodThreshold) return "good";
  if (value >= warnThreshold) return "warn";
  return "critical";
}

function rateTone(value: number | null, lowGood: number, highWarn: number): OpsStatTileTone {
  if (value === null) return "muted";
  if (value <= lowGood) return "good";
  if (value <= highWarn) return "warn";
  return "critical";
}

function scoreTone(value: number | null): OpsStatTileTone {
  if (value === null) return "muted";
  if (value >= 80) return "good";
  if (value >= 60) return "warn";
  return "critical";
}

export function OpsHseKpiPanel({
  compliance,
  ltifr,
}: {
  compliance: OpsHseComplianceSummary;
  ltifr: OpsLtifrSummary;
}) {
  return (
    <section className="rounded-lg border border-border border-l-4 border-l-emerald-500 bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className={OPS_EYEBROW_CLASS}>
            HSE KPIs
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
            Safety performance — last {ltifr.windowDays} days
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lost-time injury rate, Personal Protective Equipment compliance, audit/inspection scores, and training currency.
          </p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <OpsStatTile
          icon={AlertOctagon}
          iconClassName="text-red-600"
          label="LTIFR"
          sub={`${ltifr.lostTimeIncidents} LTI · ${ltifr.hoursWorked.toLocaleString("en-ZM")} hrs worked`}
          tone={rateTone(ltifr.ltifr, 5, 15)}
          value={ltifr.ltifr !== null ? ltifr.ltifr.toLocaleString("en-ZM") : "—"}
        />
        <OpsStatTile
          icon={AlertOctagon}
          iconClassName="text-amber-600"
          label="TRIFR (all recordable)"
          sub={`${ltifr.totalRecordable} recordable · ${ltifr.totalNearMisses} near-misses`}
          tone={rateTone(ltifr.trifr, 10, 30)}
          value={ltifr.trifr !== null ? ltifr.trifr.toLocaleString("en-ZM") : "—"}
        />
        <OpsStatTile
          icon={HardHat}
          label="Personal Protective Equipment compliance"
          sub={`${compliance.ppeIssued} of ${compliance.activeEmployees} active employees with PPE issued`}
          tone={pctTone(compliance.ppeCompliancePct, 90, 70)}
          value={compliance.ppeCompliancePct !== null ? `${compliance.ppeCompliancePct}%` : "—"}
        />
        <OpsStatTile
          icon={ShieldCheck}
          label="Inspection avg score"
          sub={`From ${compliance.inspectionsCount} completed inspection${compliance.inspectionsCount === 1 ? "" : "s"}`}
          tone={scoreTone(compliance.inspectionsAvgScore)}
          value={
            compliance.inspectionsAvgScore !== null
              ? `${compliance.inspectionsAvgScore}/100`
              : "—"
          }
        />
        <OpsStatTile
          icon={Award}
          label="Audit avg score"
          sub={`From ${compliance.auditsCount} completed audit${compliance.auditsCount === 1 ? "" : "s"}`}
          tone={scoreTone(compliance.auditsAvgScore)}
          value={compliance.auditsAvgScore !== null ? `${compliance.auditsAvgScore}/100` : "—"}
        />
        <OpsStatTile
          icon={GraduationCap}
          label="Training currency"
          sub={`${compliance.trainingCompletedCount} of ${compliance.trainingTotalCount} records in date`}
          tone={pctTone(compliance.trainingCompliancePct, 90, 70)}
          value={
            compliance.trainingCompliancePct !== null
              ? `${compliance.trainingCompliancePct}%`
              : "—"
          }
        />
      </div>
    </section>
  );
}
