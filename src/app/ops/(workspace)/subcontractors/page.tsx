import { HardHat, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { createSubcontractorAction } from "@/lib/ops/subcontractor-actions";
import {
  canManageSubcontractor,
  canViewSubcontractors,
} from "@/lib/ops/subcontractor-permissions";
import { fetchOpsSubcontractors } from "@/lib/ops/subcontractors";
import {
  firstParam,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_SUCCESS_CLASS,
  OPS_NOTICE_ERROR_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsSubcontractorsPage({ searchParams }: PageProps) {
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  if (!canAccessOpsHref(profile.role, "/ops/subcontractors")) notFound();
  if (!canViewSubcontractors(profile.role)) notFound();

  const subs = await fetchOpsSubcontractors();
  const canCreate = canManageSubcontractor(profile.role);
  const notice = noticeFromParams(search, "subcontractor", "Subcontractor added.");
  const error = firstParam(search.error);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh
        tables={["subcontractors", "subcontractor_assignments", "subcontractor_payments"]}
      />
      <OpsPageHeader
        eyebrow="Subcontractors"
        title="Subcontractor register"
        description="Onboard subcontractor companies and general (individual) subcontractors, capture KYC details, allocate them to project tasks, and track interim and retention payments."
      />

      {error ? (
        <div className={OPS_NOTICE_ERROR_CLASS} role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className={OPS_NOTICE_SUCCESS_CLASS}>
          {notice.message}
        </div>
      ) : null}

      {canCreate ? (
        <details className="rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold text-foreground">
            <Plus className="size-4" aria-hidden="true" />
            Add a subcontractor
          </summary>
          <form
            action={createSubcontractorAction}
            className="grid gap-3 border-t border-border p-5 md:grid-cols-3"
          >
            <label className={OPS_LABEL_CLASS}>
              Type
              <select className={OPS_INPUT_CLASS} defaultValue="company" name="kind">
                <option value="company">Company</option>
                <option value="general">General (individual)</option>
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Name
              <input
                className={OPS_INPUT_CLASS}
                name="company_name"
                placeholder="Company or individual name"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Trade specialty
              <input
                className={OPS_INPUT_CLASS}
                name="trade_specialty"
                placeholder="e.g. Electrical"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact name
              <input className={OPS_INPUT_CLASS} name="contact_name" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact phone
              <input className={OPS_INPUT_CLASS} name="contact_phone" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact email
              <input className={OPS_INPUT_CLASS} name="contact_email" type="email" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              TPIN
              <input className={OPS_INPUT_CLASS} name="tpin" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Registration number
              <input className={OPS_INPUT_CLASS} name="registration_number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue="prospect" name="status">
                <option value="prospect">Prospect</option>
                <option value="kyc_pending">KYC Pending</option>
                <option value="approved">Approved</option>
                <option value="suspended">Suspended</option>
                <option value="blacklisted">Blacklisted</option>
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Retention %
              <input
                className={OPS_INPUT_CLASS}
                defaultValue="5"
                max="50"
                min="0"
                name="retention_percent"
                step="0.5"
                type="number"
              />
            </label>
            <div className="md:col-span-3">
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Add subcontractor
              </button>
            </div>
          </form>
        </details>
      ) : null}

      {subs.length === 0 ? (
        <OpsEmptyState
          icon={HardHat}
          title="No subcontractors yet"
          description={
            canCreate
              ? "Add a subcontractor to the register, complete KYC, and start allocating them to tasks."
              : "Operations Manager or Projects Manager will populate the register first."
          }
          actions={[]}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {subs.map((sub) => (
            <li
              key={sub.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {sub.trade_specialty || "—"}
              </p>
              <h2 className="mt-1 font-heading text-lg font-bold text-foreground">
                <Link className="hover:underline" href={`/ops/subcontractors/${sub.id}`}>
                  {sub.company_name}
                </Link>
              </h2>
              <span
                className={`mt-2 ${opsStatusBadgeClass(sub.status)}`}
              >
                {sub.status.replace("_", " ")}
              </span>
              {sub.kind === "general" ? (
                <span className="mt-2 ml-2 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-indigo-700">
                  Individual
                </span>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Retention {sub.retention_percent}% · {sub.contact_name || "no contact"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
