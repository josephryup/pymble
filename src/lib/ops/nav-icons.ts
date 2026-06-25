import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  Archive,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Bus,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderOpen,
  Hammer,
  Handshake,
  HardHat,
  Images,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  MessageSquare,
  PackageSearch,
  ReceiptText,
  Ruler,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  ShoppingBag,
  ShoppingCart,
  UserPlus,
  Users,
  Wallet,
  Warehouse,
  Wrench,
} from "lucide-react";

/**
 * Every nav-visible module's icon, keyed by href.
 *
 * Lives in `lib` (not in the OpsShell "use client" file) so tests can pin
 * coverage cheaply — the `nav module icon coverage` test asserts every module
 * in `OPS_MODULES` has an entry here, so a future module added without an
 * icon fails CI rather than rendering as an empty pill.
 */
export const OPS_NAV_ICONS: Record<string, LucideIcon> = {
  // Top-level + overview
  "/ops": LayoutDashboard,

  // Operations
  "/ops/sites": Building2,
  "/ops/workers": HardHat,
  "/ops/attendance": ClipboardCheck,
  "/ops/approvals": ClipboardCheck,
  "/ops/notifications": Bell,
  "/ops/inbox": MessageSquare,
  "/ops/subcontractors": Handshake,

  // Engineering
  "/ops/daily-site-reports": ClipboardList,
  "/ops/engineering-controls": Ruler,
  "/ops/project-schedule": CalendarRange,

  // Procurement
  "/ops/material-requests": PackageSearch,
  "/ops/suppliers": Boxes,
  "/ops/rfq-po": ShoppingCart,
  "/ops/stores-inventory": Warehouse,
  "/ops/delivery-exceptions": AlertCircle,

  // Fleet and equipment
  "/ops/equipment": Wrench,
  "/ops/fleet-logistics": Bus,

  // Commercial
  "/ops/boq": BarChart3,
  "/ops/invoices": ReceiptText,
  "/ops/commercial": ChartNoAxesCombined,

  // Finance
  "/ops/project-budgets": Wallet,
  "/ops/payment-requests": Banknote,

  // Human Resources
  "/ops/employees": BriefcaseBusiness,
  "/ops/recruitment": UserPlus,
  "/ops/payroll": Wallet,
  "/ops/staff-payroll": BadgeDollarSign,
  "/ops/staff": KeyRound,

  // HSE
  "/ops/hse": ShieldPlus,
  "/ops/hse-compliance": ShieldCheck,
  "/ops/hse-weekly": ShieldAlert,

  // Records
  "/ops/photos": Images,
  "/ops/documents": FolderOpen,
  "/ops/modules": LayoutGrid,
  "/ops/glossary": BookOpen,
  "/ops/activity": Activity,
  "/ops/archive": Archive,
  "/ops/settings": Settings,

  // Executive
  "/ops/executive": ChartNoAxesCombined,
  "/ops/department-reports": FileText,

  // Per-department report entries
  "/ops/department-reports/d/operations": Briefcase,
  "/ops/department-reports/d/engineering": Hammer,
  "/ops/department-reports/d/procurement": ShoppingBag,
  "/ops/department-reports/d/commercial": LineChart,
  "/ops/department-reports/d/finance": Banknote,
  "/ops/department-reports/d/hse": ShieldAlert,
  "/ops/department-reports/d/hr": Users,
};
