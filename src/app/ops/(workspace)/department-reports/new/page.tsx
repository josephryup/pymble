import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import { createDepartmentReportAction } from "@/lib/ops/department-report-actions";
import {
  canSubmitDepartmentReport,
  listAccessibleDepartments,
  OPS_DEPARTMENT_LABELS,
} from "@/lib/ops/department-report-permissions";
import {
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

export default async function OpsNewDepartmentReportPage() {
  const { profile } = await requireOpsUser();
  if (!canSubmitDepartmentReport(profile.role)) {
    notFound();
  }
  const departments = listAccessibleDepartments(profile.role);
  if (departments.length === 0) notFound();

  return (
    <div className="w-full max-w-3xl space-y-6">
      <OpsPageHeader
        eyebrow="Department reporting"
        title="Draft a new department report"
        description="Start a draft for your department. Save it, then submit it when ready for the Managing Director and General Manager to review."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/department-reports">
            All reports
          </Link>
        }
      />
      <form
        action={createDepartmentReportAction}
        className="space-y-4 rounded-2xl border border-primary-dark/10 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className={OPS_LABEL_CLASS}>
            Department
            <select className={OPS_INPUT_CLASS} defaultValue={departments[0]} name="department">
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {OPS_DEPARTMENT_LABELS[dept]}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Period
            <select className={OPS_INPUT_CLASS} defaultValue="monthly" name="period">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="ad_hoc">Ad hoc</option>
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Period start
            <input
              className={OPS_INPUT_CLASS}
              name="period_start_date"
              required
              type="date"
            />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Period end
            <input
              className={OPS_INPUT_CLASS}
              name="period_end_date"
              required
              type="date"
            />
          </label>
        </div>
        <label className={OPS_LABEL_CLASS}>
          Title
          <input
            className={OPS_INPUT_CLASS}
            maxLength={200}
            name="title"
            placeholder="e.g. May 2026 Operations Report"
            required
          />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Narrative
          <textarea
            className={`${OPS_INPUT_CLASS} min-h-40`}
            maxLength={20000}
            name="narrative"
            placeholder="Highlights, risks, progress against plan, key decisions needed..."
            rows={10}
          />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Key metrics (JSON, optional)
          <textarea
            className={`${OPS_INPUT_CLASS} min-h-24 font-mono text-xs`}
            name="metrics_json"
            placeholder='{"sites_active": 4, "labour_hours": 1850}'
            rows={4}
          />
        </label>
        <div className="flex items-center gap-3">
          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
            Save draft
          </button>
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/department-reports">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
