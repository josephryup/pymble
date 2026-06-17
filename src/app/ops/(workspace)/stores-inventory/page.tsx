import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  ClipboardCheck,
  ClipboardPenLine,
  History,
  MapPin,
  PackageMinus,
  PackagePlus,
  Plus,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import {
  OpsDeliveryTrackerPanel,
  OpsStockAlertsPanel,
} from "@/components/ops/OpsProcurementKpiPanels";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import { canCreateOpsDeliveryException } from "@/lib/ops/delivery-exception-permissions";
import {
  fetchOpsDeliveryTracker,
  fetchOpsStockAlerts,
} from "@/lib/ops/procurement-kpis";
import { deliveryExceptionCreateHrefForGrn } from "@/lib/ops/delivery-exception-shortcuts";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  adjustStockCountAction,
  archiveGoodsReceivedNoteAction,
  createInventoryLocationAction,
  createStockItemAction,
  issueStockAction,
  recordGoodsReceivedAction,
  transferStockAction,
} from "@/lib/ops/stores-inventory-actions";
import {
  canAdjustOpsStock,
  canIssueOpsStock,
  canManageOpsInventoryMasterData,
  canRecordOpsGoodsReceived,
  canTransferOpsStock,
} from "@/lib/ops/stores-inventory-permissions";
import {
  fetchActiveInventoryLocationOptions,
  fetchActiveStockItemOptions,
  fetchPaginatedGoodsReceivedNotes,
  fetchReceivablePurchaseOrderItemOptions,
  fetchRecentStockMovements,
  fetchStockLevels,
  fetchStoresInventoryStats,
  type OpsGoodsReceivedNoteSummary,
  type OpsInventoryLocationSummary,
  type OpsStockLevelSummary,
  type OpsStockMovementSummary,
} from "@/lib/ops/stores-inventory";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import type {
  OpsGrnStatus,
  OpsInventoryLocationType,
  OpsStockMovementType,
} from "@/lib/ops/types";
import {
  firstParam,
  formatZmw,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_FOCUS_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const GRN_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsGrnStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Posted", value: "posted" },
  { label: "Cancelled", value: "cancelled" },
];

const LOCATION_TYPE_OPTIONS: Array<{
  label: string;
  value: OpsInventoryLocationType;
}> = [
  { label: "Central store", value: "central_store" },
  { label: "Site store", value: "site_store" },
  { label: "Yard", value: "yard" },
  { label: "Vehicle", value: "vehicle" },
];

const STOCK_CATEGORY_OPTIONS = [
  { label: "Material", value: "material" },
  { label: "Consumable", value: "consumable" },
  { label: "Tools", value: "tools" },
  { label: "Safety", value: "safety" },
  { label: "Fuel", value: "fuel" },
  { label: "Equipment spare", value: "equipment_spare" },
];

function statusFromParam(value: string | undefined) {
  return GRN_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsGrnStatus | "")
    : "";
}

function storesNotice(params: OpsSearchParams) {
  const error = firstParam(params.error);

  if (error) {
    return {
      message: error,
      tone: "error" as const,
    };
  }

  const created = firstParam(params.created);
  const updated = firstParam(params.updated);
  const messages: Record<string, string> = {
    attachment: "GRN attachment uploaded.",
    comment: "GRN comment added.",
    grn: "Goods received note posted and stock movement recorded.",
    location: "Stock location created.",
    stock_adjustment: "Stock count adjustment posted.",
    stock_issue: "Stock issue posted.",
    stock_item: "Stock item created.",
    stock_transfer: "Stock transfer posted.",
  };

  return (created && messages[created]) || (updated && messages[updated])
    ? {
        message: messages[created ?? updated ?? ""],
        tone: "success" as const,
      }
    : null;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatQuantity(value: number, unit?: string) {
  return `${value.toLocaleString("en-ZM", {
    maximumFractionDigits: 2,
  })}${unit ? ` ${unit}` : ""}`;
}

function formatMovementQuantity(movement: OpsStockMovementSummary) {
  const sign = movement.quantity > 0 ? "+" : movement.quantity < 0 ? "-" : "";
  return `${sign}${formatQuantity(
    Math.abs(movement.quantity),
    movement.stock_item?.unit,
  )}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(`${value}T00:00:00+02:00`));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not moved";
  }

  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: OpsGrnStatus) {
  if (status === "posted") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
}

function movementClass(type: OpsStockMovementType) {
  if (type === "receipt") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (type === "issue") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (type === "transfer") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/55";
}

function InventoryFlowStep({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-primary-dark/10 bg-primary-dark/[0.02] p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-primary-blue shadow-sm shadow-primary-dark/5">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
            {label}
          </p>
          <p className="mt-1 truncate font-heading text-xl font-bold text-primary-dark">
            {value}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-primary-dark/60">{description}</p>
    </div>
  );
}

function GoodsReceivedItems({ grn }: { grn: OpsGoodsReceivedNoteSummary }) {
  if (grn.items.length === 0) {
    return (
      <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-800">
        No goods received lines were found for this GRN.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-primary-dark/10">
      <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
        <caption className="sr-only">Goods received lines for {grn.grn_number}</caption>
        <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
          <tr>
            <th className="px-3 py-3" scope="col">
              Item
            </th>
            <th className="px-3 py-3" scope="col">
              Received
            </th>
            <th className="px-3 py-3" scope="col">
              Rejected
            </th>
            <th className="px-3 py-3" scope="col">
              Value
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-primary-dark/10">
          {grn.items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-3 align-top">
                <p className="font-bold text-primary-dark">{item.item_name}</p>
                <p className="mt-1 text-xs text-primary-dark/45">
                  Stock item: {item.stock_item?.item_code ?? "Not linked"}
                </p>
              </td>
              <td className="px-3 py-3 align-top font-semibold text-primary-dark/70">
                {formatQuantity(item.quantity_received, item.unit)}
              </td>
              <td className="px-3 py-3 align-top font-semibold text-primary-dark/70">
                {formatQuantity(item.quantity_rejected, item.unit)}
              </td>
              <td className="px-3 py-3 align-top font-bold text-primary-dark">
                {formatZmw(item.quantity_received * item.unit_cost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockLevels({ levels }: { levels: OpsStockLevelSummary[] }) {
  if (levels.length === 0) {
    return (
      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
        No positive stock balances yet. Post the first GRN to populate this view.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
      {levels.map((level) => (
        <li className="grid gap-2 px-3 py-3 min-[640px]:grid-cols-[1fr_auto]" key={level.id}>
          <div className="min-w-0">
            <p className="font-bold text-primary-dark">
              {level.stock_item?.item_name ?? "Stock item unavailable"}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
              {level.stock_item?.item_code ?? "No code"} /{" "}
              {level.location
                ? `${level.location.location_code} - ${level.location.name}`
                : "Location unavailable"}
            </p>
          </div>
          <div className="text-left min-[640px]:text-right">
            <p className="font-heading text-xl font-bold text-primary-dark">
              {formatQuantity(level.quantity_on_hand, level.stock_item?.unit)}
            </p>
            <p className="mt-1 text-xs text-primary-dark/45">
              Last movement {formatDateTime(level.last_movement_at)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StockMovements({ movements }: { movements: OpsStockMovementSummary[] }) {
  if (movements.length === 0) {
    return (
      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
        No stock movement history yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
      {movements.map((movement) => (
        <li className="grid gap-2 px-3 py-3 min-[640px]:grid-cols-[1fr_auto]" key={movement.id}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-primary-dark">
                {movement.stock_item?.item_name ?? "Stock item unavailable"}
              </p>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${movementClass(
                  movement.movement_type,
                )}`}
              >
                {formatLabel(movement.movement_type)}
              </span>
            </div>
            <p className="mt-1 text-xs text-primary-dark/50">
              {movement.location
                ? `${movement.location.location_code} - ${movement.location.name}`
                : "Location unavailable"}{" "}
              / {movement.notes || "No notes"}
            </p>
          </div>
          <div className="text-left min-[640px]:text-right">
            <p className="font-bold text-primary-dark">
              {formatMovementQuantity(movement)}
            </p>
            <p className="mt-1 text-xs text-primary-dark/45">
              {formatDateTime(movement.movement_at)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function stockLevelLabel(level: OpsStockLevelSummary) {
  const item = level.stock_item
    ? `${level.stock_item.item_code} - ${level.stock_item.item_name}`
    : "Stock item unavailable";
  const location = level.location
    ? `${level.location.location_code} - ${level.location.name}`
    : "Location unavailable";

  return `${item} / ${location} / ${formatQuantity(
    level.quantity_on_hand,
    level.stock_item?.unit,
  )} available`;
}

function StockControlForms({
  canAdjust,
  canIssue,
  canTransfer,
  levels,
  locations,
  openByDefault = false,
  today,
}: {
  canAdjust: boolean;
  canIssue: boolean;
  canTransfer: boolean;
  levels: OpsStockLevelSummary[];
  locations: OpsInventoryLocationSummary[];
  openByDefault?: boolean;
  today: string;
}) {
  if (!canIssue && !canTransfer && !canAdjust) {
    return null;
  }

  return (
    <details
      className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
      id="stock-control-panel"
      open={openByDefault}
    >
      <summary
        className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
          <ArrowRightLeft className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold text-primary-dark">Stock control</h2>
          <p className="text-sm text-primary-dark/60">
            Issue, transfer, or correct existing stock balances.
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
          Open
        </span>
      </summary>

      <div className="border-t border-primary-dark/10 p-5">
        {levels.length === 0 ? (
          <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-800">
            Post a GRN before stock can be issued, transferred, or adjusted.
          </p>
        ) : (
          <div className="grid gap-3">
          {canIssue ? (
            <details className="rounded-md border border-primary-dark/10">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
                <PackageMinus className="size-4" aria-hidden="true" />
                Issue stock
              </summary>
              <form action={issueStockAction} className="grid gap-3 border-t border-primary-dark/10 p-3">
                <label className={OPS_LABEL_CLASS}>
                  Stock balance
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="stock_level_id" required>
                    <option value="" disabled>
                      Select balance
                    </option>
                    {levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {stockLevelLabel(level)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-1">
                  <label className={OPS_LABEL_CLASS}>
                    Quantity
                    <input className={OPS_INPUT_CLASS} min="0.01" name="quantity" required step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Issue date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="movement_at" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Reference
                  <input className={OPS_INPUT_CLASS} name="reference" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Notes
                  <input className={OPS_INPUT_CLASS} name="notes" />
                </label>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <PackageMinus className="size-4" aria-hidden="true" />
                  Post issue
                </button>
              </form>
            </details>
          ) : null}

          {canTransfer ? (
            <details className="rounded-md border border-primary-dark/10">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
                <ArrowRightLeft className="size-4" aria-hidden="true" />
                Transfer stock
              </summary>
              <form action={transferStockAction} className="grid gap-3 border-t border-primary-dark/10 p-3">
                <label className={OPS_LABEL_CLASS}>
                  Source balance
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="stock_level_id" required>
                    <option value="" disabled>
                      Select balance
                    </option>
                    {levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {stockLevelLabel(level)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Destination
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="destination_location_id" required>
                    <option value="" disabled>
                      Select location
                    </option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.location_code} - {location.name}
                        {location.site ? ` / ${location.site.code}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-1">
                  <label className={OPS_LABEL_CLASS}>
                    Quantity
                    <input className={OPS_INPUT_CLASS} min="0.01" name="quantity" required step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Transfer date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="movement_at" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Reference
                  <input className={OPS_INPUT_CLASS} name="reference" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Notes
                  <input className={OPS_INPUT_CLASS} name="notes" />
                </label>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <ArrowRightLeft className="size-4" aria-hidden="true" />
                  Post transfer
                </button>
              </form>
            </details>
          ) : null}

          {canAdjust ? (
            <details className="rounded-md border border-primary-dark/10">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
                <ClipboardPenLine className="size-4" aria-hidden="true" />
                Adjust count
              </summary>
              <form action={adjustStockCountAction} className="grid gap-3 border-t border-primary-dark/10 p-3">
                <label className={OPS_LABEL_CLASS}>
                  Stock balance
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="stock_level_id" required>
                    <option value="" disabled>
                      Select balance
                    </option>
                    {levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {stockLevelLabel(level)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-1">
                  <label className={OPS_LABEL_CLASS}>
                    Counted quantity
                    <input className={OPS_INPUT_CLASS} min="0" name="counted_quantity" required step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Count date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="movement_at" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Reason
                  <select className={OPS_INPUT_CLASS} defaultValue="stock_count" name="reason">
                    <option value="stock_count">Stock count</option>
                    <option value="damage">Damage</option>
                    <option value="loss">Loss</option>
                    <option value="return_to_store">Return to store</option>
                    <option value="data_correction">Data correction</option>
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Reference
                  <input className={OPS_INPUT_CLASS} name="reference" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Notes
                  <input className={OPS_INPUT_CLASS} name="notes" />
                </label>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <ClipboardPenLine className="size-4" aria-hidden="true" />
                  Post adjustment
                </button>
              </form>
            </details>
          ) : null}
          </div>
        )}
      </div>
    </details>
  );
}

export default async function OpsStoresInventoryPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/stores-inventory")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const [
    grnPage,
    stats,
    locationOptions,
    stockItemOptions,
    receivableItems,
    stockLevels,
    stockMovements,
    siteOptions,
    stockAlerts,
    deliveryTracker,
  ] = await Promise.all([
    fetchPaginatedGoodsReceivedNotes({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchStoresInventoryStats(),
    fetchActiveInventoryLocationOptions(),
    fetchActiveStockItemOptions(),
    fetchReceivablePurchaseOrderItemOptions(),
    fetchStockLevels(),
    fetchRecentStockMovements(),
    fetchActiveSiteOptions(),
    fetchOpsStockAlerts(),
    fetchOpsDeliveryTracker(),
  ]);
  const notice = storesNotice(params);
  const canAdjustStock = canAdjustOpsStock(auth.profile.role);
  const canIssueStock = canIssueOpsStock(auth.profile.role);
  const canManageMasterData = canManageOpsInventoryMasterData(auth.profile.role);
  const canReceiveGoods = canRecordOpsGoodsReceived(auth.profile.role, { status: "issued" });
  const canTransferStock = canTransferOpsStock(auth.profile.role);
  const canManageActivity = canManageMasterData || canReceiveGoods;
  const canUseStockControl = canIssueStock || canTransferStock || canAdjustStock;
  const canRaiseDeliveryException =
    canAccessOpsHref(auth.profile.role, "/ops/delivery-exceptions") &&
    canCreateOpsDeliveryException(auth.profile.role);
  // Anyone who can record a GRN can archive completed/cancelled ones.
  const canArchiveGrn = canReceiveGoods;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const today = new Date().toISOString().slice(0, 10);
  const createPanel = firstParam(params.create);
  const actionPanel = firstParam(params.action);
  const openReceivePanel = createPanel === "grn";
  const openLocationPanel = createPanel === "location";
  const openStockItemPanel = createPanel === "stock_item";
  const openStockControlPanel = actionPanel === "stock_control";
  const visibleGrnValue = grnPage.items.reduce(
    (sum, grn) => sum + grn.total_received_amount,
    0,
  );
  const latestMovement = stockMovements[0];

  return (
    <div className="w-full max-w-none space-y-5">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm shadow-primary-dark/5 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Procurement and stores
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Stores and inventory
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Receive issued purchase orders, control stock master data, and keep every balance
              traceable through auditable movements.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canReceiveGoods ? (
              <Link
                className={OPS_PRIMARY_BUTTON_CLASS}
                href="/ops/stores-inventory?create=grn#grn-receive-panel"
              >
                <Plus className="size-4" aria-hidden="true" />
                Record GRN
              </Link>
            ) : null}
            <Link
              className={OPS_SECONDARY_BUTTON_CLASS}
              href="/ops/rfq-po"
            >
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Purchase orders
            </Link>
            {canUseStockControl ? (
              <Link
                className={OPS_SECONDARY_BUTTON_CLASS}
                href="/ops/stores-inventory?action=stock_control#stock-control-panel"
              >
                <ArrowRightLeft className="size-4" aria-hidden="true" />
                Stock control
              </Link>
            ) : null}
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/rfq-po"
          icon={ClipboardCheck}
          label="Receivable POs"
          tone={stats.receivablePurchaseOrders > 0 ? "warn" : "default"}
          trend={`${receivableItems.length} open lines`}
          value={String(stats.receivablePurchaseOrders)}
        />
        <OpsKpiCard
          href="/ops/stores-inventory?status=posted#grn-register"
          icon={Boxes}
          label="Posted GRNs"
          tone="good"
          trend="Audited receipts"
          value={String(stats.postedGrns)}
        />
        <OpsKpiCard
          href={
            canManageMasterData
              ? "/ops/stores-inventory?create=location#location-create-panel"
              : "/ops/stores-inventory#grn-register"
          }
          icon={MapPin}
          label="Locations"
          trend="Active stores"
          value={String(stats.activeLocations)}
        />
        <OpsKpiCard
          href={
            canManageMasterData
              ? "/ops/stores-inventory?create=stock_item#stock-item-create-panel"
              : "/ops/stores-inventory#grn-register"
          }
          icon={PackagePlus}
          label="Stock items"
          trend="Master data"
          value={String(stats.activeStockItems)}
        />
      </div>

      <OpsStockAlertsPanel summary={stockAlerts} />
      <OpsDeliveryTrackerPanel summary={deliveryTracker} />

      <OpsDashboardPanel
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/material-requests">
              Material requests
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/rfq-po">
              Request for Quotation and Purchase Order register
            </Link>
          </>
        }
        eyebrow="Inventory flow"
        title="Issued PO to stock movement"
      >
        <div className="grid gap-3 lg:grid-cols-4">
          <InventoryFlowStep
            description="Issued purchase orders create receivable lines for stores."
            icon={ClipboardCheck}
            label="Open receiving"
            value={`${receivableItems.length} lines`}
          />
          <InventoryFlowStep
            description="Posted GRNs become the receiving proof and source record."
            icon={PackagePlus}
            label="Visible GRN value"
            value={formatZmw(visibleGrnValue)}
          />
          <InventoryFlowStep
            description="Positive stock balances are derived from posted movements."
            icon={Warehouse}
            label="Live balances"
            value={`${stockLevels.length} balances`}
          />
          <InventoryFlowStep
            description="Issues, transfers, receipts, and adjustments remain auditable."
            icon={History}
            label="Latest movement"
            value={latestMovement ? formatDateTime(latestMovement.movement_at) : "No movement yet"}
          />
        </div>
      </OpsDashboardPanel>

      <div className="grid gap-5 xl:grid-cols-2">
        <OpsDashboardPanel eyebrow="Stock state" title="Stock levels">
          <StockLevels levels={stockLevels} />
        </OpsDashboardPanel>
        <OpsDashboardPanel eyebrow="Movement history" title="Recent movements">
          <StockMovements movements={stockMovements} />
        </OpsDashboardPanel>
      </div>

      {canReceiveGoods ? (
        <details
          className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
          id="grn-receive-panel"
          open={openReceivePanel}
        >
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <ClipboardCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-primary-dark">
                Record goods received
              </span>
              <span className="mt-1 block text-sm text-primary-dark/60">
                Post receipts only against issued or partially received purchase orders.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          <div className="border-t border-primary-dark/10 p-5">
            {receivableItems.length === 0 ? (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                No issued purchase order lines are available for receiving yet.
              </div>
            ) : locationOptions.length === 0 || stockItemOptions.length === 0 ? (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Add at least one active stock location and stock item before posting a GRN.
              </div>
            ) : (
              <form
                action={recordGoodsReceivedAction}
                className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
              >
                <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                  Purchase order line
                  <select
                    className={OPS_INPUT_CLASS}
                    defaultValue=""
                    name="purchase_order_item_id"
                    required
                  >
                    <option value="" disabled>
                      Select PO line
                    </option>
                    {receivableItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.po_number} - {item.item_name} /{" "}
                        {formatQuantity(item.remaining_quantity, item.unit)} remaining
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                  Stock item
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="stock_item_id" required>
                    <option value="" disabled>
                      Select stock item
                    </option>
                    {stockItemOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item_code} - {item.item_name} / {item.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                  Location
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="location_id" required>
                    <option value="" disabled>
                      Select location
                    </option>
                    {locationOptions.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.location_code} - {location.name}
                        {location.site ? ` / ${location.site.code}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Received date
                  <input className={OPS_INPUT_CLASS} defaultValue={today} name="received_at" type="date" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Received qty
                  <input
                    className={OPS_INPUT_CLASS}
                    min="0.01"
                    name="quantity_received"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Rejected qty
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue="0"
                    min="0"
                    name="quantity_rejected"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                  Delivery reference
                  <input className={OPS_INPUT_CLASS} name="delivery_reference" />
                </label>
                <label className={`${OPS_LABEL_CLASS} lg:col-span-4`}>
                  Notes
                  <input className={OPS_INPUT_CLASS} name="notes" />
                </label>
                <div className="flex items-end lg:col-span-2">
                  <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
                    <Plus className="size-4" aria-hidden="true" />
                    Post GRN
                  </button>
                </div>
              </form>
            )}
          </div>
        </details>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white" id="grn-register">
            <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
              <div>
                <h2 className="font-heading text-xl font-bold text-primary-dark">
                  Goods received register
                </h2>
                <p className="mt-1 text-sm text-primary-dark/60">
                  {grnPage.pagination.total} matching GRN records.
                </p>
              </div>
              <Boxes className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
            </div>
            <OpsListControls
              action="/ops/stores-inventory"
              filters={[
                {
                  label: "Status",
                  name: "status",
                  options: GRN_STATUS_OPTIONS,
                  value: status,
                },
              ]}
              placeholder="Search GRN number, delivery reference, or notes"
              query={listState.query}
              resultLabel="GRNs"
            />

            {grnPage.items.length > 0 ? (
              <div className="divide-y divide-primary-dark/10">
                {grnPage.items.map((grn) => (
                  <article className="p-5" key={grn.id}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading text-lg font-bold text-primary-dark">
                            {grn.grn_number}
                          </h3>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                              grn.status,
                            )}`}
                          >
                            {formatLabel(grn.status)}
                          </span>
                        </div>
                        <p className="mt-2 font-bold text-primary-dark">
                          {grn.purchase_order?.po_number ?? "PO unavailable"} /{" "}
                          {grn.supplier
                            ? `${grn.supplier.supplier_code} - ${grn.supplier.legal_name}`
                            : "Supplier unavailable"}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-primary-dark/62">
                          {grn.site ? `${grn.site.code} - ${grn.site.name}` : "Site unavailable"}{" "}
                          /{" "}
                          {grn.location
                            ? `${grn.location.location_code} - ${grn.location.name}`
                            : "Location unavailable"}
                        </p>
                      </div>
                      <div className="rounded-md border border-primary-dark/10 px-4 py-3 lg:min-w-48 lg:text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                          Received value
                        </p>
                        <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                          {formatZmw(grn.total_received_amount)}
                        </p>
                        {canRaiseDeliveryException && grn.status === "posted" ? (
                          <Link
                            className={`${OPS_SECONDARY_BUTTON_CLASS} mt-3 w-full justify-center`}
                            href={deliveryExceptionCreateHrefForGrn(grn.id)}
                          >
                            <AlertTriangle className="size-4" aria-hidden="true" />
                            Raise exception
                          </Link>
                        ) : null}
                        {canArchiveGrn && (grn.status === "posted" || grn.status === "cancelled") ? (
                          <form
                            action={archiveGoodsReceivedNoteAction}
                            className="mt-2"
                          >
                            <input name="id" type="hidden" value={grn.id} />
                            <OpsConfirmSubmitButton
                              className={`${OPS_SECONDARY_BUTTON_CLASS} w-full justify-center`}
                              confirmText="Confirm archive"
                            >
                              Archive
                            </OpsConfirmSubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                          Delivery reference
                        </dt>
                        <dd className="mt-1 font-bold text-primary-dark">
                          {grn.delivery_reference || "Not recorded"}
                        </dd>
                      </div>
                      <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                          Received date
                        </dt>
                        <dd className="mt-1 font-bold text-primary-dark">
                          {formatDate(grn.received_at)}
                        </dd>
                      </div>
                      <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                          Lines
                        </dt>
                        <dd className="mt-1 font-bold text-primary-dark">{grn.items.length}</dd>
                      </div>
                    </dl>

                    {grn.notes ? (
                      <p className="mt-4 rounded-md border border-primary-dark/10 px-3 py-3 text-sm leading-6 text-primary-dark/65">
                        {grn.notes}
                      </p>
                    ) : null}

                    <div className="mt-4">
                      <GoodsReceivedItems grn={grn} />
                    </div>

                    <OpsRecordActivityPanel
                      canManage={canManageActivity && grn.status === "posted"}
                      sourceId={grn.id}
                      sourceTable="goods_received_notes"
                    />
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
                <Boxes className="size-10 text-primary-blue" aria-hidden="true" />
                <div>
                  <p className="font-heading text-xl font-bold text-primary-dark">
                    {hasActiveListFilter ? "No matching GRNs" : "No GRNs posted yet"}
                  </p>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                    {hasActiveListFilter
                      ? "Adjust the search or status filter to widen the goods received register."
                      : "Issue a purchase order from Request for Quotations and Purchase Orders, then receive it here."}
                  </p>
                </div>
              </div>
            )}
            <OpsPaginationControls
              basePath="/ops/stores-inventory"
              filters={[
                {
                  label: "Status",
                  name: "status",
                  options: [],
                  value: status,
                },
              ]}
              pagination={grnPage.pagination}
              query={listState.query}
              resultLabel="GRNs"
            />
          </section>
        </div>

        <aside className="space-y-6">
          {canManageMasterData ? (
            <details
              className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
              id="location-create-panel"
              open={openLocationPanel}
            >
              <summary
                className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                  <MapPin className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-lg font-bold text-primary-dark">
                    Add location
                  </span>
                  <span className="mt-1 block text-sm text-primary-dark/60">
                    Central, site, yard, or vehicle store.
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
                  Open
                </span>
              </summary>
              <form action={createInventoryLocationAction} className="grid gap-3 border-t border-primary-dark/10 p-5">
                <label className={OPS_LABEL_CLASS}>
                  Name
                  <input className={OPS_INPUT_CLASS} name="name" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Optional code
                  <input className={OPS_INPUT_CLASS} name="location_code" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Type
                  <select className={OPS_INPUT_CLASS} defaultValue="site_store" name="location_type">
                    {LOCATION_TYPE_OPTIONS.map((locationType) => (
                      <option key={locationType.value} value={locationType.value}>
                        {locationType.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Linked site
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
                    <option value="">Company-wide location</option>
                    {siteOptions.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} - {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <input className={OPS_INPUT_CLASS} name="description" />
                </label>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Add location
                </button>
              </form>
            </details>
          ) : null}

          {canManageMasterData ? (
            <details
              className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
              id="stock-item-create-panel"
              open={openStockItemPanel}
            >
              <summary
                className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                  <PackagePlus className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-lg font-bold text-primary-dark">
                    Add stock item
                  </span>
                  <span className="mt-1 block text-sm text-primary-dark/60">
                    Reusable item master for GRNs.
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
                  Open
                </span>
              </summary>
              <form action={createStockItemAction} className="grid gap-3 border-t border-primary-dark/10 p-5">
                <label className={OPS_LABEL_CLASS}>
                  Item name
                  <input className={OPS_INPUT_CLASS} name="item_name" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Optional code
                  <input className={OPS_INPUT_CLASS} name="item_code" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Category
                  <select className={OPS_INPUT_CLASS} defaultValue="material" name="category">
                    {STOCK_CATEGORY_OPTIONS.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Unit
                  <input className={OPS_INPUT_CLASS} defaultValue="each" name="unit" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Specification
                  <input className={OPS_INPUT_CLASS} name="specification" />
                </label>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Add stock item
                </button>
              </form>
            </details>
          ) : null}

          <StockControlForms
            canAdjust={canAdjustStock}
            canIssue={canIssueStock}
            canTransfer={canTransferStock}
            levels={stockLevels}
            locations={locationOptions}
            openByDefault={openStockControlPanel}
            today={today}
          />
        </aside>
      </div>
    </div>
  );
}
