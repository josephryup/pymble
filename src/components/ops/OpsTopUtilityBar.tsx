"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ExternalLink,
  FilePlus2,
  Search,
} from "lucide-react";
import { OpsCommandPalette } from "@/components/ops/OpsCommandPalette";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/Button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OpsReadyModule } from "@/lib/ops/types";

type OpsTopUtilityBarProps = {
  currentTitle: string;
  modules: OpsReadyModule[];
  unreadNotifications?: number;
};

const SEARCHABLE_WORKSPACE_PATHS = [
  "/ops/approvals",
  "/ops/boq",
  "/ops/commercial",
  "/ops/daily-site-reports",
  "/ops/delivery-exceptions",
  "/ops/documents",
  "/ops/employees",
  "/ops/engineering-controls",
  "/ops/equipment",
  "/ops/fleet-logistics",
  "/ops/hse",
  "/ops/hse-compliance",
  "/ops/invoices",
  "/ops/material-requests",
  "/ops/payment-requests",
  "/ops/project-budgets",
  "/ops/rfq-po",
  "/ops/sites",
  "/ops/stores-inventory",
  "/ops/suppliers",
] as const;

function breadcrumbLabel(pathname: string, currentTitle: string) {
  if (pathname === "/ops") {
    return "Overview";
  }

  return currentTitle;
}

function supportsSearch(pathname: string) {
  return SEARCHABLE_WORKSPACE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function OpsTopUtilityBar({
  currentTitle,
  modules,
  unreadNotifications = 0,
}: OpsTopUtilityBarProps) {
  const pathname = usePathname();
  const canSearchCurrentPage = supportsSearch(pathname);

  return (
    <header className="hidden border-b border-border bg-background/95 px-5 py-3 backdrop-blur lg:block">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem>
              <BreadcrumbLink
                className="rounded-md font-medium"
                render={<Link href="/ops" />}
              >
                Workspace
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate font-semibold">
                {breadcrumbLabel(pathname, currentTitle)}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-2">
          <OpsCommandPalette modules={modules} />

          {canSearchCurrentPage ? (
            <form action={pathname} className="relative hidden xl:block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="Search current operations page"
                className="h-10 w-72 rounded-md bg-card pl-9 pr-12"
                name="q"
                placeholder="Search current page"
                type="search"
              />
              <Badge
                className="pointer-events-none absolute right-2.5 top-1/2 h-5 -translate-y-1/2 rounded-md px-1.5 text-[10px]"
                variant="outline"
              >
                /
              </Badge>
            </form>
          ) : null}

          <Link
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}
            href="/ops/material-requests"
          >
            <FilePlus2 className="size-4" aria-hidden="true" />
            New request
          </Link>

          <Link
            aria-label={`Notifications, ${unreadNotifications} unread`}
            className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "relative size-10")}
            href="/ops/notifications"
          >
            <Bell className="size-4" aria-hidden="true" />
            {unreadNotifications > 0 ? (
              <Badge className="absolute -right-1 -top-1 size-5 rounded-full px-0 text-[10px] font-black">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </Badge>
            ) : null}
          </Link>

          <Link
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-10")}
            href="/"
          >
            Public site
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
