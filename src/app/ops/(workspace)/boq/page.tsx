import { FileSpreadsheet, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { createBoqDocumentAction, createBoqLineItemAction } from "@/lib/ops/boq-actions";
import { fetchOpsBoqDocuments } from "@/lib/ops/boq";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref, canManageOps } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  formatZmw,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function boqNotice(params: OpsSearchParams) {
  const createdBoq = noticeFromParams(params, "boq", "BOQ document created.");

  if (createdBoq) {
    return createdBoq;
  }

  return noticeFromParams(params, "line", "BOQ line item added.");
}

export default async function OpsBoqPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/boq")) {
    notFound();
  }

  const [documents, siteOptions] = await Promise.all([
    fetchOpsBoqDocuments(),
    fetchActiveSiteOptions(),
  ]);
  const canManage = canManageOps(auth.profile.role);
  const notice = boqNotice(params);
  const totalBudgeted = documents.reduce((sum, document) => sum + document.budgeted_total, 0);
  const totalActual = documents.reduce((sum, document) => sum + document.actual_total, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble BOQ
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              BOQ builder
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Build project BOQs, track estimated totals, and compare actual quantities.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Documents
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {documents.length}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Budgeted
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {formatZmw(totalBudgeted)}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Actual
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {formatZmw(totalActual)}
              </p>
            </div>
          </div>
        </div>
      </section>

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

      {canManage ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">Create BOQ</h2>
              <p className="text-sm text-primary-dark/60">
                Create a Pymble BOQ header, then add measured line items below.
              </p>
            </div>
          </div>
          {siteOptions.length === 0 ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              Add at least one site before creating a BOQ.
            </div>
          ) : (
            <form
              action={createBoqDocumentAction}
              className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
            >
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Site
                <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                  <option value="" disabled>
                    Select Pymble site
                  </option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Version
                <input className={OPS_INPUT_CLASS} defaultValue="1" min="1" name="version" type="number" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Status
                <select className={OPS_INPUT_CLASS} defaultValue="draft" name="status">
                  <option value="draft">Draft</option>
                  <option value="issued">Issued</option>
                </select>
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <button
                  className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`}
                  type="submit"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Create document
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <section className="grid gap-5">
        {documents.length > 0 ? (
          documents.map((document) => (
            <div className="rounded-lg border border-primary-dark/10 bg-white" key={document.id}>
              <div className="border-b border-primary-dark/10 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-blue">
                      {document.site?.code ?? "Site code unavailable"} - v{document.version}
                    </p>
                    <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
                      {document.title}
                    </h2>
                    <p className="mt-1 text-sm text-primary-dark/60">
                      {document.site?.name ?? "Site record unavailable"} - {document.status}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Budgeted
                      </p>
                      <p className="mt-1 font-bold text-primary-dark">
                        {formatZmw(document.budgeted_total)}
                      </p>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Actual
                      </p>
                      <p className="mt-1 font-bold text-primary-dark">
                        {formatZmw(document.actual_total)}
                      </p>
                    </div>
                  </div>
                </div>

                {canManage ? (
                  <form
                    action={createBoqLineItemAction}
                    className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6"
                  >
                    <input name="boq_id" type="hidden" value={document.id} />
                    <label className={`${OPS_LABEL_CLASS} md:col-span-3 lg:col-span-2`}>
                      Description
                      <input
                        className={OPS_INPUT_CLASS}
                        name="description"
                        required
                      />
                    </label>
                    <label className={OPS_LABEL_CLASS}>
                      Unit
                      <input className={OPS_INPUT_CLASS} defaultValue="pcs" name="unit" required />
                    </label>
                    <label className={OPS_LABEL_CLASS}>
                      Quantity
                      <input
                        className={OPS_INPUT_CLASS}
                        min="0"
                        name="quantity"
                        required
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label className={OPS_LABEL_CLASS}>
                      Rate
                      <input
                        className={OPS_INPUT_CLASS}
                        min="0"
                        name="unit_rate"
                        required
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label className={OPS_LABEL_CLASS}>
                      Actual
                      <input
                        className={OPS_INPUT_CLASS}
                        min="0"
                        name="actual_quantity"
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <div className="flex items-end md:col-span-3 lg:col-span-6">
                      <button
                        className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                        type="submit"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>

              {document.items.length > 0 ? (
                <>
                  <div className="p-4 md:hidden">
                    <OpsMobileRecordList>
                      {document.items.map((item) => (
                        <OpsMobileRecordCard key={item.id}>
                          <div>
                            <p className="font-heading text-lg font-bold text-primary-dark">
                              {item.description}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                              {item.unit}
                            </p>
                          </div>
                          <OpsMobileRecordRow label="Quantity">{item.quantity}</OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Rate">
                            {formatZmw(item.unit_rate)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Actual">
                            {item.actual_quantity}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Total">
                            {formatZmw(item.budgeted_total)}
                          </OpsMobileRecordRow>
                        </OpsMobileRecordCard>
                      ))}
                    </OpsMobileRecordList>
                  </div>
                  <div
                    aria-label={`${document.title} BOQ line items table`}
                    className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
                    tabIndex={0}
                  >
                  <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
                    <caption className="sr-only">
                      BOQ line items for {document.title}, including quantity, rate, actuals, and total.
                    </caption>
                    <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
                      <tr>
                        <th className="px-5 py-3" scope="col">
                          Description
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Unit
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Qty
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Rate
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Actual
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-primary-dark/10">
                      {document.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-5 py-4 font-semibold text-primary-dark">
                            {item.description}
                          </td>
                          <td className="px-5 py-4 text-primary-dark/70">{item.unit}</td>
                          <td className="px-5 py-4 text-primary-dark/70">{item.quantity}</td>
                          <td className="px-5 py-4 text-primary-dark/70">
                            {formatZmw(item.unit_rate)}
                          </td>
                          <td className="px-5 py-4 text-primary-dark/70">
                            {item.actual_quantity}
                          </td>
                          <td className="px-5 py-4 font-semibold text-primary-dark">
                            {formatZmw(item.budgeted_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              ) : (
                <div className="flex min-h-32 items-center justify-center p-8 text-center text-sm text-primary-dark/60">
                  No line items added to this BOQ yet.
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-primary-dark/10 bg-white p-8 text-center">
            <FileSpreadsheet className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                No BOQ documents yet
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                Create a site first, then start your first BOQ document.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
