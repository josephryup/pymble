import type {
  OpsItTicketCategory,
  OpsItTicketPriority,
  OpsItTicketStatus,
} from "@/lib/ops/types";

export const IT_TICKET_CATEGORY_LABELS: Record<OpsItTicketCategory, string> = {
  access: "Account / access",
  email: "Email",
  hardware: "Hardware",
  network: "Network",
  other: "Other",
  printing: "Printing",
  security: "Security",
  site_connectivity: "Site connectivity",
  software: "Software",
};

export const IT_TICKET_PRIORITY_LABELS: Record<OpsItTicketPriority, string> = {
  high: "High",
  low: "Low",
  normal: "Normal",
  urgent: "Urgent",
};

export const IT_TICKET_STATUS_LABELS: Record<OpsItTicketStatus, string> = {
  awaiting_user: "Awaiting requester",
  cancelled: "Cancelled",
  closed: "Closed",
  in_progress: "In progress",
  on_hold: "On hold",
  open: "Open",
  resolved: "Resolved",
};

export const IT_TICKET_STATUS_BADGE: Record<OpsItTicketStatus, string> = {
  awaiting_user: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65",
  closed: "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  on_hold: "border-orange-200 bg-orange-50 text-orange-700",
  open: "border-blue-200 bg-blue-50 text-blue-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export const IT_TICKET_PRIORITY_BADGE: Record<OpsItTicketPriority, string> = {
  high: "border-orange-200 bg-orange-50 text-orange-700",
  low: "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65",
  normal: "border-sky-200 bg-sky-50 text-sky-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};
