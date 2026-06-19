import Link from "next/link";
import {
  Activity as ActivityIcon,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ClipboardCheck,
  FilePlus2,
  FileText,
  HardHat,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  ShieldPlus,
  ShoppingCart,
  Truck,
  UserCircle2,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { OpsChartPanel } from "@/components/ops/OpsChartPanel";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsOverviewMapPanel } from "@/components/ops/OpsOverviewMapPanel";
import { OpsReportShortcutGrid } from "@/components/ops/OpsReportShortcutGrid";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OpsUserProfile } from "@/lib/ops/auth";
import type { OpsHseExecutiveSafetyRollup } from "@/lib/ops/hse-executive";
import type { OpsOverview, OpsOverviewActivity } from "@/lib/ops/overview";
import type { OpsOverviewRoleMetrics } from "@/lib/ops/overview-role-metrics";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsProfileName, formatOpsRole } from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";
import {
  formatZmw,
  OPS_FOCUS_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";

type DashboardGroup =
  | "commercial"
  | "delivery"
  | "engineering"
  | "executive"
  | "finance"
  | "hse"
  | "people"
  | "procurement";

type DashboardAction = {
  href: string;
  icon: LucideIcon;
  label: string;
};

type DashboardActionItem = {
  href: string;
  message: string;
  tone: "good" | "info" | "warn";
};

type DashboardKpi = {
  href: string;
  icon: LucideIcon;
  label: string;
  tone?: "default" | "good" | "warn";
  trend?: string;
  value: string;
};

type DashboardChartDatum = {
  label: string;
  tone?: "default" | "good" | "warn";
  value: number;
};

type ShortcutGroup = {
  items: Array<{ href: string; label: string }>;
  title: string;
};

type OpsRoleOverviewDashboardProps = {
  hseSafetyRollup: OpsHseExecutiveSafetyRollup | null;
  metrics: OpsOverviewRoleMetrics;
  overview: OpsOverview;
  profile: OpsUserProfile;
};

const DASHBOARD_COPY: Record<
  DashboardGroup,
  { eyebrow: string; title: string }
> = {
  commercial: {
    eyebrow: "Commercial Workspace",
    title: "Commercial control",
  },
  delivery: {
    eyebrow: "Site Delivery",
    title: "Site delivery control",
  },
  engineering: {
    eyebrow: "Engineering Workspace",
    title: "Engineering control",
  },
  executive: {
    eyebrow: "Executive Workspace",
    title: "Business health",
  },
  finance: {
    eyebrow: "Finance Workspace",
    title: "Finance control",
  },
  hse: {
    eyebrow: "HSE Workspace",
    title: "Safety control",
  },
  people: {
    eyebrow: "People Workspace",
    title: "People control",
  },
  procurement: {
    eyebrow: "Procurement Workspace",
    title: "Procurement control",
  },
};

function canonicalHref(href: string) {
  return href.split(/[?#]/)[0] || href;
}

function canUseAction(role: OpsUserRole, href: string) {
  const route = canonicalHref(href);

  if (route === "/ops/profile") {
    return true;
  }

  return canAccessOpsHref(role, route);
}

function dashboardGroupForRole(role: OpsUserRole): DashboardGroup {
  if (["developer", "managing_director", "general_manager", "owner", "manager"].includes(role)) {
    return "executive";
  }

  if (["finance_manager", "accountant"].includes(role)) {
    return "finance";
  }

  if (["human_resource", "hr", "admin_receptionist"].includes(role)) {
    return "people";
  }

  if (["hse_officer", "hse_assistant_officer"].includes(role)) {
    return "hse";
  }

  if (["procurement_manager", "procurement", "procurement_assistant"].includes(role)) {
    return "procurement";
  }

  if (role === "quantity_surveyor") {
    return "commercial";
  }

  // Engineering Manager + Engineers see an engineering-focused dashboard
  // (Site Instructions, Quality Assurance / Quality Control, Daily Site Reports,
  // engineer-raised Material Requests waiting on sign-off). Per the organogram,
  // engineering is its own department reporting up to the MD/GM via the EM.
  if (role === "engineering_manager" || role === "engineer") {
    return "engineering";
  }

  // Operations Manager + Projects Manager + supervisors share the delivery
  // dashboard — operational execution view, NOT executive.
  return "delivery";
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-ZM", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Lusaka",
    }).format(new Date()),
  );

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

function firstName(displayName: string) {
  return displayName.split(/\s+/).filter(Boolean)[0] ?? "there";
}

function formatCount(value: number) {
  return value.toLocaleString("en-ZM");
}

function moneyChartValue(value: number) {
  return Math.round(Math.max(value, 0) / 1000);
}

function activityToneMeta(tone: OpsOverviewActivity["tone"]) {
  if (tone === "good") {
    return {
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      icon: CheckCircle2,
      iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      label: "Completed",
    };
  }

  if (tone === "warn") {
    return {
      badge: "bg-orange-50 text-orange-700 ring-orange-100",
      icon: CircleAlert,
      iconClass: "bg-orange-50 text-orange-700 ring-orange-100",
      label: "Needs review",
    };
  }

  return {
    badge: "bg-sky-50 text-sky-700 ring-sky-100",
    icon: ActivityIcon,
    iconClass: "bg-sky-50 text-sky-700 ring-sky-100",
    label: "Activity",
  };
}

function actionItemClass(tone: DashboardActionItem["tone"]) {
  if (tone === "good") {
    return "border-emerald-100 bg-emerald-50/80 text-emerald-800";
  }

  if (tone === "warn") {
    return "border-orange-100 bg-orange-50/80 text-orange-800";
  }

  return "border-sky-100 bg-sky-50/80 text-sky-800";
}

function workflowToneClass(tone?: "default" | "good" | "warn") {
  if (tone === "good") {
    return {
      border: "border-emerald-100 bg-emerald-50/80",
      dot: "bg-emerald-500",
      icon: CheckCircle2,
      text: "text-emerald-700",
    };
  }

  if (tone === "warn") {
    return {
      border: "border-orange-100 bg-orange-50/80",
      dot: "bg-orange-500",
      icon: CircleAlert,
      text: "text-orange-700",
    };
  }

  return {
    border: "border-primary-dark/8 bg-white",
    dot: "bg-primary-blue",
    icon: ActivityIcon,
    text: "text-primary-blue",
  };
}

function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lusaka",
  }).format(new Date(value));
}

function humanizeActivityMessage(message: string) {
  return message
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

function actionSetForGroup(group: DashboardGroup): DashboardAction[] {
  const actions: Record<DashboardGroup, DashboardAction[]> = {
    commercial: [
      { href: "/ops/commercial", icon: BarChart3, label: "Review IPCs" },
      { href: "/ops/boq", icon: ReceiptText, label: "Open BOQs" },
      { href: "/ops/invoices?create=invoice#invoice-create-panel", icon: FilePlus2, label: "Create invoice" },
    ],
    delivery: [
      { href: "/ops/daily-site-reports", icon: FileText, label: "Daily report" },
      { href: "/ops/attendance", icon: ClipboardCheck, label: "Attendance" },
      { href: "/ops/material-requests", icon: FilePlus2, label: "Material request" },
    ],
    engineering: [
      { href: "/ops/daily-site-reports", icon: FileText, label: "Daily site report" },
      { href: "/ops/engineering-controls", icon: ClipboardCheck, label: "Site instructions" },
      { href: "/ops/material-requests", icon: FilePlus2, label: "Material request" },
    ],
    executive: [
      { href: "/ops/executive", icon: BarChart3, label: "Executive dashboard" },
      { href: "/ops/approvals", icon: ClipboardCheck, label: "Approvals" },
      { href: "/ops/payment-requests", icon: BadgeDollarSign, label: "Payment queue" },
    ],
    finance: [
      { href: "/ops/payment-requests", icon: BadgeDollarSign, label: "Payment requests" },
      { href: "/ops/invoices", icon: ReceiptText, label: "Invoices" },
      { href: "/ops/payroll", icon: Users, label: "Payroll" },
    ],
    hse: [
      { href: "/ops/hse", icon: ShieldPlus, label: "Log incident" },
      { href: "/ops/hse-compliance", icon: ShieldCheck, label: "Compliance" },
      { href: "/ops/daily-site-reports", icon: FileText, label: "Site reports" },
    ],
    people: [
      { href: "/ops/employees", icon: BriefcaseBusiness, label: "Employees" },
      { href: "/ops/employees", icon: CalendarDays, label: "Leave requests" },
      { href: "/ops/staff", icon: Users, label: "Staff access" },
    ],
    procurement: [
      { href: "/ops/material-requests", icon: PackageSearch, label: "Demand queue" },
      { href: "/ops/rfq-po", icon: ShoppingCart, label: "Create RFQ" },
      { href: "/ops/suppliers", icon: Users, label: "Suppliers" },
    ],
  };

  return actions[group];
}

function contextLine(
  group: DashboardGroup,
  overview: OpsOverview,
  metrics: OpsOverviewRoleMetrics,
  hseSafetyRollup: OpsHseExecutiveSafetyRollup | null,
) {
  if (group === "executive") {
    const escalationText =
      metrics.escalations.total > 0
        ? ` ${metrics.escalations.total} SLA escalation${
            metrics.escalations.total === 1 ? "" : "s"
          } need leadership visibility.`
        : "";

    return `${overview.sites.length} live project site${
      overview.sites.length === 1 ? "" : "s"
    }, ${metrics.finance.paymentRequestsPending} payment request${
      metrics.finance.paymentRequestsPending === 1 ? "" : "s"
    } in the queue, and ${
      hseSafetyRollup ? `${hseSafetyRollup.pressureScore}/100 Health, Safety and Environment pressure` : "Health, Safety and Environment pressure tracked"
    }.${escalationText}`;
  }

  if (group === "delivery" || group === "engineering") {
    return `${overview.attendancePings.length} attendance ping${
      overview.attendancePings.length === 1 ? "" : "s"
    } today across ${overview.sites.length} active site${
      overview.sites.length === 1 ? "" : "s"
    }.`;
  }

  if (group === "procurement") {
    return `${metrics.procurement.openMaterialRequests} material request${
      metrics.procurement.openMaterialRequests === 1 ? "" : "s"
    }, ${metrics.procurement.activeRfqs} RFQ package${
      metrics.procurement.activeRfqs === 1 ? "" : "s"
    }, and ${metrics.procurement.posAwaitingDelivery} PO${
      metrics.procurement.posAwaitingDelivery === 1 ? "" : "s"
    } awaiting delivery.`;
  }

  if (group === "commercial") {
    return `${metrics.commercial.activeIpcs} active IPC${
      metrics.commercial.activeIpcs === 1 ? "" : "s"
    }, ${metrics.commercial.activeVariations} variation${
      metrics.commercial.activeVariations === 1 ? "" : "s"
    }, and ${formatZmw(metrics.commercial.unpaidInvoiceAmount)} not yet paid.`;
  }

  if (group === "finance") {
    return `${metrics.finance.paymentRequestsPending} payment request${
      metrics.finance.paymentRequestsPending === 1 ? "" : "s"
    } need finance movement, with ${formatZmw(metrics.finance.overduePaymentAmount)} overdue.`;
  }

  if (group === "hse") {
    return `${metrics.hse.openIncidents} open incident${
      metrics.hse.openIncidents === 1 ? "" : "s"
    }, ${metrics.hse.openCorrectiveActions} corrective action${
      metrics.hse.openCorrectiveActions === 1 ? "" : "s"
    }, and ${metrics.hse.trainingExpiringSoon} training record${
      metrics.hse.trainingExpiringSoon === 1 ? "" : "s"
    } due within 30 days.`;
  }

  return `${metrics.people.activeEmployees} active employee${
    metrics.people.activeEmployees === 1 ? "" : "s"
  }, ${metrics.people.pendingLeaveRequests} pending leave request${
    metrics.people.pendingLeaveRequests === 1 ? "" : "s"
  }, and ${metrics.people.onboardingOpenItems} onboarding item${
    metrics.people.onboardingOpenItems === 1 ? "" : "s"
  } open.`;
}

function kpisForGroup(
  group: DashboardGroup,
  overview: OpsOverview,
  metrics: OpsOverviewRoleMetrics,
  hseSafetyRollup: OpsHseExecutiveSafetyRollup | null,
): DashboardKpi[] {
  if (group === "executive") {
    return [
      {
        href: "/ops/sites",
        icon: Building2,
        label: "Active sites",
        tone: "good",
        trend: "Live",
        value: formatCount(overview.sites.length),
      },
      {
        href: "/ops/payment-requests",
        icon: BadgeDollarSign,
        label: "Payment queue",
        tone: metrics.finance.paymentRequestsPending > 0 ? "warn" : "good",
        trend: metrics.finance.paymentRequestsPending > 0 ? "Needs review" : "Clear",
        value: formatCount(metrics.finance.paymentRequestsPending),
      },
      {
        href: "/ops/approvals",
        icon: ClipboardCheck,
        label: "Open approvals",
        tone: overview.openApprovals > 0 ? "warn" : "good",
        trend: overview.openApprovals > 0 ? "Today" : "Clear",
        value: formatCount(overview.openApprovals),
      },
      {
        href: "/ops/hse",
        icon: ShieldCheck,
        label: "Health, Safety and Environment pressure",
        tone: hseSafetyRollup?.pressureLevel === "urgent" ? "warn" : "default",
        trend: hseSafetyRollup?.pressureLevel ?? "Live",
        value: hseSafetyRollup ? `${hseSafetyRollup.pressureScore}/100` : formatCount(metrics.hse.openIncidents),
      },
    ];
  }

  if (group === "delivery" || group === "engineering") {
    return [
      {
        href: "/ops/sites",
        icon: Building2,
        label: "Active sites",
        tone: "good",
        value: formatCount(overview.sites.length),
      },
      {
        href: "/ops/attendance",
        icon: ClipboardCheck,
        label: "Today attendance",
        tone: overview.openApprovals > 0 ? "warn" : "good",
        trend: overview.openApprovals > 0 ? "Review" : "Logged",
        value: formatCount(overview.attendancePings.length),
      },
      {
        href: "/ops/material-requests",
        icon: PackageSearch,
        label: "Material requests",
        tone: metrics.procurement.openMaterialRequests > 0 ? "warn" : "good",
        value: formatCount(metrics.procurement.openMaterialRequests),
      },
      {
        href: "/ops/daily-site-reports",
        icon: FileText,
        label: "Site reports",
        trend: "Daily",
        value: formatCount(overview.sites.length),
      },
    ];
  }

  if (group === "procurement") {
    return [
      {
        href: "/ops/material-requests",
        icon: PackageSearch,
        label: "Demand queue",
        tone: metrics.procurement.openMaterialRequests > 0 ? "warn" : "good",
        value: formatCount(metrics.procurement.openMaterialRequests),
      },
      {
        href: "/ops/rfq-po",
        icon: ShoppingCart,
        label: "Active RFQs",
        tone: metrics.procurement.activeRfqs > 0 ? "default" : "good",
        value: formatCount(metrics.procurement.activeRfqs),
      },
      {
        href: "/ops/rfq-po",
        icon: Truck,
        label: "POs awaiting delivery",
        tone: metrics.procurement.posAwaitingDelivery > 0 ? "warn" : "good",
        value: formatCount(metrics.procurement.posAwaitingDelivery),
      },
      {
        href: "/ops/delivery-exceptions",
        icon: ShieldPlus,
        label: "Delivery exceptions",
        tone: metrics.procurement.deliveryExceptions > 0 ? "warn" : "good",
        value: formatCount(metrics.procurement.deliveryExceptions),
      },
    ];
  }

  if (group === "commercial") {
    return [
      {
        href: "/ops/boq",
        icon: ReceiptText,
        label: "Latest BOQ",
        tone: overview.latestBoq ? "good" : "default",
        value: overview.latestBoq ? formatZmw(overview.latestBoq.budgeted_total) : "No BOQ",
      },
      {
        href: "/ops/commercial",
        icon: BarChart3,
        label: "Active IPCs",
        tone: metrics.commercial.activeIpcs > 0 ? "default" : "good",
        value: formatCount(metrics.commercial.activeIpcs),
      },
      {
        href: "/ops/commercial",
        icon: FileText,
        label: "Variations",
        tone: metrics.commercial.activeVariations > 0 ? "warn" : "good",
        value: formatCount(metrics.commercial.activeVariations),
      },
      {
        href: "/ops/invoices",
        icon: BadgeDollarSign,
        label: "Unpaid invoices",
        tone: metrics.commercial.unpaidInvoiceAmount > 0 ? "warn" : "good",
        value: formatZmw(metrics.commercial.unpaidInvoiceAmount),
      },
    ];
  }

  if (group === "finance") {
    return [
      {
        href: "/ops/payment-requests",
        icon: BadgeDollarSign,
        label: "Payment queue",
        tone: metrics.finance.paymentRequestsPending > 0 ? "warn" : "good",
        value: formatCount(metrics.finance.paymentRequestsPending),
      },
      {
        href: "/ops/payment-requests",
        icon: CalendarDays,
        label: "Overdue payments",
        tone: metrics.finance.overduePaymentAmount > 0 ? "warn" : "good",
        value: formatZmw(metrics.finance.overduePaymentAmount),
      },
      {
        href: "/ops/invoices",
        icon: ReceiptText,
        label: "Paid this month",
        tone: "good",
        value: formatZmw(metrics.finance.paidInvoicesThisMonth),
      },
      {
        href: "/ops/payroll",
        icon: Users,
        label: "Payroll draft",
        tone: overview.draftPayroll ? "warn" : "default",
        value: overview.draftPayroll ? formatZmw(overview.draftPayroll.total_net) : "No draft",
      },
    ];
  }

  if (group === "hse") {
    return [
      {
        href: "/ops/hse",
        icon: ShieldPlus,
        label: "Open incidents",
        tone: metrics.hse.openIncidents > 0 ? "warn" : "good",
        value: formatCount(metrics.hse.openIncidents),
      },
      {
        href: "/ops/hse",
        icon: ClipboardCheck,
        label: "Corrective actions",
        tone: metrics.hse.openCorrectiveActions > 0 ? "warn" : "good",
        value: formatCount(metrics.hse.openCorrectiveActions),
      },
      {
        href: "/ops/hse",
        icon: CalendarDays,
        label: "Overdue actions",
        tone: metrics.hse.overdueCorrectiveActions > 0 ? "warn" : "good",
        value: formatCount(metrics.hse.overdueCorrectiveActions),
      },
      {
        href: "/ops/hse-compliance",
        icon: ShieldCheck,
        label: "Training due soon",
        tone: metrics.hse.trainingExpiringSoon > 0 ? "warn" : "good",
        value: formatCount(metrics.hse.trainingExpiringSoon),
      },
    ];
  }

  return [
    {
      href: "/ops/employees",
      icon: BriefcaseBusiness,
      label: "Active employees",
      tone: "good",
      value: formatCount(metrics.people.activeEmployees),
    },
    {
      href: "/ops/employees",
      icon: CalendarDays,
      label: "Pending leave",
      tone: metrics.people.pendingLeaveRequests > 0 ? "warn" : "good",
      value: formatCount(metrics.people.pendingLeaveRequests),
    },
    {
      href: "/ops/employees",
      icon: ClipboardCheck,
      label: "Onboarding items",
      tone: metrics.people.onboardingOpenItems > 0 ? "warn" : "good",
      value: formatCount(metrics.people.onboardingOpenItems),
    },
    {
      href: "/ops/employees",
      icon: FileText,
      label: "Documents expiring",
      tone: metrics.people.expiringDocuments > 0 ? "warn" : "good",
      value: formatCount(metrics.people.expiringDocuments),
    },
  ];
}

function chartDataForGroup(
  group: DashboardGroup,
  overview: OpsOverview,
  metrics: OpsOverviewRoleMetrics,
  hseSafetyRollup: OpsHseExecutiveSafetyRollup | null,
): DashboardChartDatum[] {
  if (group === "executive") {
    return [
      { label: "Sites", tone: "good", value: overview.sites.length },
      { label: "Approvals", tone: overview.openApprovals > 0 ? "warn" : "good", value: overview.openApprovals },
      { label: "Payment queue", tone: metrics.finance.paymentRequestsPending > 0 ? "warn" : "good", value: metrics.finance.paymentRequestsPending },
      { label: "Health, Safety and Environment pressure", tone: hseSafetyRollup?.pressureLevel === "urgent" ? "warn" : "default", value: hseSafetyRollup?.pressureScore ?? metrics.hse.openIncidents },
      { label: "Delivery exceptions", tone: metrics.procurement.deliveryExceptions > 0 ? "warn" : "good", value: metrics.procurement.deliveryExceptions },
    ];
  }

  if (group === "delivery" || group === "engineering") {
    return [
      { label: "Sites", tone: "good", value: overview.sites.length },
      { label: "Attendance", tone: "good", value: overview.attendancePings.length },
      { label: "Approvals", tone: overview.openApprovals > 0 ? "warn" : "good", value: overview.openApprovals },
      { label: "Material requests", tone: metrics.procurement.openMaterialRequests > 0 ? "warn" : "good", value: metrics.procurement.openMaterialRequests },
      { label: "Photos", value: overview.sitePhotos.length },
    ];
  }

  if (group === "procurement") {
    return [
      { label: "Requests", tone: metrics.procurement.openMaterialRequests > 0 ? "warn" : "good", value: metrics.procurement.openMaterialRequests },
      { label: "RFQs", value: metrics.procurement.activeRfqs },
      { label: "POs awaiting", tone: metrics.procurement.posAwaitingDelivery > 0 ? "warn" : "good", value: metrics.procurement.posAwaitingDelivery },
      { label: "Exceptions", tone: metrics.procurement.deliveryExceptions > 0 ? "warn" : "good", value: metrics.procurement.deliveryExceptions },
    ];
  }

  if (group === "commercial") {
    return [
      { label: "IPCs", value: metrics.commercial.activeIpcs },
      { label: "Variations", tone: metrics.commercial.activeVariations > 0 ? "warn" : "good", value: metrics.commercial.activeVariations },
      { label: "Draft invoices", tone: overview.draftInvoices > 0 ? "warn" : "good", value: overview.draftInvoices },
      { label: "Unpaid ZMW k", tone: metrics.commercial.unpaidInvoiceAmount > 0 ? "warn" : "good", value: moneyChartValue(metrics.commercial.unpaidInvoiceAmount) },
    ];
  }

  if (group === "finance") {
    return [
      { label: "Payment queue", tone: metrics.finance.paymentRequestsPending > 0 ? "warn" : "good", value: metrics.finance.paymentRequestsPending },
      { label: "Approved ZMW k", value: moneyChartValue(metrics.finance.approvedPaymentAmount) },
      { label: "Overdue ZMW k", tone: metrics.finance.overduePaymentAmount > 0 ? "warn" : "good", value: moneyChartValue(metrics.finance.overduePaymentAmount) },
      { label: "Paid ZMW k", tone: "good", value: moneyChartValue(metrics.finance.paidInvoicesThisMonth) },
    ];
  }

  if (group === "hse") {
    return [
      { label: "Incidents", tone: metrics.hse.openIncidents > 0 ? "warn" : "good", value: metrics.hse.openIncidents },
      { label: "Actions", tone: metrics.hse.openCorrectiveActions > 0 ? "warn" : "good", value: metrics.hse.openCorrectiveActions },
      { label: "Overdue", tone: metrics.hse.overdueCorrectiveActions > 0 ? "warn" : "good", value: metrics.hse.overdueCorrectiveActions },
      { label: "Training due", tone: metrics.hse.trainingExpiringSoon > 0 ? "warn" : "good", value: metrics.hse.trainingExpiringSoon },
    ];
  }

  return [
    { label: "Employees", tone: "good", value: metrics.people.activeEmployees },
    { label: "On leave", value: metrics.people.onLeaveToday },
    { label: "Pending leave", tone: metrics.people.pendingLeaveRequests > 0 ? "warn" : "good", value: metrics.people.pendingLeaveRequests },
    { label: "Onboarding", tone: metrics.people.onboardingOpenItems > 0 ? "warn" : "good", value: metrics.people.onboardingOpenItems },
    { label: "Documents", tone: metrics.people.expiringDocuments > 0 ? "warn" : "good", value: metrics.people.expiringDocuments },
  ];
}

function actionsForGroup(
  group: DashboardGroup,
  overview: OpsOverview,
  metrics: OpsOverviewRoleMetrics,
  hseSafetyRollup: OpsHseExecutiveSafetyRollup | null,
): DashboardActionItem[] {
  const actions: DashboardActionItem[] = [];

  if (group === "executive") {
    if (metrics.escalations.total > 0) {
      actions.push({
        href: "/ops/approvals",
        message: `${metrics.escalations.total} SLA escalation${
          metrics.escalations.total === 1 ? "" : "s"
        } need follow-up across approvals, materials, payments, or deliveries.`,
        tone: "warn",
      });
    }

    if (overview.openApprovals > 0) {
      actions.push({
        href: "/ops/approvals",
        message: `${overview.openApprovals} approval item${overview.openApprovals === 1 ? "" : "s"} need attention today.`,
        tone: "warn",
      });
    }

    if (metrics.finance.paymentRequestsPending > 0) {
      actions.push({
        href: "/ops/payment-requests",
        message: `${metrics.finance.paymentRequestsPending} payment request${metrics.finance.paymentRequestsPending === 1 ? "" : "s"} are waiting in the finance queue.`,
        tone: "warn",
      });
    }

    if (hseSafetyRollup && hseSafetyRollup.pressureLevel !== "steady") {
      actions.push({
        href: "/ops/hse",
        message: `Health, Safety and Environment pressure is ${hseSafetyRollup.pressureLevel} at ${hseSafetyRollup.pressureScore}/100.`,
        tone: "warn",
      });
    }
  }

  if (group === "delivery" || group === "engineering") {
    if (metrics.escalations.staleApprovals > 0) {
      actions.push({
        href: "/ops/approvals",
        message: `${metrics.escalations.staleApprovals} approval escalation${
          metrics.escalations.staleApprovals === 1 ? "" : "s"
        } may be blocking site movement.`,
        tone: "warn",
      });
    }

    if (metrics.escalations.staleMaterialRequests > 0) {
      actions.push({
        href: "/ops/material-requests",
        message: `${metrics.escalations.staleMaterialRequests} material request escalation${
          metrics.escalations.staleMaterialRequests === 1 ? "" : "s"
        } need site or procurement follow-up.`,
        tone: "warn",
      });
    }

    if (overview.openApprovals > 0) {
      actions.push({
        href: "/ops/attendance",
        message: `${overview.openApprovals} attendance record${overview.openApprovals === 1 ? "" : "s"} need approval before payroll can stay clean.`,
        tone: "warn",
      });
    }

    if (metrics.procurement.openMaterialRequests > 0) {
      actions.push({
        href: "/ops/material-requests",
        message: `${metrics.procurement.openMaterialRequests} material request${metrics.procurement.openMaterialRequests === 1 ? "" : "s"} are open for site follow-up.`,
        tone: "info",
      });
    }
  }

  if (group === "procurement") {
    if (metrics.escalations.staleMaterialRequests > 0) {
      actions.push({
        href: "/ops/material-requests",
        message: `${metrics.escalations.staleMaterialRequests} material request escalation${
          metrics.escalations.staleMaterialRequests === 1 ? "" : "s"
        } are past the expected follow-up window.`,
        tone: "warn",
      });
    }

    if (metrics.escalations.staleDeliveryExceptions > 0) {
      actions.push({
        href: "/ops/delivery-exceptions",
        message: `${metrics.escalations.staleDeliveryExceptions} delivery exception escalation${
          metrics.escalations.staleDeliveryExceptions === 1 ? "" : "s"
        } need supplier action.`,
        tone: "warn",
      });
    }

    if (metrics.procurement.openMaterialRequests > 0) {
      actions.push({
        href: "/ops/material-requests",
        message: `Review ${metrics.procurement.openMaterialRequests} approved or submitted material request${metrics.procurement.openMaterialRequests === 1 ? "" : "s"}.`,
        tone: "warn",
      });
    }

    if (metrics.procurement.deliveryExceptions > 0) {
      actions.push({
        href: "/ops/delivery-exceptions",
        message: `${metrics.procurement.deliveryExceptions} delivery exception${metrics.procurement.deliveryExceptions === 1 ? "" : "s"} need supplier follow-up.`,
        tone: "warn",
      });
    }

    if (metrics.procurement.posAwaitingDelivery > 0) {
      actions.push({
        href: "/ops/rfq-po",
        message: `${metrics.procurement.posAwaitingDelivery} issued PO${metrics.procurement.posAwaitingDelivery === 1 ? "" : "s"} are not fully received yet.`,
        tone: "info",
      });
    }
  }

  if (group === "commercial") {
    if (metrics.commercial.activeVariations > 0) {
      actions.push({
        href: "/ops/commercial",
        message: `${metrics.commercial.activeVariations} variation${metrics.commercial.activeVariations === 1 ? "" : "s"} need commercial visibility.`,
        tone: "warn",
      });
    }

    if (overview.draftInvoices > 0) {
      actions.push({
        href: "/ops/invoices",
        message: `${overview.draftInvoices} draft invoice${overview.draftInvoices === 1 ? "" : "s"} should be checked before sending.`,
        tone: "info",
      });
    }
  }

  if (group === "finance") {
    if (metrics.escalations.stalePaymentRequests > 0) {
      actions.push({
        href: "/ops/payment-requests",
        message: `${metrics.escalations.stalePaymentRequests} payment request escalation${
          metrics.escalations.stalePaymentRequests === 1 ? "" : "s"
        } are overdue or stale.`,
        tone: "warn",
      });
    }

    if (metrics.finance.overduePaymentAmount > 0) {
      actions.push({
        href: "/ops/payment-requests",
        message: `${formatZmw(metrics.finance.overduePaymentAmount)} in approved or review-stage payments is overdue.`,
        tone: "warn",
      });
    }

    if (overview.failedPayouts > 0) {
      actions.push({
        href: "/ops/payroll",
        message: `${overview.failedPayouts} payroll payout${overview.failedPayouts === 1 ? "" : "s"} failed and need follow-up.`,
        tone: "warn",
      });
    }

    if (overview.draftPayroll) {
      actions.push({
        href: "/ops/payroll",
        message: `Draft payroll for ${overview.draftPayroll.period_label} is ready for review.`,
        tone: "info",
      });
    }
  }

  if (group === "hse") {
    if (metrics.hse.openIncidents > 0) {
      actions.push({
        href: "/ops/hse",
        message: `${metrics.hse.openIncidents} incident${metrics.hse.openIncidents === 1 ? "" : "s"} remain open for investigation or closure.`,
        tone: "warn",
      });
    }

    if (metrics.hse.overdueCorrectiveActions > 0) {
      actions.push({
        href: "/ops/hse",
        message: `${metrics.hse.overdueCorrectiveActions} corrective action${metrics.hse.overdueCorrectiveActions === 1 ? "" : "s"} are overdue.`,
        tone: "warn",
      });
    }

    if (metrics.hse.trainingExpiringSoon > 0) {
      actions.push({
        href: "/ops/hse-compliance",
        message: `${metrics.hse.trainingExpiringSoon} training record${metrics.hse.trainingExpiringSoon === 1 ? "" : "s"} expire within 30 days.`,
        tone: "info",
      });
    }
  }

  if (group === "people") {
    if (metrics.people.pendingLeaveRequests > 0) {
      actions.push({
        href: "/ops/employees",
        message: `${metrics.people.pendingLeaveRequests} leave request${metrics.people.pendingLeaveRequests === 1 ? "" : "s"} need HR review.`,
        tone: "warn",
      });
    }

    if (metrics.people.onboardingOpenItems > 0) {
      actions.push({
        href: "/ops/employees",
        message: `${metrics.people.onboardingOpenItems} onboarding item${metrics.people.onboardingOpenItems === 1 ? "" : "s"} remain open.`,
        tone: "info",
      });
    }

    if (metrics.people.expiringDocuments > 0) {
      actions.push({
        href: "/ops/employees",
        message: `${metrics.people.expiringDocuments} accepted HR document${metrics.people.expiringDocuments === 1 ? "" : "s"} expire within 30 days.`,
        tone: "warn",
      });
    }
  }

  if (actions.length === 0) {
    actions.push({
      href: "/ops/notifications",
      message: "All clear for now. New workflow alerts will appear in notifications.",
      tone: "good",
    });
  }

  return actions;
}

function shortcutGroupsForRole(group: DashboardGroup, role: OpsUserRole): ShortcutGroup[] {
  const groups: Record<DashboardGroup, ShortcutGroup[]> = {
    commercial: [
      {
        title: "Commercial controls",
        items: [
          { href: "/ops/boq", label: "BOQ documents" },
          { href: "/ops/commercial", label: "IPCs and variations" },
          { href: "/ops/invoices", label: "Invoice register" },
          { href: "/ops/project-budgets", label: "Project budgets" },
        ],
      },
      {
        title: "Source records",
        items: [
          { href: "/ops/sites", label: "Projects and sites" },
          { href: "/ops/rfq-po", label: "RFQs and POs" },
          { href: "/ops/documents", label: "Controlled documents" },
        ],
      },
    ],
    delivery: [
      {
        title: "Site delivery",
        items: [
          { href: "/ops/sites", label: "Projects and sites" },
          { href: "/ops/attendance", label: "Attendance" },
          { href: "/ops/daily-site-reports", label: "Daily site reports" },
          { href: "/ops/engineering-controls", label: "Instructions and Quality Assurance and Quality Control" },
        ],
      },
      {
        title: "Site demand",
        items: [
          { href: "/ops/material-requests", label: "Material requests" },
          { href: "/ops/stores-inventory", label: "Stores and inventory" },
          { href: "/ops/equipment", label: "Equipment" },
        ],
      },
    ],
    engineering: [
      {
        title: "Engineering control",
        items: [
          { href: "/ops/engineering-controls", label: "Site instructions and Quality Assurance and Quality Control" },
          { href: "/ops/daily-site-reports", label: "Daily site reports" },
          { href: "/ops/material-requests", label: "Material requests" },
          { href: "/ops/boq", label: "Bills of Quantities" },
        ],
      },
      {
        title: "Team and oversight",
        items: [
          { href: "/ops/sites", label: "Projects and sites" },
          { href: "/ops/workers", label: "Workers" },
          { href: "/ops/hse", label: "Health, Safety and Environment incidents" },
        ],
      },
    ],
    executive: [
      {
        title: "Executive control",
        items: [
          { href: "/ops/executive", label: "Executive dashboard" },
          { href: "/ops/approvals", label: "Approvals" },
          { href: "/ops/payment-requests", label: "Payment requests" },
          { href: "/ops/commercial", label: "Commercial controls" },
        ],
      },
      {
        title: "Operating risk",
        items: [
          { href: "/ops/hse", label: "HSE incidents" },
          { href: "/ops/delivery-exceptions", label: "Delivery exceptions" },
          { href: "/ops/employees", label: "People readiness" },
          { href: "/ops/settings", label: "Organization settings" },
        ],
      },
    ],
    finance: [
      {
        title: "Finance controls",
        items: [
          { href: "/ops/payment-requests", label: "Payment requests" },
          { href: "/ops/project-budgets", label: "Project budgets" },
          { href: "/ops/invoices", label: "Invoices" },
          { href: "/ops/payroll", label: "Payroll" },
        ],
      },
      {
        title: "Commercial source",
        items: [
          { href: "/ops/commercial", label: "Commercial controls" },
          { href: "/ops/suppliers", label: "Suppliers" },
          { href: "/ops/rfq-po", label: "RFQs and POs" },
        ],
      },
    ],
    hse: [
      {
        title: "Safety controls",
        items: [
          { href: "/ops/hse", label: "Incidents and actions" },
          { href: "/ops/hse-compliance", label: "Compliance controls" },
          { href: "/ops/daily-site-reports", label: "Daily site reports" },
          { href: "/ops/photos", label: "Site photos" },
        ],
      },
      {
        title: "Site context",
        items: [
          { href: "/ops/sites", label: "Projects and sites" },
          { href: "/ops/workers", label: "Workers" },
          { href: "/ops/documents", label: "Controlled documents" },
        ],
      },
    ],
    people: [
      {
        title: "People controls",
        items: [
          { href: "/ops/employees", label: "Employees and leave" },
          { href: "/ops/staff", label: "Staff access" },
          { href: "/ops/payroll", label: "Payroll" },
          { href: "/ops/documents", label: "Controlled documents" },
        ],
      },
      {
        title: "Readiness",
        items: [
          { href: "/ops/hse-compliance", label: "Training records" },
          { href: "/ops/attendance", label: "Attendance" },
          { href: "/ops/settings", label: "Organization settings" },
        ],
      },
    ],
    procurement: [
      {
        title: "Procurement flow",
        items: [
          { href: "/ops/material-requests", label: "Material requests" },
          { href: "/ops/rfq-po", label: "RFQs and POs" },
          { href: "/ops/stores-inventory", label: "Stores and inventory" },
          { href: "/ops/delivery-exceptions", label: "Delivery exceptions" },
        ],
      },
      {
        title: "Supplier records",
        items: [
          { href: "/ops/suppliers", label: "Supplier register" },
          { href: "/ops/project-budgets", label: "Budget context" },
          { href: "/ops/payment-requests", label: "Payment handoff" },
        ],
      },
    ],
  };

  return groups[group]
    .map((shortcutGroup) => ({
      ...shortcutGroup,
      items: shortcutGroup.items.filter((item) => canUseAction(role, item.href)),
    }))
    .filter((shortcutGroup) => shortcutGroup.items.length > 0);
}

function ActionQueue({ actions }: { actions: DashboardActionItem[] }) {
  return (
    <OpsDashboardPanel
      description="Role-aware workflow prompts, escalations, and operational blockers."
      eyebrow="Action queue"
      title="Needs attention"
    >
      <div className="grid gap-3">
        {actions.map((item) => (
          <Link
            className={`group grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-lg border px-3 py-3 text-sm font-semibold shadow-sm shadow-primary-dark/[0.02] transition hover:-translate-y-0.5 hover:shadow-md ${OPS_FOCUS_CLASS} ${actionItemClass(item.tone)}`}
            href={item.href}
            key={`${item.href}-${item.message}`}
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-white/70 ring-1 ring-current/10">
              {item.tone === "good" ? (
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldPlus className="size-4 shrink-0" aria-hidden="true" />
              )}
            </span>
            <span className="flex-1">{item.message}</span>
            <ArrowRight className="size-4 shrink-0 opacity-50 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </OpsDashboardPanel>
  );
}

function PipelinePanel({
  href,
  steps,
  title,
}: {
  href: string;
  steps: Array<{ label: string; tone?: "default" | "good" | "warn"; value: string }>;
  title: string;
}) {
  return (
    <OpsDashboardPanel
      actions={
        <Link className={OPS_SECONDARY_BUTTON_CLASS} href={href}>
          Open records
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      }
      eyebrow="Workflow"
      title={title}
    >
      <div className="grid gap-3 min-[620px]:grid-cols-2">
        {steps.map((step, index) => {
          const tone = workflowToneClass(step.tone);
          const Icon = tone.icon;

          return (
            <div
              className={`rounded-lg border px-4 py-3 shadow-sm shadow-primary-dark/[0.02] ${tone.border}`}
              key={step.label}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-primary-dark/55">{step.label}</p>
                  <p className="mt-2 font-heading text-2xl font-semibold text-primary-dark">
                    {step.value}
                  </p>
                </div>
                <span className={`flex size-8 items-center justify-center rounded-md bg-white text-xs font-semibold ${tone.text} ring-1 ring-current/10`}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-dark/45">
                <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                Step {index + 1} signal
              </p>
            </div>
          );
        })}
      </div>
    </OpsDashboardPanel>
  );
}

function SiteActivityPanel({ overview }: { overview: OpsOverview }) {
  const attendanceBySite = new Map<string, number>();
  const photosBySite = new Map<string, number>();

  overview.attendancePings.forEach((record) => {
    attendanceBySite.set(record.site_id, (attendanceBySite.get(record.site_id) ?? 0) + 1);
  });
  overview.sitePhotos.forEach((record) => {
    photosBySite.set(record.site_id, (photosBySite.get(record.site_id) ?? 0) + 1);
  });

  return (
    <OpsDashboardPanel
      description="Active site coverage with today's attendance and photo evidence signals."
      eyebrow="Site activity"
      title="Live site coverage"
    >
      {overview.sites.length > 0 ? (
        <div className="grid gap-3">
          {overview.sites.slice(0, 5).map((site) => (
            <Link
              className={`grid gap-3 rounded-lg border border-primary-dark/8 bg-white px-4 py-3 text-sm shadow-sm shadow-primary-dark/[0.02] transition hover:-translate-y-0.5 hover:border-primary-blue/60 hover:shadow-md min-[620px]:grid-cols-[1fr_auto] ${OPS_FOCUS_CLASS}`}
              href="/ops/sites"
              key={site.id}
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue ring-1 ring-primary-blue/10">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-heading text-base font-semibold text-primary-dark">
                    {site.name}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-primary-dark/50">
                    <span>{site.code}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-100">
                      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      {site.status}
                    </span>
                  </span>
                </span>
              </span>
              <span className="flex flex-wrap gap-2 text-xs font-semibold text-primary-dark/60">
                <span className="rounded-full bg-primary-dark/[0.04] px-2.5 py-1">
                  {attendanceBySite.get(site.id) ?? 0} attendance
                </span>
                <span className="rounded-full bg-primary-dark/[0.04] px-2.5 py-1">
                  {photosBySite.get(site.id) ?? 0} photos
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid justify-items-center rounded-lg border border-dashed border-primary-dark/15 bg-primary-dark/[0.02] px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue ring-1 ring-primary-blue/10">
            <Building2 className="size-6" aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-heading text-lg font-semibold text-primary-dark">
            No active sites yet
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-primary-dark/58">
            Create sites to drive maps, reports, materials, and dashboard visibility.
          </p>
        </div>
      )}
    </OpsDashboardPanel>
  );
}

function CommercialSnapshot({ overview, metrics }: { metrics: OpsOverviewRoleMetrics; overview: OpsOverview }) {
  return (
    <OpsDashboardPanel eyebrow="Commercial" title="Value position">
      <div className="grid gap-3">
        <div className="rounded-md border border-primary-dark/10 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/42">
                Latest BOQ
              </p>
              <p className="mt-1 font-heading text-lg font-bold text-primary-dark">
                {overview.latestBoq?.title ?? "No BOQ yet"}
              </p>
              <p className="mt-2 text-sm text-primary-dark/60">
                {overview.latestBoq
                  ? `${formatZmw(overview.latestBoq.budgeted_total)} planned / ${formatZmw(
                      overview.latestBoq.actual_total,
                    )} actual`
                  : "BOQ records will anchor commercial reporting once created."}
              </p>
            </div>
            <ReceiptText className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
        </div>
        <div className="grid gap-3 min-[620px]:grid-cols-3">
          <div className="rounded-md border border-primary-dark/10 bg-primary-dark/[0.02] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/42">
              IPCs
            </p>
            <p className="mt-2 font-heading text-2xl font-bold text-primary-dark">
              {metrics.commercial.activeIpcs}
            </p>
          </div>
          <div className="rounded-md border border-primary-dark/10 bg-primary-dark/[0.02] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/42">
              Variations
            </p>
            <p className="mt-2 font-heading text-2xl font-bold text-primary-dark">
              {metrics.commercial.activeVariations}
            </p>
          </div>
          <div className="rounded-md border border-primary-dark/10 bg-primary-dark/[0.02] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/42">
              Unpaid
            </p>
            <p className="mt-2 font-heading text-2xl font-bold text-primary-dark">
              {formatZmw(metrics.commercial.unpaidInvoiceAmount)}
            </p>
          </div>
        </div>
      </div>
    </OpsDashboardPanel>
  );
}

function SafetySnapshot({
  hseSafetyRollup,
  metrics,
}: {
  hseSafetyRollup: OpsHseExecutiveSafetyRollup | null;
  metrics: OpsOverviewRoleMetrics;
}) {
  return (
    <OpsDashboardPanel
      actions={
        <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse">
          Open HSE
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      }
      eyebrow="HSE"
      title="Safety pressure"
    >
      <div className="grid gap-4">
        <div className="rounded-md border border-primary-dark/10 bg-primary-dark/[0.02] p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-heading text-4xl font-bold text-primary-dark">
                {hseSafetyRollup ? hseSafetyRollup.pressureScore : metrics.hse.openIncidents}
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/42">
                {hseSafetyRollup ? "Pressure index" : "Open incidents"}
              </p>
            </div>
            <span className="rounded-full border border-primary-dark/10 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/58">
              {hseSafetyRollup?.pressureLevel ?? "Live"}
            </span>
          </div>
          {hseSafetyRollup ? (
            <div
              aria-label="Health, Safety and Environment pressure index"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={hseSafetyRollup.pressureScore}
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-primary-dark/8"
              role="progressbar"
            >
              <div
                className={`h-full rounded-full ${
                  hseSafetyRollup.pressureLevel === "urgent"
                    ? "bg-red-500"
                    : hseSafetyRollup.pressureLevel === "watch"
                      ? "bg-orange-400"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${hseSafetyRollup.pressureScore}%` }}
              />
            </div>
          ) : null}
        </div>
        <div className="grid gap-2 min-[620px]:grid-cols-3">
          <Link className={`rounded-md border border-orange-200 bg-orange-50 px-3 py-3 text-sm font-bold text-orange-800 ${OPS_FOCUS_CLASS}`} href="/ops/hse">
            {metrics.hse.openIncidents} open incidents
          </Link>
          <Link className={`rounded-md border border-orange-200 bg-orange-50 px-3 py-3 text-sm font-bold text-orange-800 ${OPS_FOCUS_CLASS}`} href="/ops/hse">
            {metrics.hse.overdueCorrectiveActions} overdue actions
          </Link>
          <Link className={`rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-bold text-sky-800 ${OPS_FOCUS_CLASS}`} href="/ops/hse-compliance">
            {metrics.hse.trainingExpiringSoon} training due soon
          </Link>
        </div>
      </div>
    </OpsDashboardPanel>
  );
}

function ActivityPanel({ activity }: { activity: OpsOverviewActivity[] }) {
  return (
    <OpsDashboardPanel
      actions={
        <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/notifications">
          Workflow inbox
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      }
      description="A cleaner audit trail of the latest approvals, document events, and operational movement."
      eyebrow="Recent activity"
      title="Workspace timeline"
    >
      {activity.length > 0 ? (
        <div className="relative grid gap-3">
          <div className="absolute bottom-5 left-[1.12rem] top-5 w-px bg-primary-dark/10" aria-hidden="true" />
          {activity.slice(0, 6).map((item) => {
            const meta = activityToneMeta(item.tone);
            const Icon = meta.icon;

            return (
              <div
                className="relative grid grid-cols-[2.25rem_1fr] gap-3 rounded-lg border border-primary-dark/8 bg-white p-3 shadow-sm shadow-primary-dark/[0.02]"
                key={item.id}
              >
                <span
                  className={`relative z-10 flex size-9 items-center justify-center rounded-md ring-1 ${meta.iconClass}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-col gap-2 min-[560px]:flex-row min-[560px]:items-start min-[560px]:justify-between">
                    <p className="font-heading text-base font-semibold text-primary-dark">
                      {humanizeActivityMessage(item.message)}
                    </p>
                    <Badge
                      className={`h-auto w-fit gap-1 px-2.5 py-1 text-xs font-semibold ring-1 ${meta.badge}`}
                      variant="secondary"
                    >
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-primary-dark/45">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      {formatActivityTime(item.created_at)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-primary-dark/70">
                      <UserCircle2 className="size-3.5" aria-hidden="true" />
                      {item.actor_name ?? "System"}
                      {item.actor_role ? (
                        <span className="text-primary-dark/45">
                          · {formatOpsRole(item.actor_role)}
                        </span>
                      ) : null}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid justify-items-center rounded-lg border border-dashed border-primary-dark/15 bg-primary-dark/[0.02] px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue ring-1 ring-primary-blue/10">
            <ActivityIcon className="size-6" aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-heading text-lg font-semibold text-primary-dark">
            No activity captured yet
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-primary-dark/58">
            Approvals, uploads, comments, and status changes will appear here once the team starts
            moving records through the workspace.
          </p>
        </div>
      )}
    </OpsDashboardPanel>
  );
}

function PrimaryPanel({
  group,
  hseSafetyRollup,
  metrics,
  overview,
}: {
  group: DashboardGroup;
  hseSafetyRollup: OpsHseExecutiveSafetyRollup | null;
  metrics: OpsOverviewRoleMetrics;
  overview: OpsOverview;
}) {
  if (group === "delivery" || group === "engineering") {
    return <SiteActivityPanel overview={overview} />;
  }

  if (group === "procurement") {
    return (
      <PipelinePanel
        href="/ops/rfq-po"
        steps={[
          {
            label: "Demand ready",
            tone: metrics.procurement.openMaterialRequests > 0 ? "warn" : "good",
            value: formatCount(metrics.procurement.openMaterialRequests),
          },
          { label: "RFQs active", value: formatCount(metrics.procurement.activeRfqs) },
          {
            label: "POs awaiting delivery",
            tone: metrics.procurement.posAwaitingDelivery > 0 ? "warn" : "good",
            value: formatCount(metrics.procurement.posAwaitingDelivery),
          },
          {
            label: "Delivery exceptions",
            tone: metrics.procurement.deliveryExceptions > 0 ? "warn" : "good",
            value: formatCount(metrics.procurement.deliveryExceptions),
          },
        ]}
        title="Request to delivery"
      />
    );
  }

  if (group === "commercial") {
    return <CommercialSnapshot metrics={metrics} overview={overview} />;
  }

  if (group === "finance") {
    return (
      <PipelinePanel
        href="/ops/payment-requests"
        steps={[
          {
            label: "Requests pending",
            tone: metrics.finance.paymentRequestsPending > 0 ? "warn" : "good",
            value: formatCount(metrics.finance.paymentRequestsPending),
          },
          {
            label: "Approved exposure",
            value: formatZmw(metrics.finance.approvedPaymentAmount),
          },
          {
            label: "Overdue exposure",
            tone: metrics.finance.overduePaymentAmount > 0 ? "warn" : "good",
            value: formatZmw(metrics.finance.overduePaymentAmount),
          },
          {
            label: "Paid this month",
            tone: "good",
            value: formatZmw(metrics.finance.paidInvoicesThisMonth),
          },
        ]}
        title="Payment and receivables"
      />
    );
  }

  if (group === "hse") {
    return <SafetySnapshot hseSafetyRollup={hseSafetyRollup} metrics={metrics} />;
  }

  if (group === "people") {
    return (
      <PipelinePanel
        href="/ops/employees"
        steps={[
          { label: "Active employees", tone: "good", value: formatCount(metrics.people.activeEmployees) },
          {
            label: "On leave today",
            value: formatCount(metrics.people.onLeaveToday),
          },
          {
            label: "Pending leave",
            tone: metrics.people.pendingLeaveRequests > 0 ? "warn" : "good",
            value: formatCount(metrics.people.pendingLeaveRequests),
          },
          {
            label: "Documents expiring",
            tone: metrics.people.expiringDocuments > 0 ? "warn" : "good",
            value: formatCount(metrics.people.expiringDocuments),
          },
        ]}
        title="Workforce readiness"
      />
    );
  }

  return <CommercialSnapshot metrics={metrics} overview={overview} />;
}

export function OpsRoleOverviewDashboard({
  hseSafetyRollup,
  metrics,
  overview,
  profile,
}: OpsRoleOverviewDashboardProps) {
  const group = dashboardGroupForRole(profile.role);
  const copy = DASHBOARD_COPY[group];
  const displayName = formatOpsProfileName(profile.full_name, profile.role);
  const actions = actionSetForGroup(group).filter((action) => canUseAction(profile.role, action.href));
  const kpis = kpisForGroup(group, overview, metrics, hseSafetyRollup).filter((item) =>
    canUseAction(profile.role, item.href),
  );
  const actionItems = actionsForGroup(group, overview, metrics, hseSafetyRollup).filter((item) =>
    canUseAction(profile.role, item.href),
  );
  const shortcuts = shortcutGroupsForRole(group, profile.role);
  const showMap = ["delivery", "executive", "hse"].includes(group);

  return (
    <div className="w-full max-w-none space-y-5">
      <Card className="overflow-hidden py-0 shadow-sm shadow-primary-dark/[0.03]">
        <CardContent className="flex flex-col gap-5 p-5 md:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="h-auto gap-2 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary ring-1 ring-primary/10" variant="secondary">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {copy.eyebrow}
              </Badge>
            </div>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark md:text-4xl">
              {greeting()}, {firstName(displayName)}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-dark/62 md:text-base">
              {copy.title} for {formatOpsRole(profile.role)}.{" "}
              {contextLine(group, overview, metrics, hseSafetyRollup)}
            </p>
          </div>
          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Link
                    className={index === 0 ? OPS_PRIMARY_BUTTON_CLASS : OPS_SECONDARY_BUTTON_CLASS}
                    href={action.href}
                    key={action.href}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {action.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 min-[720px]:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <OpsKpiCard
            href={item.href}
            icon={item.icon}
            key={`${item.href}-${item.label}`}
            label={item.label}
            tone={item.tone}
            trend={item.trend}
            value={item.value}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <OpsChartPanel
          data={chartDataForGroup(group, overview, metrics, hseSafetyRollup)}
          description="Live counts from the records that matter most to this role."
          title={`${copy.title} signals`}
        />
        <ActionQueue actions={actionItems} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <PrimaryPanel
          group={group}
          hseSafetyRollup={hseSafetyRollup}
          metrics={metrics}
          overview={overview}
        />
        <ActivityPanel activity={overview.activity} />
      </div>

      {showMap ? (
        <OpsOverviewMapPanel
          activeDate={overview.activeDate}
          attendancePings={overview.attendancePings}
          headquarters={{
            addressLine: overview.profile.address_line,
            city: overview.profile.city,
            country: overview.profile.country,
            latitude: overview.profile.headquarters_latitude,
            longitude: overview.profile.headquarters_longitude,
            name: overview.profile.trading_name,
          }}
          openCashAdvances={overview.openCashAdvances}
          sitePhotos={overview.sitePhotos}
          sites={overview.sites}
          workers={overview.workers}
        />
      ) : null}

      {shortcuts.length > 0 ? (
        <section className="space-y-4" id="ops-overview-shortcuts">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
                Role shortcuts
              </p>
              <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
                Records for your work
              </h2>
            </div>
            <HardHat className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <OpsReportShortcutGrid groups={shortcuts} />
        </section>
      ) : null}

      {group !== "delivery" && group !== "executive" ? (
        <section className="grid gap-4 min-[720px]:grid-cols-2 xl:grid-cols-4">
          <Link className={`rounded-lg border border-primary-dark/10 bg-white p-4 transition hover:border-primary-blue hover:shadow-sm ${OPS_FOCUS_CLASS}`} href="/ops/sites">
            <Building2 className="size-5 text-primary-blue" aria-hidden="true" />
            <p className="mt-3 font-heading text-lg font-bold text-primary-dark">
              {overview.sites.length} active site{overview.sites.length === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-sm leading-6 text-primary-dark/58">
              Project/site records remain the source of truth across every dashboard.
            </p>
          </Link>
          <Link className={`rounded-lg border border-primary-dark/10 bg-white p-4 transition hover:border-primary-blue hover:shadow-sm ${OPS_FOCUS_CLASS}`} href="/ops/documents">
            <FileText className="size-5 text-primary-blue" aria-hidden="true" />
            <p className="mt-3 font-heading text-lg font-bold text-primary-dark">
              Controlled records
            </p>
            <p className="mt-2 text-sm leading-6 text-primary-dark/58">
              Attachments, documents, comments, and audit events stay connected to source records.
            </p>
          </Link>
          <Link className={`rounded-lg border border-primary-dark/10 bg-white p-4 transition hover:border-primary-blue hover:shadow-sm ${OPS_FOCUS_CLASS}`} href="/ops/notifications">
            <ShieldCheck className="size-5 text-primary-blue" aria-hidden="true" />
            <p className="mt-3 font-heading text-lg font-bold text-primary-dark">
              Workflow inbox
            </p>
            <p className="mt-2 text-sm leading-6 text-primary-dark/58">
              Notifications keep approvals, handoffs, and exceptions visible without manual chasing.
            </p>
          </Link>
          <Link className={`rounded-lg border border-primary-dark/10 bg-white p-4 transition hover:border-primary-blue hover:shadow-sm ${OPS_FOCUS_CLASS}`} href="/ops/modules">
            <Warehouse className="size-5 text-primary-blue" aria-hidden="true" />
            <p className="mt-3 font-heading text-lg font-bold text-primary-dark">
              Role modules
            </p>
            <p className="mt-2 text-sm leading-6 text-primary-dark/58">
              See the modules available to your role and the next planned work areas.
            </p>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
