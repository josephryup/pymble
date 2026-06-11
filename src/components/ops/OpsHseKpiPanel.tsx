import { AlertOctagon, Award, GraduationCap, HardHat, ShieldCheck } from "lucide-react";
import type { OpsHseComplianceSummary, OpsLtifrSummary } from "@/lib/ops/hse-kpis";

function pctClass(value: number | null, goodThreshold: number, warnThreshold: number) {
  if (value === null) return "text-primary-dark/45";
  if (value >= goodThreshold) return "text-emerald-700";
  if (value >= warnThreshold) return "text-amber-700";
  return "text-red-700";
}

function rateClass(value: number | null, lowGood: number, highWarn: number) {
  if (value === null) return "text-primary-dark/45";
  if (value <= lowGood) return "text-emerald-700";
  if (value <= highWarn) return "text-amber-700";
  return "text-red-700";
}

function scoreClass(value: number | null) {
  if (value === null) return "text-primary-dark/45";
  if (value >= 80) return "text-emerald-700";
  if (value >= 60) return "text-amber-700";
  return "text-red-700";
}

export function OpsHseKpiPanel({
  compliance,
  ltifr,
}: {
  compliance: OpsHseComplianceSummary;
  ltifr: OpsLtifrSummary;
}) {
  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            HSE KPIs
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
            Safety performance — last {ltifr.windowDays} days
          </h2>
          <p className="mt-1 text-sm text-primary-dark/60">
            Lost-time injury rate, PPE compliance, audit/inspection scores, and training currency.
          </p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            LTIFR
            <AlertOctagon className="size-3.5 text-red-600" aria-hidden="true" />
          </p>
          <p className={`mt-1 font-heading text-2xl font-bold ${rateClass(ltifr.ltifr, 5, 15)}`}>
            {ltifr.ltifr !== null ? ltifr.ltifr.toLocaleString("en-ZM") : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            {ltifr.lostTimeIncidents} LTI · {ltifr.hoursWorked.toLocaleString("en-ZM")} hrs worked
          </p>
        </article>

        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            TRIFR (all recordable)
            <AlertOctagon className="size-3.5 text-amber-600" aria-hidden="true" />
          </p>
          <p className={`mt-1 font-heading text-2xl font-bold ${rateClass(ltifr.trifr, 10, 30)}`}>
            {ltifr.trifr !== null ? ltifr.trifr.toLocaleString("en-ZM") : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            {ltifr.totalRecordable} recordable · {ltifr.totalNearMisses} near-misses
          </p>
        </article>

        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            PPE compliance
            <HardHat className="size-3.5 text-primary-blue" aria-hidden="true" />
          </p>
          <p className={`mt-1 font-heading text-2xl font-bold ${pctClass(compliance.ppeCompliancePct, 90, 70)}`}>
            {compliance.ppeCompliancePct !== null ? `${compliance.ppeCompliancePct}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            {compliance.ppeIssued} of {compliance.activeEmployees} active employees with PPE issued
          </p>
        </article>

        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            Inspection avg score
            <ShieldCheck className="size-3.5 text-primary-blue" aria-hidden="true" />
          </p>
          <p className={`mt-1 font-heading text-2xl font-bold ${scoreClass(compliance.inspectionsAvgScore)}`}>
            {compliance.inspectionsAvgScore !== null
              ? `${compliance.inspectionsAvgScore}/100`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            From {compliance.inspectionsCount} completed inspection
            {compliance.inspectionsCount === 1 ? "" : "s"}
          </p>
        </article>

        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            Audit avg score
            <Award className="size-3.5 text-primary-blue" aria-hidden="true" />
          </p>
          <p className={`mt-1 font-heading text-2xl font-bold ${scoreClass(compliance.auditsAvgScore)}`}>
            {compliance.auditsAvgScore !== null ? `${compliance.auditsAvgScore}/100` : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            From {compliance.auditsCount} completed audit{compliance.auditsCount === 1 ? "" : "s"}
          </p>
        </article>

        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            Training currency
            <GraduationCap className="size-3.5 text-primary-blue" aria-hidden="true" />
          </p>
          <p className={`mt-1 font-heading text-2xl font-bold ${pctClass(compliance.trainingCompliancePct, 90, 70)}`}>
            {compliance.trainingCompliancePct !== null
              ? `${compliance.trainingCompliancePct}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            {compliance.trainingCompletedCount} of {compliance.trainingTotalCount} records in date
          </p>
        </article>
      </div>
    </section>
  );
}
