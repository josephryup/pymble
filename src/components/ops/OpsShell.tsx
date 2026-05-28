"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { KeyRound, LogOut, Menu, UserCircle, X } from "lucide-react";
import { OpsNavLink } from "@/components/ops/OpsNavLink";
import { OPS_BRAND } from "@/lib/ops/constants";
import { visibleOpsModules } from "@/lib/ops/permissions";
import { formatOpsProfileName, formatOpsRole } from "@/lib/ops/roles";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";
import type { OpsModule, OpsUserRole } from "@/lib/ops/types";

const NAV_GROUPS = [
  {
    hrefs: ["/ops", "/ops/sites", "/ops/workers", "/ops/attendance", "/ops/payroll"],
    label: "Operations",
  },
  {
    hrefs: ["/ops/boq", "/ops/invoices"],
    label: "Commercial",
  },
  {
    hrefs: ["/ops/photos", "/ops/staff", "/ops/settings"],
    label: "Records",
  },
] as const;

function initials(name?: string) {
  return (name ?? "Pymble User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function currentModuleTitle(pathname: string, modules: OpsModule[]) {
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

function Navigation({
  modules,
  onNavigate,
}: {
  modules: OpsModule[];
  onNavigate?: () => void;
}) {
  if (modules.length === 0) {
    return (
      <p className="rounded-md border border-white/10 px-3 py-2 text-sm text-white/55">
        Profile access only
      </p>
    );
  }

  return (
    <>
      {NAV_GROUPS.map((group) => {
        const groupModules = modules.filter((module) =>
          group.hrefs.some((href) => href === module.href),
        );

        if (groupModules.length === 0) {
          return null;
        }

        return (
          <Fragment key={group.label}>
            <div className="border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
              <p className="px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/38">
                {group.label}
              </p>
              <div className="mt-2 grid gap-1.5">
                {groupModules.map((item) => (
                  <OpsNavLink
                    href={item.href}
                    key={item.href}
                    onNavigate={onNavigate}
                    title={item.title}
                  />
                ))}
              </div>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}

function ProfilePanel({
  displayName,
  onNavigate,
  profileEmail,
  profileRole,
}: {
  displayName: string;
  onNavigate?: () => void;
  profileEmail?: string | null;
  profileRole?: OpsUserRole;
}) {
  return (
    <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-3">
      <Link
        className={`flex items-center gap-3 rounded-md p-1 transition hover:bg-white/10 ${OPS_FOCUS_CLASS}`}
        href="/ops/profile"
        onClick={onNavigate}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-sm font-black text-primary-dark">
          {initials(displayName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{displayName}</span>
          <span className="mt-0.5 block truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            {formatOpsRole(profileRole)}
          </span>
        </span>
      </Link>
      {profileEmail ? (
        <p className="mt-2 truncate px-1 text-xs text-white/45">{profileEmail}</p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 py-2 text-xs font-bold text-white/78 transition hover:border-white/25 hover:text-white ${OPS_FOCUS_CLASS}`}
          href="/ops/profile"
          onClick={onNavigate}
        >
          <UserCircle className="size-3.5" aria-hidden="true" />
          Profile
        </Link>
        <Link
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 py-2 text-xs font-bold text-white/78 transition hover:border-white/25 hover:text-white ${OPS_FOCUS_CLASS}`}
          href="/ops/profile#password"
          onClick={onNavigate}
        >
          <KeyRound className="size-3.5" aria-hidden="true" />
          Password
        </Link>
      </div>
      <form action="/api/ops/auth/logout" className="mt-2" method="post">
        <button
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 py-2 text-xs font-bold text-white/78 transition hover:border-white/25 hover:text-white ${OPS_FOCUS_CLASS}`}
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
      className={`flex w-full items-center justify-center rounded-lg bg-white px-4 py-3 shadow-sm shadow-black/10 transition hover:bg-white/95 ${OPS_FOCUS_CLASS}`}
      href="/ops"
      onClick={onNavigate}
    >
      <Image
        src="/logo.png"
        alt={OPS_BRAND.companyName}
        width={180}
        height={63}
        priority
        className="h-auto w-40"
      />
    </Link>
  );
}

export function OpsShell({
  children,
  profileEmail,
  profileName,
  profileRole,
}: {
  children: React.ReactNode;
  profileEmail?: string | null;
  profileName?: string;
  profileRole?: OpsUserRole;
}) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const modules = useMemo(
    () => (profileRole ? visibleOpsModules(profileRole) : []),
    [profileRole],
  );
  const displayName = formatOpsProfileName(profileName, profileRole);
  const currentTitle = currentModuleTitle(pathname, modules);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileNavOpen]);

  const closeMobileNav = () => setIsMobileNavOpen(false);

  return (
    <div className="ops-ui min-h-screen bg-[#f6f7fb] text-primary-dark">
      <a
        className={`sr-only fixed left-4 top-4 z-[1000] rounded-md bg-white px-4 py-3 text-sm font-bold text-primary-dark shadow-lg focus:not-sr-only ${OPS_FOCUS_CLASS}`}
        href="#ops-main-content"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-primary-dark/10 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            aria-label={`${OPS_BRAND.companyName} operations overview`}
            className={`flex min-w-0 items-center gap-3 rounded-md ${OPS_FOCUS_CLASS}`}
            href="/ops"
          >
            <Image
              src="/logo.png"
              alt=""
              width={108}
              height={38}
              priority
              className="h-auto w-24 shrink-0"
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
            className={`inline-flex size-11 items-center justify-center rounded-md border border-primary-dark/10 text-primary-dark ${OPS_FOCUS_CLASS}`}
            onClick={() => setIsMobileNavOpen(true)}
            type="button"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {isMobileNavOpen ? (
        <button
          aria-label="Close operations navigation"
          className="fixed inset-0 z-40 bg-primary-dark/45 lg:hidden"
          onClick={closeMobileNav}
          type="button"
        />
      ) : null}

      <aside
        aria-hidden={!isMobileNavOpen}
        className={`fixed inset-y-0 left-0 z-50 w-[min(22rem,88vw)] bg-primary-dark text-white shadow-2xl transition-transform duration-200 lg:hidden ${
          isMobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        id="ops-mobile-navigation"
      >
        <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
          <div className="flex items-center gap-3">
            <OpsLogoLink onNavigate={closeMobileNav} />
            <button
              aria-label="Close operations navigation"
              className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/78 transition hover:border-white/25 hover:text-white ${OPS_FOCUS_CLASS}`}
              onClick={closeMobileNav}
              type="button"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Operations workspace" className="grid gap-4">
            <Navigation modules={modules} onNavigate={closeMobileNav} />
          </nav>
          <ProfilePanel
            displayName={displayName}
            onNavigate={closeMobileNav}
            profileEmail={profileEmail}
            profileRole={profileRole}
          />
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[280px]">
        <aside className="hidden border-r border-primary-dark/10 bg-primary-dark text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-screen lg:w-[280px]">
          <div className="flex h-full w-full flex-col gap-5 p-5">
            <OpsLogoLink />
            <nav aria-label="Operations workspace" className="grid gap-4">
              <Navigation modules={modules} />
            </nav>
            <ProfilePanel
              displayName={displayName}
              profileEmail={profileEmail}
              profileRole={profileRole}
            />
          </div>
        </aside>

        <main className="min-w-0" id="ops-main-content" tabIndex={-1}>
          <header className="border-b border-primary-dark/10 bg-white px-5 py-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
                  Pymble Construction Limited
                </p>
                <p className="mt-1 font-heading text-lg font-bold text-primary-dark">
                  {currentTitle}
                </p>
              </div>
              <Link
                className={`inline-flex min-h-11 w-fit items-center justify-center rounded-md border border-primary-dark/10 px-3 py-2 text-sm font-semibold text-primary-dark transition hover:border-primary-blue hover:text-primary-blue ${OPS_FOCUS_CLASS}`}
                href="/"
              >
                Public site
              </Link>
            </div>
          </header>
          <div className="p-5 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
