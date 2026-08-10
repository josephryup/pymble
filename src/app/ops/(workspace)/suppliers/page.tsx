import {
  Archive,
  ArchiveRestore,
  Boxes,
  Building2,
  CalendarDays,
  Mail,
  PauseCircle,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsSupplierScorecardPanel } from "@/components/ops/OpsProcurementKpiPanels";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchOpsSupplierScorecards } from "@/lib/ops/procurement-kpis";
import {
  addSupplierPerformanceEventAction,
  addSupplierContactAction,
  archiveSupplierAction,
  createSupplierAction,
  reactivateSupplierAction,
  updateSupplierStatusAction,
} from "@/lib/ops/supplier-actions";
import {
  canCreateOpsSupplier,
  canCreateOpsSupplierPerformanceEvent,
  canManageOpsSupplier,
} from "@/lib/ops/supplier-permissions";
import { fetchActiveSiteOptions, type OpsSiteOption } from "@/lib/ops/sites";
import {
  fetchOpsSupplierStats,
  fetchPaginatedOpsSuppliers,
  type OpsSupplierPerformanceEventSummary,
  type OpsSupplierSummary,
} from "@/lib/ops/suppliers";
import type {
  OpsSupplierKind,
  OpsSupplierPerformanceEventType,
  OpsSupplierStatus,
} from "@/lib/ops/types";
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
import { formatOpsLabel as formatLabel, formatOpsDate as formatDate } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const SUPPLIER_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsSupplierStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "active" },
  { label: "On hold", value: "on_hold" },
  { label: "Archived", value: "archived" },
];

const SUPPLIER_KIND_OPTIONS: Array<{
  label: string;
  value: OpsSupplierKind | "";
}> = [
  { label: "All kinds", value: "" },
  { label: "Vendors", value: "vendor" },
  { label: "Subcontractors", value: "subcontractor" },
  { label: "Both", value: "both" },
];

function supplierKindFromParam(value: string | undefined) {
  return SUPPLIER_KIND_OPTIONS.some((kind) => kind.value === value)
    ? (value as OpsSupplierKind | "")
    : "";
}

function kindLabel(kind: OpsSupplierKind) {
  switch (kind) {
    case "subcontractor":
      return "Subcontractor";
    case "both":
      return "Vendor & Sub";
    default:
      return "Vendor";
  }
}

function kindClass(kind: OpsSupplierKind) {
  switch (kind) {
    case "subcontractor":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "both":
      return "border-purple-200 bg-purple-50 text-purple-700";
    default:
      return "border-primary-blue/20 bg-primary-blue/10 text-primary-blue";
  }
}

const SUPPLIER_CATEGORY_OPTIONS = [
  { label: "General", value: "general" },
  { label: "Building materials", value: "building_materials" },
  { label: "Plant and equipment", value: "plant_equipment" },
  { label: "Fuel", value: "fuel" },
  { label: "Subcontractor", value: "subcontractor" },
  { label: "Transport", value: "transport" },
  { label: "Safety", value: "safety" },
  { label: "Office and admin", value: "office_admin" },
];

const SUPPLIER_PERFORMANCE_EVENT_TYPE_OPTIONS: Array<{
  label: string;
  value: OpsSupplierPerformanceEventType;
}> = [
  { label: "Delivery", value: "delivery" },
  { label: "Quality", value: "quality" },
  { label: "Commercial", value: "commercial" },
  { label: "Safety", value: "safety" },
  { label: "Communication", value: "communication" },
  { label: "Compliance", value: "compliance" },
  { label: "General", value: "general" },
];

function supplierStatusFromParam(value: string | undefined) {
  return SUPPLIER_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsSupplierStatus | "")
    : "";
}

function supplierNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "supplier", "Supplier added to the register.");

  if (created) {
    return created;
  }

  if (firstParam(params.updated) === "contact_added") {
    return {
      message: "Supplier contact added.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "status") {
    return {
      message: "Supplier status updated.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "archived") {
    return {
      message: "Supplier archived.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "reactivated") {
    return {
      message: "Supplier reactivated and set to active.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "attachment") {
    return {
      message: "Supplier attachment uploaded.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "comment") {
    return {
      message: "Supplier comment added.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "performance_event") {
    return {
      message: "Supplier performance event logged.",
      tone: "success" as const,
    };
  }

  return null;
}

function performanceClass(rating: number) {
  if (rating >= 4) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (rating === 3) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function primaryContact(supplier: OpsSupplierSummary) {
  return supplier.contacts.find((contact) => contact.is_primary) ?? supplier.contacts[0] ?? null;
}

function SupplierContactList({ supplier }: { supplier: OpsSupplierSummary }) {
  if (supplier.contacts.length === 0) {
    return (
      <OpsInlineEmpty>No contacts recorded.</OpsInlineEmpty>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {supplier.contacts.map((contact) => (
        <li className="grid gap-2 px-3 py-3 min-[640px]:grid-cols-[1fr_auto]" key={contact.id}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-foreground">{contact.full_name}</p>
              {contact.is_primary ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                  Primary
                </span>
              ) : null}
            </div>
            {contact.role_title ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {contact.role_title}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground min-[640px]:justify-end">
            {contact.email ? (
              <a className="inline-flex items-center gap-1 hover:text-primary-blue" href={`mailto:${contact.email}`}>
                <Mail className="size-4" aria-hidden="true" />
                {contact.email}
              </a>
            ) : null}
            {contact.phone ? (
              <a className="inline-flex items-center gap-1 hover:text-primary-blue" href={`tel:${contact.phone}`}>
                <Phone className="size-4" aria-hidden="true" />
                {contact.phone}
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SupplierPerformanceList({
  events,
}: {
  events: OpsSupplierPerformanceEventSummary[];
}) {
  if (events.length === 0) {
    return (
      <OpsInlineEmpty>No performance events logged yet.</OpsInlineEmpty>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {events.slice(0, 5).map((event) => (
        <li className="grid gap-2 px-3 py-3" key={event.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-foreground">{event.title}</p>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${performanceClass(
                    event.rating,
                  )}`}
                >
                  {event.rating}/5
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {formatLabel(event.event_type)}
                {event.site ? ` / ${event.site.code}` : ""}
              </p>
            </div>
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatDate(event.event_date)}
            </p>
          </div>
          {event.description ? (
            <p className="text-sm leading-6 text-muted-foreground">{event.description}</p>
          ) : null}
          {event.author ? (
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Logged by {event.author.full_name}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AddSupplierPerformanceEventForm({
  siteOptions,
  supplierId,
}: {
  siteOptions: OpsSiteOption[];
  supplierId: string;
}) {
  return (
    <details className="rounded-md border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
        <Star className="size-4" aria-hidden="true" />
        Log performance
      </summary>
      <form
        action={addSupplierPerformanceEventAction}
        className="grid gap-3 border-t border-border p-3"
      >
        <input name="supplier_id" type="hidden" value={supplierId} />
        <label className={OPS_LABEL_CLASS}>
          Type
          <select className={OPS_INPUT_CLASS} defaultValue="general" name="event_type">
            {SUPPLIER_PERFORMANCE_EVENT_TYPE_OPTIONS.map((eventType) => (
              <option key={eventType.value} value={eventType.value}>
                {eventType.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-1">
          <label className={OPS_LABEL_CLASS}>
            Rating
            <select className={OPS_INPUT_CLASS} defaultValue="" name="rating" required>
              <option value="">Select rating</option>
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Good</option>
              <option value="3">3 - Acceptable</option>
              <option value="2">2 - Needs attention</option>
              <option value="1">1 - Serious concern</option>
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Date
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={new Date().toISOString().slice(0, 10)}
              name="event_date"
              type="date"
            />
          </label>
        </div>
        <label className={OPS_LABEL_CLASS}>
          Site
          <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
            <option value="">No site</option>
            {siteOptions.map((site) => (
              <option key={site.id} value={site.id}>
                {site.code} - {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className={OPS_LABEL_CLASS}>
          Title
          <input className={OPS_INPUT_CLASS} name="title" required />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Notes
          <textarea className={`${OPS_INPUT_CLASS} min-h-24 resize-y`} name="description" />
        </label>
        <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
          <Plus className="size-4" aria-hidden="true" />
          Save event
        </button>
      </form>
    </details>
  );
}

function AddSupplierContactForm({ supplierId }: { supplierId: string }) {
  return (
    <details className="rounded-md border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
        <UserPlus className="size-4" aria-hidden="true" />
        Add contact
      </summary>
      <form
        action={addSupplierContactAction}
        className="grid gap-3 border-t border-border p-3 min-[520px]:grid-cols-2 lg:grid-cols-4"
      >
        <input name="supplier_id" type="hidden" value={supplierId} />
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Name
          <input className={OPS_INPUT_CLASS} name="full_name" required />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Role
          <input className={OPS_INPUT_CLASS} name="role_title" />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Email
          <input className={OPS_INPUT_CLASS} name="email" type="email" />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Phone
          <input className={OPS_INPUT_CLASS} name="phone" />
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-bold text-foreground lg:col-span-2">
          <input className="size-4 accent-primary-blue" name="is_primary" type="checkbox" />
          Set primary contact
        </label>
        <div className="flex items-end lg:col-span-2">
          <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        </div>
      </form>
    </details>
  );
}

export default async function OpsSuppliersPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/suppliers", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = supplierStatusFromParam(firstParam(params.status));
  const kind = supplierKindFromParam(firstParam(params.kind));
  const canCreate = canCreateOpsSupplier(auth.profile.role);
  const canManage = canManageOpsSupplier(auth.profile.role);
  const canLogPerformance = canCreateOpsSupplierPerformanceEvent(auth.profile.role);
  const [supplierPage, supplierStats, siteOptions, supplierScorecards] = await Promise.all([
    fetchPaginatedOpsSuppliers({
      listState,
      query: listState.query,
      status: status || undefined,
      kind: kind || undefined,
    }),
    fetchOpsSupplierStats(),
    canLogPerformance ? fetchActiveSiteOptions() : Promise.resolve([]),
    fetchOpsSupplierScorecards(),
  ]);
  const suppliers = supplierPage.items;
  const notice = supplierNotice(params);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status) || Boolean(kind);

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsPageHeader
        eyebrow="Procurement master data"
        title="Suppliers"
        description="Approved supplier records, contacts, status control, performance evidence, and linked documents for Request for Quotation, Purchase Order, delivery, and payment workflows."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/rfq-po">
              <Boxes className="size-4" aria-hidden="true" />
              Requests for Quotation and Purchase Orders
            </Link>
            {canCreate ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href="#supplier-create-panel">
                <Plus className="size-4" aria-hidden="true" />
                Add supplier
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
          href="/ops/suppliers?status=active"
          icon={ShieldCheck}
          label="Active suppliers"
          tone="good"
          hint="Approved"
          value={supplierStats.active.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/suppliers?status=on_hold"
          icon={PauseCircle}
          label="On hold"
          tone={supplierStats.on_hold > 0 ? "warn" : "default"}
          trend={supplierStats.on_hold > 0 ? "Review" : "Clear"}
          value={supplierStats.on_hold.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/suppliers"
          icon={Boxes}
          label="Total suppliers"
          hint="Register"
          value={supplierStats.total.toLocaleString("en-ZM")}
        />
      </section>

      <OpsSupplierScorecardPanel scorecards={supplierScorecards} />

      {canCreate ? (
        <details
          className="rounded-lg border border-border bg-card"
          id="supplier-create-panel"
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                <Building2 className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-lg font-bold text-foreground">
                  Add supplier
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Expand when a new approved supplier must be added to procurement master data.
                </span>
              </span>
            </span>
            <Plus className="size-5 shrink-0 text-primary-blue" aria-hidden="true" />
          </summary>
          <form
            action={createSupplierAction}
            className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-4"
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
              Category
              <select className={OPS_INPUT_CLASS} defaultValue="general" name="category">
                {SUPPLIER_CATEGORY_OPTIONS.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Kind
              <select className={OPS_INPUT_CLASS} defaultValue="vendor" name="kind">
                <option value="vendor">Vendor (materials/equipment)</option>
                <option value="subcontractor">Subcontractor (labour/services)</option>
                <option value="both">Both — vendor &amp; subcontractor</option>
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              TPIN
              <input className={OPS_INPUT_CLASS} name="tpin" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Supplier email
              <input className={OPS_INPUT_CLASS} name="email" type="email" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Supplier phone
              <input className={OPS_INPUT_CLASS} name="phone" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
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
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Rating
              <select className={OPS_INPUT_CLASS} defaultValue="" name="rating">
                <option value="">Not rated</option>
                <option value="5">5 - Preferred</option>
                <option value="4">4 - Strong</option>
                <option value="3">3 - Acceptable</option>
                <option value="2">2 - Watch</option>
                <option value="1">1 - Concern</option>
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-4`}>
              Notes
              <input className={OPS_INPUT_CLASS} name="notes" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Primary contact
              <input className={OPS_INPUT_CLASS} name="contact_full_name" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Contact role
              <input className={OPS_INPUT_CLASS} name="contact_role" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Contact email
              <input className={OPS_INPUT_CLASS} name="contact_email" type="email" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Contact phone
              <input className={OPS_INPUT_CLASS} name="contact_phone" />
            </label>
            <div className="flex items-end min-[520px]:col-span-2 lg:col-span-4 lg:justify-end">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Add supplier
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <OpsDashboardPanel
        actions={<ShieldCheck className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />}
        eyebrow="Supplier records"
        title="Register"
      >
        <div className="-mx-5 -mb-5">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="mt-1 text-sm text-muted-foreground">
              {supplierPage.pagination.total} matching supplier records.
            </p>
          </div>
        </div>
        <OpsListControls
          action="/ops/suppliers"
          filters={[
            {
              label: "Status",
              name: "status",
              options: SUPPLIER_STATUS_OPTIONS,
              value: status,
            },
            {
              label: "Kind",
              name: "kind",
              options: SUPPLIER_KIND_OPTIONS,
              value: kind,
            },
          ]}
          placeholder="Search supplier, category, TPIN, email, phone, or city"
          query={listState.query}
          resultLabel="suppliers"
        />

        {suppliers.length > 0 ? (
          <div className="divide-y divide-border">
            {suppliers.map((supplier) => {
              const contact = primaryContact(supplier);
              const canMutate = canManage && supplier.status !== "archived";
              const canReactivate = canManage && supplier.status === "archived";
              const canAddContact = canCreate && supplier.status !== "archived";
              const canAddPerformance = canLogPerformance && supplier.status !== "archived";

              return (
                <article className="p-5" key={supplier.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-foreground">
                          {supplier.supplier_code}
                        </h3>
                        <span
                          className={opsStatusBadgeClass(supplier.status)}
                        >
                          {formatLabel(supplier.status)}
                        </span>
                        <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                          {formatLabel(supplier.category)}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${kindClass(
                            supplier.kind,
                          )}`}
                        >
                          {kindLabel(supplier.kind)}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-foreground">
                        {supplier.legal_name}
                      </p>
                      {supplier.trading_name ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Trading as {supplier.trading_name}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {[supplier.address_line, supplier.city, supplier.country]
                          .filter(Boolean)
                          .join(", ") || "Address not recorded"}
                      </p>
                    </div>
                    <div className="grid gap-2 min-[520px]:grid-cols-2 lg:min-w-56 lg:grid-cols-1">
                      {canMutate ? (
                        <form action={updateSupplierStatusAction} className="grid gap-2">
                          <input name="supplier_id" type="hidden" value={supplier.id} />
                          <label className={OPS_LABEL_CLASS}>
                            Status
                            <select className={OPS_INPUT_CLASS} defaultValue={supplier.status} name="status">
                              <option value="active">Active</option>
                              <option value="on_hold">On hold</option>
                            </select>
                          </label>
                          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                            Update status
                          </button>
                        </form>
                      ) : null}
                      {canMutate ? (
                        <form action={archiveSupplierAction}>
                          <input name="supplier_id" type="hidden" value={supplier.id} />
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
                        <form action={reactivateSupplierAction}>
                          <input name="supplier_id" type="hidden" value={supplier.id} />
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

                  <dl className="mt-4 grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-md border border-border px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        TPIN
                      </dt>
                      <dd className="mt-1 font-bold text-foreground">
                        {supplier.tpin || "Not recorded"}
                      </dd>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Main email
                      </dt>
                      <dd className="mt-1 truncate font-bold text-foreground">
                        {supplier.email || "Not recorded"}
                      </dd>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Main phone
                      </dt>
                      <dd className="mt-1 font-bold text-foreground">
                        {supplier.phone || "Not recorded"}
                      </dd>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Master rating
                      </dt>
                      <dd className="mt-1 font-bold text-foreground">
                        {supplier.rating ? `${supplier.rating}/5` : "Not rated"}
                      </dd>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Recent performance
                      </dt>
                      <dd className="mt-1 font-bold text-foreground">
                        {supplier.performance_event_average
                          ? `${supplier.performance_event_average}/5`
                          : "No events"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 grid gap-4">
                    {supplier.notes ? (
                      <p className="rounded-md border border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
                        {supplier.notes}
                      </p>
                    ) : null}
                    <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-heading text-base font-bold text-foreground">
                            Contacts
                          </h4>
                          {contact ? (
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Primary: {contact.full_name}
                            </p>
                          ) : null}
                        </div>
                        <SupplierContactList supplier={supplier} />
                      </div>
                      {canAddContact ? <AddSupplierContactForm supplierId={supplier.id} /> : null}
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-heading text-base font-bold text-foreground">
                            Performance
                          </h4>
                          {supplier.performance_events.length > 0 ? (
                            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              <Star className="size-3.5" aria-hidden="true" />
                              {supplier.performance_events.length} recent event
                              {supplier.performance_events.length === 1 ? "" : "s"}
                            </p>
                          ) : null}
                        </div>
                        <SupplierPerformanceList events={supplier.performance_events} />
                      </div>
                      {canAddPerformance ? (
                        <AddSupplierPerformanceEventForm
                          siteOptions={siteOptions}
                          supplierId={supplier.id}
                        />
                      ) : null}
                    </div>
                  </div>

                  <OpsRecordActivityPanel
                    canManage={canCreate || canManage}
                    sourceId={supplier.id}
                    sourceTable="suppliers"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <OpsEmptyState
            icon={Building2}
            title={
              hasActiveListFilter
                ? "No suppliers match these filters"
                : "No suppliers yet"
            }
            description={
              hasActiveListFilter
                ? "Try clearing the search or switching the status filter — active, on hold, and archived suppliers sit in different buckets."
                : "Add the first approved supplier so Request for Quotation and Purchase Order workflows can nominate them per line item."
            }
            actions={
              hasActiveListFilter
                ? [{ href: "/ops/suppliers", label: "Clear filters" }]
                : canCreate
                  ? [{ href: "#supplier-create-panel", label: "Add the first supplier" }]
                  : [{ href: "/ops", label: "Back to overview", variant: "secondary" }]
            }
          />
        )}
        <OpsPaginationControls
          basePath="/ops/suppliers"
          filters={[
            {
              label: "Status",
              name: "status",
              options: [],
              value: status,
            },
            {
              label: "Kind",
              name: "kind",
              options: [],
              value: kind,
            },
          ]}
          pagination={supplierPage.pagination}
          query={listState.query}
          resultLabel="suppliers"
        />
        </div>
      </OpsDashboardPanel>
    </div>
  );
}
