import { Archive, ArchiveRestore, Plus, Receipt, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  archiveCustomerAction,
  createCustomerAction,
  reactivateCustomerAction,
} from "@/lib/ops/customer-actions";
import {
  canArchiveOpsCustomer,
  canCreateOpsCustomer,
  canReactivateOpsCustomer,
} from "@/lib/ops/customer-permissions";
import {
  fetchOpsCustomerStats,
  fetchPaginatedOpsCustomers,
} from "@/lib/ops/customers";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import type { OpsCustomerStatus } from "@/lib/ops/types";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import { formatOpsLabel as formatLabel } from "@/lib/ops/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const CUSTOMER_STATUS_OPTIONS: Array<{ label: string; value: OpsCustomerStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];

function statusFromParam(value: string | undefined) {
  return CUSTOMER_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsCustomerStatus | "")
    : "";
}

function customerNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "customer", "Customer added to the register.");
  if (created) {
    return created;
  }

  if (firstParam(params.updated) === "archived") {
    return { message: "Customer archived.", tone: "success" as const };
  }
  if (firstParam(params.updated) === "reactivated") {
    return { message: "Customer reactivated and set to active.", tone: "success" as const };
  }

  return null;
}

export default async function OpsCustomersPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/customers", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 10 });
  const status = statusFromParam(firstParam(params.status));
  const canCreate = canCreateOpsCustomer(auth.profile.role);
  const [customerPage, customerStats] = await Promise.all([
    fetchPaginatedOpsCustomers({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchOpsCustomerStats(),
  ]);
  const customers = customerPage.items;
  const notice = customerNotice(params);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsPageHeader
        eyebrow="Finance and Accounts"
        title="Customers"
        description="The customer master behind client invoices — legal identity, TPIN, and contact details for accounts receivable."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/invoices">
              <Receipt className="size-4" aria-hidden="true" />
              Invoices
            </Link>
            {canCreate ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href="#customer-create-panel">
                <Plus className="size-4" aria-hidden="true" />
                Add customer
              </a>
            ) : null}
          </>
        }
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

      <section className="grid gap-4 min-[720px]:grid-cols-3">
        <OpsKpiCard
          href="/ops/customers?status=active"
          icon={ShieldCheck}
          label="Active customers"
          tone="good"
          hint="Billable"
          value={customerStats.active.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/customers?status=archived"
          icon={Archive}
          label="Archived"
          value={customerStats.archived.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/customers"
          icon={Users}
          label="Total customers"
          hint="Register"
          value={customerStats.total.toLocaleString("en-ZM")}
        />
      </section>

      {canCreate ? (
        <details
          className="rounded-lg border border-border bg-card"
          id="customer-create-panel"
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                <Users className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-lg font-bold text-foreground">
                  Add customer
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Expand to register a new billable client for invoicing.
                </span>
              </span>
            </span>
            <Plus className="size-5 shrink-0 text-primary-blue" aria-hidden="true" />
          </summary>
          <form
            action={createCustomerAction}
            className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
          >
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Legal name
              <input className={OPS_INPUT_CLASS} name="legal_name" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Trading name
              <input className={OPS_INPUT_CLASS} name="trading_name" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              TPIN
              <input className={OPS_INPUT_CLASS} name="tpin" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Email
              <input className={OPS_INPUT_CLASS} name="email" type="email" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Phone
              <input className={OPS_INPUT_CLASS} name="phone" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Address
              <input className={OPS_INPUT_CLASS} name="address_line" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              City
              <input className={OPS_INPUT_CLASS} name="city" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Country
              <input className={OPS_INPUT_CLASS} defaultValue="Zambia" name="country" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-6`}>
              Notes
              <input className={OPS_INPUT_CLASS} name="notes" />
            </label>
            <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6 lg:justify-end">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Add customer
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <OpsDashboardPanel
        actions={<Users className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />}
        eyebrow="Customer records"
        title="Register"
      >
        <div className="-mx-5 -mb-5">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <p className="text-sm text-muted-foreground">
              {customerPage.pagination.total} matching customer records.
            </p>
          </div>
          <OpsListControls
            action="/ops/customers"
            filters={[
              {
                label: "Status",
                name: "status",
                options: CUSTOMER_STATUS_OPTIONS,
                value: status,
              },
            ]}
            placeholder="Search customer, TPIN, email, phone, or city"
            query={listState.query}
            resultLabel="customers"
          />

          {customers.length > 0 ? (
            <div className="divide-y divide-border">
              {customers.map((customer) => {
                const canMutate = canArchiveOpsCustomer(auth.profile.role, customer);
                const canReactivate = canReactivateOpsCustomer(auth.profile.role, customer);

                return (
                  <article className="p-5" key={customer.id}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading text-lg font-bold text-foreground">
                            {customer.customer_code}
                          </h3>
                          <span
                            className={opsStatusBadgeClass(customer.status)}
                          >
                            {formatLabel(customer.status)}
                          </span>
                        </div>
                        <p className="mt-2 font-bold text-foreground">{customer.legal_name}</p>
                        {customer.trading_name ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Trading as {customer.trading_name}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {[customer.address_line, customer.city, customer.country]
                            .filter(Boolean)
                            .join(", ") || "Address not recorded"}
                        </p>
                      </div>
                      <div className="grid gap-2 min-[520px]:grid-cols-2 lg:min-w-56 lg:grid-cols-1">
                        {canMutate ? (
                          <form action={archiveCustomerAction}>
                            <input name="customer_id" type="hidden" value={customer.id} />
                            <input name="confirm" type="hidden" value="archive" />
                            <OpsConfirmSubmitButton
                              className={`${OPS_DANGER_BUTTON_CLASS} w-full`}
                              confirmText="Confirm archive"
                            >
                              <Archive className="size-4" aria-hidden="true" />
                              Archive
                            </OpsConfirmSubmitButton>
                          </form>
                        ) : null}
                        {canReactivate ? (
                          <form action={reactivateCustomerAction}>
                            <input name="customer_id" type="hidden" value={customer.id} />
                            <OpsConfirmSubmitButton
                              className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
                              confirmText="Confirm reactivate"
                            >
                              <ArchiveRestore className="size-4" aria-hidden="true" />
                              Reactivate
                            </OpsConfirmSubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-md border border-border px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          TPIN
                        </dt>
                        <dd className="mt-1 font-bold text-foreground">
                          {customer.tpin || "Not recorded"}
                        </dd>
                      </div>
                      <div className="rounded-md border border-border px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Email
                        </dt>
                        <dd className="mt-1 truncate font-bold text-foreground">
                          {customer.email || "Not recorded"}
                        </dd>
                      </div>
                      <div className="rounded-md border border-border px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Phone
                        </dt>
                        <dd className="mt-1 font-bold text-foreground">
                          {customer.phone || "Not recorded"}
                        </dd>
                      </div>
                    </dl>

                    {customer.notes ? (
                      <p className="mt-4 rounded-md border border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
                        {customer.notes}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <OpsEmptyState
              icon={Users}
              title={hasActiveListFilter ? "No customers match these filters" : "No customers yet"}
              description={
                hasActiveListFilter
                  ? "Try clearing the search or switching the status filter."
                  : "Add the first customer so invoices can link to a proper accounts-receivable record."
              }
              actions={
                hasActiveListFilter
                  ? [{ href: "/ops/customers", label: "Clear filters" }]
                  : canCreate
                    ? [{ href: "#customer-create-panel", label: "Add the first customer" }]
                    : [{ href: "/ops/invoices", label: "Back to invoices", variant: "secondary" }]
              }
            />
          )}
          <OpsPaginationControls
            basePath="/ops/customers"
            filters={[
              {
                label: "Status",
                name: "status",
                options: [],
                value: status,
              },
            ]}
            pagination={customerPage.pagination}
            query={listState.query}
            resultLabel="customers"
          />
        </div>
      </OpsDashboardPanel>
    </div>
  );
}
