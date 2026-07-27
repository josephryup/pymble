// Single source of truth for PDF visual tokens. Templates import from here so
// brand colors, fonts, and spacing stay consistent across every document.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pymble logo encoded as a data URL once at module load. @react-pdf/renderer's
 * Image component accepts data URLs across runtimes (Node + edge during build),
 * so this works without relying on filesystem paths at render time.
 *
 * Falls back to null if the asset can't be read — templates check before
 * rendering, so a missing logo never breaks the PDF.
 */
function loadPymbleLogoDataUrl(): string | null {
  try {
    const path = join(process.cwd(), "public", "logo.png");
    const buffer = readFileSync(path);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export const PYMBLE_LOGO_DATA_URL: string | null = loadPymbleLogoDataUrl();

export const PYMBLE_PDF_THEME = {
  colors: {
    primary: "#0B5394", // Pymble brand blue
    primaryDark: "#053057",
    accent: "#1F8F4A", // Pymble brand green
    ink: "#0E1726",
    body: "#2D3848",
    muted: "#5A6573",
    border: "#D8DCE3",
    surfaceSoft: "#F4F6F9",
    surfaceWarning: "#FFF8E6",
    surfaceDanger: "#FEECEE",
    white: "#FFFFFF",
  },
  typography: {
    family: "Helvetica", // built-in PDF font, no embed needed
    body: 9.5,
    small: 8,
    micro: 7,
    title: 18,
    sectionTitle: 11,
  },
  spacing: {
    page: 36,
    block: 16,
    row: 6,
    inlineSm: 4,
  },
  ruler: {
    thin: 0.5,
    medium: 1,
  },
} as const;

export type PymblePdfTheme = typeof PYMBLE_PDF_THEME;

/**
 * Standard money formatting for invoices, POs, payment requests. Always renders
 * in Zambian Kwacha because every Pymble record is denominated in ZMW. Pass an
 * override currency code only when a record explicitly carries a different one.
 */
export function formatPdfMoney(amount: number, currency: string = "ZMW") {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${safe.toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPdfDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(value);
}

export function formatPdfDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lusaka",
  }).format(value);
}

/**
 * Loose org-snapshot shape used by every PDF template. All fields optional so
 * callers can pass whatever subset their record actually has — the template
 * fills missing values from `PYMBLE_ORG_FALLBACK`.
 */
export type PymblePdfOrgSnapshot = {
  legal_name?: string;
  trading_name?: string | null;
  headquarters_address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  tpin?: string | null;
  vat_registration_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_branch?: string | null;
  bank_swift?: string | null;
};

/**
 * Reasonable defaults for organization profile used as fallbacks if the
 * record's company snapshot is incomplete. Override at render time.
 */
export const PYMBLE_ORG_FALLBACK: PymblePdfOrgSnapshot = {
  legal_name: "Pymble Construction Limited",
  trading_name: "Pymble Construction",
  headquarters_address: "31 Harry Mwangakumbula Rd, Woodlands, Lusaka, Zambia",
  phone: "+260 211 000 000",
  email: "info@pymbleconstruction.com",
  website: "https://pymbleconstruction.com",
  tpin: "",
  vat_registration_number: "",
  bank_name: "",
  bank_account_name: "Pymble Construction Limited",
  bank_account_number: "",
  bank_branch: "",
  bank_swift: "",
};
