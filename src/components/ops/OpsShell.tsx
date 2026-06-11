"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Bus,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  FolderOpen,
  HardHat,
  Images,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldPlus,
  PackageSearch,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UserCircle,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { OpsNavLink } from "@/components/ops/OpsNavLink";
import { OpsBrandMark } from "@/components/ops/OpsBrandMark";
import { OpsLocalRolePreviewGuard } from "@/components/ops/OpsLocalRolePreviewGuard";
import { OpsLocalRolePreviewPanel } from "@/components/ops/OpsLocalRolePreviewPanel";
import { OpsInstallPrompt } from "@/components/ops/OpsInstallPrompt";
import { OpsTopUtilityBar } from "@/components/ops/OpsTopUtilityBar";
import { OPS_BRAND, OPS_MODULE_GROUPS } from "@/lib/ops/constants";
import { visibleOpsModules, visibleOpsRouteModules } from "@/lib/ops/permissions";
import { formatOpsProfileName, formatOpsRole } from "@/lib/ops/roles";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";
import type { OpsReadyModule, OpsUserRole } from "@/lib/ops/types";

function initials(name?: string) {
  return (name ?? "Pymble User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function currentModuleTitle(pathname: string, modules: OpsReadyModule[]) {
  if (pathname.startsWith("/ops/profile")) {
    return "Profile";
  }

  const current = modules
    .filter((module) =>
      module.href === "/ops" ? pathname === "/ops" : pathname.startsWith(module.href),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  return current?.title ?? "Operations Workspace";
}

const NAV_ICON_BY_HREF: Record<string, LucideIcon> = {
  "/ops": LayoutDashboard,
  "/ops/approvals": ClipboardCheck,
  "/ops/attendance": ClipboardCheck,
  "/ops/boq": BarChart3,
  "/ops/commercial": ChartNoAxesCombined,
  "/ops/documents": FolderOpen,
  "/ops/employees": BriefcaseBusiness,
  "/ops/fleet-logistics": Bus,
  "/ops/hse": ShieldPlus,
  "/ops/hse-compliance": ShieldCheck,
  "/ops/invoices": ReceiptText,
  "/ops/material-requests": PackageSearch,
  "/ops/notifications": Bell,
  "/ops/payroll": BriefcaseBusiness,
  "/ops/photos": Images,
  "/ops/rfq-po": ShoppingCart,
  "/ops/settings": Settings,
  "/ops/sites": Building2,
  "/ops/staff": ShieldCheck,
  "/ops/stores-inventory": Warehouse,
  "/ops/suppliers": Boxes,
  "/ops/workers": HardHat,
};

function Navigation({
  modules,
  onNavigate,
}: {
  modules: OpsReadyModule[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const overviewModule = modules.find((module) => module.href === "/ops");
  const groupedModules = modules.filter((module) => module.href !== "/ops");
  const activeGroupId = groupedModules
    .filter((module) => pathname.startsWith(module.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.group;
  const [openGroupIds, setOpenGroupIds] = useState<string[]>(() =>
    activeGroupId ? [activeGroupId] : [],
  );
  const visibleOpenGroupIds =
    activeGroupId && !openGroupIds.includes(activeGroupId)
      ? [...openGroupIds, activeGroupId]
      : openGroupIds;

  if (modules.length === 0) {
    return (
      <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
        Profile access only
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {overviewModule ? (
        <OpsNavLink
          href={overviewModule.href}
          icon={NAV_ICON_BY_HREF[overviewModule.href]}
          onNavigate={onNavigate}
          title={overviewModule.title}
        />
      ) : null}
      {OPS_MODULE_GROUPS.map((group) => {
        const groupModules = groupedModules.filter((module) => module.group === group.id);

        if (groupModules.length === 0) {
          return null;
        }

        const isOpen = visibleOpenGroupIds.includes(group.id);
        const groupPanelId = `ops-nav-group-${group.id}`;

        return (
          <div
            className="overflow-hidden rounded-lg border border-border bg-card/80 shadow-sm shadow-primary-dark/5"
            key={group.id}
          >
            <button
              aria-controls={groupPanelId}
              aria-expanded={isOpen}
              className={`flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground transition hover:bg-muted hover:text-foreground ${OPS_FOCUS_CLASS}`}
              onClick={() =>
                setOpenGroupIds((current) =>
                  current.includes(group.id)
                    ? current.filter((groupId) => groupId !== group.id)
                    : [...current, group.id],
                )
              }
              type="button"
            >
              <span className="min-w-0 truncate">{group.title}</span>
              <span className="inline-flex items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                  {groupModules.length}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </span>
            </button>
            {isOpen ? (
              <div
                className="grid gap-1 border-t border-border bg-background/70 p-1.5"
                id={groupPanelId}
              >
                {groupModules.map((item) => (
                  <OpsNavLink
                    href={item.href}
                    icon={NAV_ICON_BY_HREF[item.href]}
                    key={item.href}
                    onNavigate={onNavigate}
                    title={item.title}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ProfilePanel({
  displayName,
  onNavigate,
  profileEmail,
  profileRole,
  unreadNotifications,
}: {
  displayName: string;
  onNavigate?: () => void;
  profileEmail?: string | null;
  profileRole?: OpsUserRole;
  unreadNotifications?: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm shadow-primary-dark/5">
      <Link
        className={`flex items-center gap-3 rounded-md p-1 transition hover:bg-muted ${OPS_FOCUS_CLASS}`}
        href="/ops/profile"
        onClick={onNavigate}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-foreground">
          {initials(displayName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-foreground">{displayName}</span>
          <span className="mt-0.5 block truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {formatOpsRole(profileRole)}
          </span>
        </span>
      </Link>
      {profileEmail ? (
        <p className="mt-2 truncate px-1 text-xs text-muted-foreground">{profileEmail}</p>
      ) : null}
      <Link
        className={`mt-3 flex min-h-10 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition hover:border-primary/30 hover:text-primary ${OPS_FOCUS_CLASS}`}
        href="/ops/notifications"
        onClick={onNavigate}
      >
        <span className="inline-flex items-center gap-2">
          <Bell className="size-3.5" aria-hidden="true" />
          Notifications
        </span>
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-1 text-[11px] font-black text-primary-foreground">
          {unreadNotifications ?? 0}
        </span>
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-xs font-bold text-muted-foreground transition hover:border-primary/30 hover:text-primary ${OPS_FOCUS_CLASS}`}
          href="/ops/profile"
          onClick={onNavigate}
        >
          <UserCircle className="size-3.5" aria-hidden="true" />
          Profile
        </Link>
        <Link
          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-xs font-bold text-muted-foreground transition hover:border-primary/30 hover:text-primary ${OPS_FOCUS_CLASS}`}
          href="/ops/profile#password"
          onClick={onNavigate}
        >
          <KeyRound className="size-3.5" aria-hidden="true" />
          Password
        </Link>
      </div>
      <form action="/api/ops/auth/logout" className="mt-2" method="post">
        <button
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-xs font-bold text-muted-foreground transition hover:border-destructive/30 hover:text-destructive ${OPS_FOCUS_CLASS}`}
          type="submit"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </div>
  );
}

function OpsLogoLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      aria-label={`${OPS_BRAND.companyName} operations overview`}
      className={`flex w-full items-center justify-start gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-sm shadow-primary-dark/5 transition hover:border-primary/30 ${OPS_FOCUS_CLASS}`}
      href="/ops"
      onClick={onNavigate}
    >
      <OpsBrandMark priority className="h-12 w-12 rounded-md" sizes="48px" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-primary-dark">
          Pymble Ops
        </span>
        <span className="block truncate text-[11px] font-semibold text-muted-foreground">
          Internal Terminal
        </span>
      </span>
    </Link>
  );
}

export function OpsShell({
  children,
  isLocalRolePreview = false,
  profileEmail,
  profileName,
  profileRole,
  unreadNotifications,
}: {
  children: React.ReactNode;
  isLocalRolePreview?: boolean;
  profileEmail?: string | null;
  profileName?: string;
  profileRole?: OpsUserRole;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const modules = useMemo(
    () => (profileRole ? visibleOpsModules(profileRole) : []),
    [profileRole],
  );
  const routeModules = useMemo(
    () => (profileRole ? visibleOpsRouteModules(profileRole) : []),
    [profileRole],
  );
  const displayName = formatOpsProfileName(profileName, profileRole);
  const currentTitle = currentModuleTitle(pathname, routeModules);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
        window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const drawer = mobileNavRef.current;

      if (!drawer) {
        return;
      }

      const focusableElements = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      const firstFocusable = mobileNavRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    });

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileNavOpen]);

  const closeMobileNav = () => {
    setIsMobileNavOpen(false);
    window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
  };

  return (
    <div className="ops-ui min-h-screen bg-background text-foreground">
      {isLocalRolePreview ? <OpsLocalRolePreviewGuard /> : null}
      <a
        className={`sr-only fixed left-4 top-4 z-[1000] rounded-md bg-card px-4 py-3 text-sm font-bold text-foreground shadow-lg focus:not-sr-only ${OPS_FOCUS_CLASS}`}
        href="#ops-main-content"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            aria-label={`${OPS_BRAND.companyName} operations overview`}
            className={`flex min-w-0 items-center gap-3 rounded-md ${OPS_FOCUS_CLASS}`}
            href="/ops"
          >
            <OpsBrandMark
              decorative
              priority
              className="h-10 w-10 rounded-md"
              sizes="40px"
            />
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                Pymble
              </span>
              <span className="block truncate text-sm font-bold text-primary-dark">
                {currentTitle}
              </span>
            </span>
          </Link>
          <button
            aria-controls="ops-mobile-navigation"
            aria-expanded={isMobileNavOpen}
            aria-label="Open operations navigation"
            className={`inline-flex size-11 items-center justify-center rounded-md border border-border text-foreground ${OPS_FOCUS_CLASS}`}
            onClick={() => setIsMobileNavOpen(true)}
            ref={mobileMenuButtonRef}
            type="button"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {isMobileNavOpen ? (
        <button
          aria-label="Close operations navigation"
          className="fixed inset-0 z-40 bg-foreground/45 lg:hidden"
          onClick={closeMobileNav}
          tabIndex={-1}
          type="button"
        />
      ) : null}

      {isMobileNavOpen ? (
        <aside
          aria-label="Operations navigation"
          aria-modal="true"
          className="fixed inset-y-0 left-0 z-50 w-[min(22rem,88vw)] bg-background text-foreground shadow-2xl lg:hidden"
          id="ops-mobile-navigation"
          ref={mobileNavRef}
          role="dialog"
        >
          <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-4">
            <div className="flex items-center gap-3">
              <OpsLogoLink onNavigate={closeMobileNav} />
              <button
                aria-label="Close operations navigation"
                className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/30 hover:text-primary ${OPS_FOCUS_CLASS}`}
                onClick={closeMobileNav}
                type="button"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="Operations workspace" className="min-h-0 overflow-y-auto pr-1">
              <Navigation modules={modules} onNavigate={closeMobileNav} />
            </nav>
            <ProfilePanel
              displayName={displayName}
              onNavigate={closeMobileNav}
              profileEmail={profileEmail}
              profileRole={profileRole}
              unreadNotifications={unreadNotifications}
            />
          </div>
        </aside>
      ) : null}

      <div className="min-h-screen lg:pl-[280px]">
        <aside className="hidden border-r border-border bg-background text-foreground lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-screen lg:w-[280px]">
          <div className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-4">
            <OpsLogoLink />
            <nav aria-label="Operations workspace" className="min-h-0 overflow-y-auto pr-1">
              <Navigation modules={modules} />
            </nav>
            <ProfilePanel
              displayName={displayName}
              profileEmail={profileEmail}
              profileRole={profileRole}
              unreadNotifications={unreadNotifications}
            />
          </div>
        </aside>

        <main className="min-w-0" id="ops-main-content" tabIndex={-1}>
          <OpsTopUtilityBar
            currentTitle={currentTitle}
            modules={routeModules}
            unreadNotifications={unreadNotifications}
          />
          <div className="mx-auto grid w-full max-w-[1800px] gap-4 p-4 lg:p-5">
            {isLocalRolePreview ? (
              <OpsLocalRolePreviewPanel activeRole={profileRole} compact />
            ) : null}
            <OpsInstallPrompt />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
