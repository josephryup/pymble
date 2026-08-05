import { Building2, MapPin, Save, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { fetchPurchaseOrderApprovalSettings } from "@/lib/ops/approval-settings";
import { updatePurchaseOrderApprovalSettingsAction } from "@/lib/ops/approval-settings-actions";
import { OpsSystemHealthPanel } from "@/components/ops/OpsSystemHealthPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import { formatCoordinateValue } from "@/lib/ops/coordinates";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { fetchOpsSystemHealth } from "@/lib/ops/system-health";
import { updateOrganizationProfileAction } from "@/lib/ops/organization-actions";
import { canAccessOpsHref, canManageOps } from "@/lib/ops/permissions";
import { formatOpsRole } from "@/lib/ops/roles";
import {
  firstParam,
  formatZmw,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function settingsNotice(params: OpsSearchParams) {
  const error = firstParam(params.error);

  if (error) {
    return {
      message: error,
      tone: "error" as const,
    };
  }

  if (firstParam(params.updated) === "organization") {
    return {
      message: "Pymble organization settings saved.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "purchase_order_approval") {
    return {
      message: "Purchase order approval settings saved.",
      tone: "success" as const,
    };
  }

  return null;
}

function fieldValue(value: string | number | null) {
  return value === null ? "" : String(value);
}

function vatPercent(value: number) {
  return String(Math.round((value * 100 + Number.EPSILON) * 10000) / 10000);
}

export default async function OpsSettingsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/settings", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const [profile, purchaseOrderApprovalSettings, systemHealth] = await Promise.all([
    fetchOpsOrganizationProfile(),
    fetchPurchaseOrderApprovalSettings(),
    fetchOpsSystemHealth(),
  ]);
  const canManage = canManageOps(auth.profile.role);
  const notice = settingsNotice(params);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Settings
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Organization profile
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              Manage Pymble company details, headquarters address, map position, invoice prefix,
              and VAT defaults.
            </p>
          </div>
          <div className="rounded-md border border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Access
            </p>
            <p className="mt-1 font-heading text-lg font-bold text-foreground">
              {canManage ? "Full access" : "Read only"}
            </p>
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

      {!canManage ? (
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Your role has read-only access to organization settings.
        </div>
      ) : null}

      <form action={updateOrganizationProfileAction} className="space-y-5">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Building2 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Company details
              </h2>
              <p className="text-sm text-muted-foreground">
                These values feed invoices, profile checks, and internal ops surfaces.
              </p>
            </div>
          </div>

          <div className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
              Legal name
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={profile.legal_name}
                name="legal_name"
                readOnly={!canManage}
                required
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
              Trading name
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={profile.trading_name}
                name="trading_name"
                readOnly={!canManage}
                required
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              TPIN
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={fieldValue(profile.tpin)}
                name="tpin"
                readOnly={!canManage}
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Email
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={fieldValue(profile.email)}
                name="email"
                readOnly={!canManage}
                type="email"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Primary phone
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={fieldValue(profile.phone_primary)}
                name="phone_primary"
                readOnly={!canManage}
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Secondary phone
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={fieldValue(profile.phone_secondary)}
                name="phone_secondary"
                readOnly={!canManage}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <MapPin className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Headquarters location
              </h2>
              <p className="text-sm text-muted-foreground">
                The headquarters coordinates appear on the overview map with Pymble site pins.
              </p>
            </div>
          </div>

          <div className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
              Address line
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={fieldValue(profile.address_line)}
                name="address_line"
                readOnly={!canManage}
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              City
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={fieldValue(profile.city)}
                name="city"
                readOnly={!canManage}
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Country
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={profile.country}
                name="country"
                readOnly={!canManage}
                required
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Headquarters latitude
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={
                  profile.headquarters_latitude === null
                    ? ""
                    : formatCoordinateValue(profile.headquarters_latitude)
                }
                inputMode="decimal"
                name="headquarters_latitude"
                readOnly={!canManage}
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Headquarters longitude
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={
                  profile.headquarters_longitude === null
                    ? ""
                    : formatCoordinateValue(profile.headquarters_longitude)
                }
                inputMode="decimal"
                name="headquarters_longitude"
                readOnly={!canManage}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Save className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Invoice defaults
              </h2>
              <p className="text-sm text-muted-foreground">
                These defaults are used when Pymble invoices are generated.
              </p>
            </div>
          </div>

          <div className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={OPS_LABEL_CLASS}>
              Invoice prefix
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={profile.invoice_prefix}
                name="invoice_prefix"
                readOnly={!canManage}
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Currency
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={profile.currency_code}
                maxLength={3}
                name="currency_code"
                readOnly={!canManage}
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              VAT rate %
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={vatPercent(profile.vat_rate)}
                min="0"
                name="vat_rate_percent"
                readOnly={!canManage}
                required
                step="0.01"
                type="number"
              />
            </label>
          </div>
        </section>

        {canManage ? (
          <OpsSubmitButton
            className={OPS_PRIMARY_BUTTON_CLASS}
            pendingLabel="Saving organization settings..."
          >
            <Save className="size-4" aria-hidden="true" />
            Save organization settings
          </OpsSubmitButton>
        ) : null}
      </form>

      <form action={updatePurchaseOrderApprovalSettingsAction} className="space-y-5">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Purchase order approvals
              </h2>
              <p className="text-sm text-muted-foreground">
                Draft purchase orders must pass this chain before they can be issued.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                First review
              </p>
              <p className="mt-1 font-heading text-lg font-bold text-foreground">
                {formatOpsRole(purchaseOrderApprovalSettings.first_step_role)}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Budget check
              </p>
              <p className="mt-1 font-heading text-lg font-bold text-foreground">
                {purchaseOrderApprovalSettings.second_step_role
                  ? formatOpsRole(purchaseOrderApprovalSettings.second_step_role)
                  : "Not required"}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Threshold approver
              </p>
              <p className="mt-1 font-heading text-lg font-bold text-foreground">
                {purchaseOrderApprovalSettings.threshold_step_role
                  ? formatOpsRole(purchaseOrderApprovalSettings.threshold_step_role)
                  : "Not required"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              MD threshold amount
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={purchaseOrderApprovalSettings.threshold_amount.toFixed(2)}
                min="0"
                name="threshold_amount"
                readOnly={!canManage}
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-4 py-3 text-sm font-semibold text-foreground lg:col-span-2">
              <input
                className="size-4 accent-primary-blue"
                defaultChecked={purchaseOrderApprovalSettings.threshold_enabled}
                disabled={!canManage}
                name="threshold_enabled"
                type="checkbox"
              />
              Add Managing Director review at threshold
            </label>
            <div className="rounded-md border border-border px-4 py-3 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Current trigger
              </p>
              <p className="mt-1 font-heading text-lg font-bold text-foreground">
                {purchaseOrderApprovalSettings.threshold_enabled
                  ? `${formatZmw(purchaseOrderApprovalSettings.threshold_amount)} and above`
                  : "Disabled"}
              </p>
            </div>
          </div>
        </section>

        {canManage ? (
          <OpsSubmitButton
            className={OPS_PRIMARY_BUTTON_CLASS}
            pendingLabel="Saving approval settings..."
          >
            <Save className="size-4" aria-hidden="true" />
            Save approval settings
          </OpsSubmitButton>
        ) : null}
      </form>

      <OpsSystemHealthPanel health={systemHealth} />
    </div>
  );
}
