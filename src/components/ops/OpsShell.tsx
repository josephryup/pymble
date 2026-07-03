"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle,
  X,
} from "lucide-react";
import { OPS_GROUP_ICONS, OPS_NAV_ICONS } from "@/lib/ops/nav-icons";
import { OpsNavLink } from "@/components/ops/OpsNavLink";
import { OpsBrandMark } from "@/components/ops/OpsBrandMark";
import { OpsLocalRolePreviewGuard } from "@/components/ops/OpsLocalRolePreviewGuard";
import { OpsLocalRolePreviewPanel } from "@/components/ops/OpsLocalRolePreviewPanel";
import { OpsInstallPrompt } from "@/components/ops/OpsInstallPrompt";
import { OpsPushNotificationPrompt } from "@/components/ops/OpsPushNotificationPrompt";
import { OpsTopUtilityBar } from "@/components/ops/OpsTopUtilityBar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

// Alias the shared icon map. Source of truth is `lib/ops/nav-icons.ts` so
// tests can pin module coverage without dragging in the OpsShell client tree.
const NAV_ICON_BY_HREF = OPS_NAV_ICONS;

function badgeFor(
  href: string,
  unreadNotifications: number | undefined,
  unreadInbox: number | undefined,
) {
  if (href === "/ops/notifications") return unreadNotifications;
  if (href === "/ops/inbox") return unreadInbox;
  return undefined;
}

function Navigation({
  modules,
  onNavigate,
  unreadInbox,
  unreadNotifications,
}: {
  modules: OpsReadyModule[];
  onNavigate?: () => void;
  unreadInbox?: number;
  unreadNotifications?: number;
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
          badge={badgeFor(overviewModule.href, unreadNotifications, unreadInbox)}
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
            className="overflow-hidden rounded-lg border border-border bg-card/80 shadow-sm shadow-foreground/5"
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
                    badge={badgeFor(item.href, unreadNotifications, unreadInbox)}
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

function railItemClass(active: boolean) {
  return `relative flex size-11 items-center justify-center rounded-lg transition ${OPS_FOCUS_CLASS} ${active
      ? "bg-primary/10 text-primary ring-1 ring-primary/15"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;
}

/**
 * Collapsed (icon-rail) variant of the desktop navigation. Each module group
 * becomes a single glyph; hovering or focusing it opens a portalled flyout
 * (escapes the rail's `overflow-y-auto` clip) listing that group's modules.
 * The overview entry stays a direct link with a tooltip label.
 */
function NavRail({
  modules,
  unreadInbox,
  unreadNotifications,
}: {
  modules: OpsReadyModule[];
  unreadInbox?: number;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const overviewModule = modules.find((module) => module.href === "/ops");
  const groupedModules = modules.filter((module) => module.href !== "/ops");
  const OverviewIcon = overviewModule ? NAV_ICON_BY_HREF[overviewModule.href] : undefined;

  return (
    <div className="grid justify-items-center gap-1.5">
      {overviewModule ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                aria-current={pathname === "/ops" ? "page" : undefined}
                aria-label={overviewModule.title}
                className={railItemClass(pathname === "/ops")}
                href={overviewModule.href}
              />
            }
          >
            {OverviewIcon ? <OverviewIcon className="size-5" aria-hidden="true" /> : null}
          </TooltipTrigger>
          <TooltipContent side="right">{overviewModule.title}</TooltipContent>
        </Tooltip>
      ) : null}
      {OPS_MODULE_GROUPS.map((group) => {
        const groupModules = groupedModules.filter((module) => module.group === group.id);

        if (groupModules.length === 0) {
          return null;
        }

        const Icon = OPS_GROUP_ICONS[group.id];
        const isActive = groupModules.some((module) => pathname.startsWith(module.href));
        const groupUnread = groupModules.reduce(
          (sum, module) => sum + (badgeFor(module.href, unreadNotifications, unreadInbox) ?? 0),
          0,
        );

        return (
          <Popover key={group.id}>
            <PopoverTrigger
              aria-label={group.title}
              className={railItemClass(isActive)}
              delay={80}
              openOnHover
            >
              {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
              {groupUnread > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
                />
              ) : null}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 gap-1.5" side="right" sideOffset={12}>
              <p className="px-1 pb-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {group.title}
              </p>
              <div className="grid gap-1">
                {groupModules.map((item) => (
                  <OpsNavLink
                    badge={badgeFor(item.href, unreadNotifications, unreadInbox)}
                    href={item.href}
                    icon={NAV_ICON_BY_HREF[item.href]}
                    key={item.href}
                    title={item.title}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}

function ProfilePanel({
  collapsed = false,
  displayName,
  onNavigate,
  profileEmail,
  profileRole,
  unreadNotifications,
}: {
  collapsed?: boolean;
  displayName: string;
  onNavigate?: () => void;
  profileEmail?: string | null;
  profileRole?: OpsUserRole;
  unreadNotifications?: number;
}) {
  if (collapsed) {
    return (
      <div className="grid justify-items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                aria-label={`Profile: ${displayName}`}
                className={railItemClass(false)}
                href="/ops/profile"
              />
            }
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
              {initials(displayName)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            {displayName} · {formatOpsRole(profileRole)}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                aria-label={`Notifications, ${unreadNotifications ?? 0} unread`}
                className={railItemClass(false)}
                href="/ops/notifications"
              />
            }
          >
            <Bell className="size-4" aria-hidden="true" />
            {(unreadNotifications ?? 0) > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
              />
            ) : null}
          </TooltipTrigger>
          <TooltipContent side="right">Notifications</TooltipContent>
        </Tooltip>
        <form action="/api/ops/auth/logout" method="post">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label="Sign out"
                  className={`${railItemClass(false)} hover:text-destructive`}
                  type="submit"
                />
              }
            >
              <LogOut className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm shadow-foreground/5">
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

function OpsLogoLink({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              aria-label={`${OPS_BRAND.companyName} operations overview`}
              className={`flex size-11 items-center justify-center rounded-lg border border-border bg-card shadow-sm shadow-foreground/5 transition hover:border-primary/30 ${OPS_FOCUS_CLASS}`}
              href="/ops"
              onClick={onNavigate}
            />
          }
        >
          <OpsBrandMark priority className="h-7 w-7 rounded" sizes="28px" />
        </TooltipTrigger>
        <TooltipContent side="right">Pymble Ops · Overview</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      aria-label={`${OPS_BRAND.companyName} operations overview`}
      className={`flex w-full items-center justify-start gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-sm shadow-foreground/5 transition hover:border-primary/30 ${OPS_FOCUS_CLASS}`}
      href="/ops"
      onClick={onNavigate}
    >
      <OpsBrandMark priority className="h-12 w-12 rounded-md" sizes="48px" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-foreground">
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
  defaultNavCollapsed = false,
  isLocalRolePreview = false,
  profileEmail,
  profileName,
  profileRole,
  unreadInbox,
  unreadNotifications,
}: {
  children: React.ReactNode;
  defaultNavCollapsed?: boolean;
  isLocalRolePreview?: boolean;
  profileEmail?: string | null;
  profileName?: string;
  profileRole?: OpsUserRole;
  unreadInbox?: number;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isNavCollapsed, setIsNavCollapsed] = useState(defaultNavCollapsed);

  const toggleNavCollapsed = () => {
    setIsNavCollapsed((current) => {
      const next = !current;
      // Persist across reloads so the layout can SSR the right width (no flash).
      document.cookie = `ops-nav-collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  };
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
    <div className="ops-ui min-h-dvh bg-background text-foreground">
      {isLocalRolePreview ? <OpsLocalRolePreviewGuard /> : null}
      <a
        className={`sr-only fixed z-[1000] rounded-md bg-card px-4 py-3 text-sm font-bold text-foreground shadow-lg focus:not-sr-only ${OPS_FOCUS_CLASS}`}
        style={{
          top: "max(1rem, env(safe-area-inset-top))",
          left: "max(1rem, env(safe-area-inset-left))",
        }}
        href="#ops-main-content"
      >
        Skip to content
      </a>

      <header
        className="sticky top-0 z-40 border-b border-border bg-background pb-3 lg:hidden"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
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
              <span className="block truncate text-xs font-bold uppercase tracking-[0.12em] text-primary">
                Pymble
              </span>
              <span className="block truncate text-sm font-bold text-foreground">
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
          <div
            className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-4 pr-4"
            style={{
              paddingTop: "max(1rem, env(safe-area-inset-top))",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              paddingLeft: "max(1rem, env(safe-area-inset-left))",
            }}
          >
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
              <Navigation
                modules={modules}
                onNavigate={closeMobileNav}
                unreadInbox={unreadInbox}
                unreadNotifications={unreadNotifications}
              />
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

      <div
        className={`min-h-dvh transition-[padding] duration-200 ${isNavCollapsed ? "lg:pl-[76px]" : "lg:pl-[280px]"
          }`}
      >
        <TooltipProvider delay={150}>
          <aside
            className={`hidden border-r border-border bg-background text-foreground transition-[width] duration-200 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-dvh ${isNavCollapsed ? "lg:w-[76px]" : "lg:w-[280px]"
              }`}
          >
            <div
              className={`grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-4 ${isNavCollapsed ? "p-2.5" : "p-4"
                }`}
              style={{
                paddingLeft: isNavCollapsed
                  ? "max(0.625rem, env(safe-area-inset-left))"
                  : "max(1rem, env(safe-area-inset-left))",
              }}
            >
              {isNavCollapsed ? (
                <div className="grid justify-items-center gap-2">
                  <OpsLogoLink collapsed />
                  <button
                    aria-expanded={false}
                    aria-label="Expand navigation"
                    className={`inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/30 hover:text-primary ${OPS_FOCUS_CLASS}`}
                    onClick={toggleNavCollapsed}
                    type="button"
                  >
                    <PanelLeftOpen className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <OpsLogoLink />
                  </div>
                  <button
                    aria-expanded
                    aria-label="Collapse navigation"
                    className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/30 hover:text-primary ${OPS_FOCUS_CLASS}`}
                    onClick={toggleNavCollapsed}
                    type="button"
                  >
                    <PanelLeftClose className="size-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              <nav aria-label="Operations workspace" className="min-h-0 overflow-y-auto pr-1">
                {isNavCollapsed ? (
                  <NavRail
                    modules={modules}
                    unreadInbox={unreadInbox}
                    unreadNotifications={unreadNotifications}
                  />
                ) : (
                  <Navigation
                    modules={modules}
                    unreadInbox={unreadInbox}
                    unreadNotifications={unreadNotifications}
                  />
                )}
              </nav>
              <ProfilePanel
                collapsed={isNavCollapsed}
                displayName={displayName}
                profileEmail={profileEmail}
                profileRole={profileRole}
                unreadNotifications={unreadNotifications}
              />
            </div>
          </aside>
        </TooltipProvider>

        <main className="min-w-0" id="ops-main-content" tabIndex={-1}>
          <OpsTopUtilityBar
            currentTitle={currentTitle}
            modules={routeModules}
            profileRole={profileRole}
            unreadNotifications={unreadNotifications}
          />
          <div className="mx-auto grid w-full max-w-[1760px] gap-4 p-4 lg:px-6 lg:py-5 xl:px-8">
            {isLocalRolePreview ? (
              <OpsLocalRolePreviewPanel activeRole={profileRole} compact />
            ) : null}
            <OpsInstallPrompt />
            {isLocalRolePreview ? null : <OpsPushNotificationPrompt />}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
