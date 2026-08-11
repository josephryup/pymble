import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  AppWindow,
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
  FileSignature,
  FileText,
  FolderClock,
  FolderOpen,
  Hammer,
  Handshake,
  HardHat,
  Headset,
  Images,
  KeyRound,
  KeySquare,
  Laptop,
  Landmark,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LibraryBig,
  LifeBuoy,
  LineChart,
  ListChecks,
  MapPin,
  MessageSquare,
  MonitorCog,
  Network,
  ScrollText,
  PackageSearch,
  ReceiptText,
  Ruler,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  ShoppingBag,
  ShoppingCart,
  UserPlus,
  Users,
  HandCoins,
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
  "/ops/my-sites": MapPin,
  "/ops/sites": Building2,
  "/ops/workers": HardHat,
  "/ops/attendance": ClipboardCheck,
  "/ops/approvals": ClipboardCheck,
  "/ops/approvals/rules": ScrollText,
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
  "/ops/material-schedule": BarChart3,
  "/ops/invoices": ReceiptText,
  "/ops/quotations": FileSignature,
  "/ops/site-checklists": ClipboardCheck,
  "/ops/customers": Users,
  "/ops/commercial": ChartNoAxesCombined,

  // Finance
  "/ops/finance": LayoutDashboard,
  "/ops/cost-codes": Layers,
  "/ops/project-budgets": Wallet,
  "/ops/payment-requests": Banknote,
  // Money coming the other way — HandCoins reads as receiving, against the
  // Banknote used for what we pay out.
  "/ops/receivables": HandCoins,
  "/ops/finance/accounts": BookOpen,
  "/ops/finance/trial-balance": ChartNoAxesCombined,
  "/ops/finance/journal": ScrollText,
  "/ops/finance/legacy-projects": FolderClock,
  "/ops/finance/profit-and-loss": LineChart,
  "/ops/finance/balance-sheet": Scale,
  "/ops/finance/cash-flow-statement": Landmark,

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
  "/ops/it/helpdesk/mine": Headset,
  "/ops/it/handbook": BookOpen,

  // Information Technology
  "/ops/it": MonitorCog,
  "/ops/it/assets": Laptop,
  "/ops/it/helpdesk": LifeBuoy,
  "/ops/it/licenses": AppWindow,
  "/ops/it/access": KeyRound,
  "/ops/it/checklists": ListChecks,
  "/ops/it/policies": ScrollText,
  "/ops/it/credentials": KeySquare,
  "/ops/it/infrastructure": Network,
  "/ops/it/security": ShieldAlert,
  "/ops/it/module-access": ShieldCheck,
  "/ops/it/kb": LibraryBig,
  "/ops/department-reports/d/it": MonitorCog,

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

/**
 * One icon per nav group, keyed by `OpsModuleGroup.id`. Used by the collapsed
 * sidebar icon rail (OpsShell) so each group reads as a single glyph with a
 * hover flyout of its modules. Group ids are stable (see OPS_MODULE_GROUPS).
 */
export const OPS_GROUP_ICONS: Record<string, LucideIcon> = {
  workspace: LayoutDashboard,
  operations: Briefcase,
  engineering: Hammer,
  procurement: ShoppingBag,
  fleet: Bus,
  commercial: LineChart,
  finance: Banknote,
  hr: Users,
  hse: ShieldCheck,
  records: FolderOpen,
  it: MonitorCog,
  executive: BarChart3,
};
