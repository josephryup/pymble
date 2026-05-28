export type OpsSearchParams = Record<string, string | string[] | undefined>;

export const OPS_FOCUS_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue";

export const OPS_INPUT_CLASS =
  `mt-1 min-h-11 w-full rounded-md border border-primary-dark/15 bg-white px-3 py-2.5 text-sm text-primary-dark transition focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/10 ${OPS_FOCUS_CLASS}`;

export const OPS_LABEL_CLASS =
  "text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/52";

export const OPS_PRIMARY_BUTTON_CLASS =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary-blue px-4 py-3 text-sm font-bold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60 ${OPS_FOCUS_CLASS}`;

export const OPS_SECONDARY_BUTTON_CLASS =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-primary-dark/10 px-4 py-3 text-sm font-bold text-primary-dark transition hover:border-primary-blue hover:text-primary-blue disabled:cursor-not-allowed disabled:opacity-60 ${OPS_FOCUS_CLASS}`;

export const OPS_DANGER_BUTTON_CLASS =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${OPS_FOCUS_CLASS}`;

export const OPS_TABLE_SCROLL_CLASS =
  `overflow-x-auto ${OPS_FOCUS_CLASS}`;

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function noticeFromParams(
  params: OpsSearchParams,
  createdValue: string,
  successMessage: string,
) {
  const error = firstParam(params.error);

  if (error) {
    return {
      tone: "error" as const,
      message: error,
    };
  }

  if (firstParam(params.created) === createdValue) {
    return {
      tone: "success" as const,
      message: successMessage,
    };
  }

  return null;
}

export function formatZmw(value: number) {
  return new Intl.NumberFormat("en-ZM", {
    currency: "ZMW",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
