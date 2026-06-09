"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Clock3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { OpsReadyModule } from "@/lib/ops/types";

type OpsCommandPaletteProps = {
  modules: OpsReadyModule[];
};

type RecentItem = {
  href: string;
  lastSeen: string;
  title: string;
};

type CommandItemModel = {
  group: "Actions" | "Navigation" | "Recent";
  href: string;
  id: string;
  keywords: string;
  subtitle: string;
  title: string;
};

const RECENT_ROUTES_KEY = "pymble.ops.recent.routes";

function routeTitle(pathname: string, modules: OpsReadyModule[]) {
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

function readRecentRoutes(): RecentItem[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ROUTES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is RecentItem =>
          typeof item?.href === "string" &&
          item.href.startsWith("/ops") &&
          typeof item.title === "string" &&
          typeof item.lastSeen === "string",
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

function writeRecentRoute(item: RecentItem) {
  try {
    const existing = readRecentRoutes().filter((recent) => recent.href !== item.href);
    window.localStorage.setItem(
      RECENT_ROUTES_KEY,
      JSON.stringify([item, ...existing].slice(0, 8)),
    );
  } catch {
    // Local recents are a convenience only.
  }
}

function actionsForModules(modules: OpsReadyModule[]): CommandItemModel[] {
  const moduleHrefs = new Set(modules.map((module) => module.href));
  const actions: Array<Omit<CommandItemModel, "group" | "id" | "keywords"> & { keywords?: string }> = [];

  if (moduleHrefs.has("/ops/material-requests")) {
    actions.push({
      href: "/ops/material-requests",
      subtitle: "Create or review site material demand",
      title: "New material request",
    });
  }

  if (moduleHrefs.has("/ops/rfq-po")) {
    actions.push({
      href: "/ops/rfq-po",
      subtitle: "Prepare RFQs, quotes, and purchase orders",
      title: "Open RFQ and PO workspace",
    });
  }

  if (moduleHrefs.has("/ops/invoices")) {
    actions.push({
      href: "/ops/invoices?create=invoice#invoice-create-panel",
      subtitle: "Create a client invoice",
      title: "Create invoice",
    });
  }

  if (moduleHrefs.has("/ops/hse")) {
    actions.push({
      href: "/ops/hse",
      subtitle: "Report or review incidents and corrective actions",
      title: "Open HSE incident register",
    });
  }

  if (moduleHrefs.has("/ops/employees")) {
    actions.push({
      href: "/ops/employees",
      subtitle: "Manage employee records, leave, and HR actions",
      title: "Open people workspace",
    });
  }

  if (moduleHrefs.has("/ops/approvals")) {
    actions.push({
      href: "/ops/approvals",
      subtitle: "Review workflow decisions assigned to operations",
      title: "Review approvals",
    });
  }

  return actions.map((action) => ({
    group: "Actions",
    href: action.href,
    id: `action:${action.href}:${action.title}`,
    keywords: `${action.title} ${action.subtitle} ${action.keywords ?? ""}`.toLowerCase(),
    subtitle: action.subtitle,
    title: action.title,
  }));
}

function groupItems(items: CommandItemModel[]) {
  return (["Actions", "Navigation", "Recent"] as const)
    .map((group) => ({
      group,
      items: items.filter((item) => item.group === group),
    }))
    .filter((section) => section.items.length > 0);
}

function ItemIcon({ group }: { group: CommandItemModel["group"] }) {
  if (group === "Recent") {
    return <Clock3 className="size-4" aria-hidden="true" />;
  }

  return <Search className="size-4" aria-hidden="true" />;
}

export function OpsCommandPalette({ modules }: OpsCommandPaletteProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [recentRoutes, setRecentRoutes] = useState<RecentItem[]>(() =>
    typeof window === "undefined" ? [] : readRecentRoutes(),
  );

  useEffect(() => {
    if (!pathname.startsWith("/ops")) {
      return;
    }

    const item = {
      href: pathname,
      lastSeen: new Date().toISOString(),
      title: routeTitle(pathname, modules),
    };
    writeRecentRoute(item);
    const frame = window.requestAnimationFrame(() => {
      setRecentRoutes(readRecentRoutes());
    });

    return () => window.cancelAnimationFrame(frame);
  }, [modules, pathname]);

  const navigationItems = useMemo<CommandItemModel[]>(
    () =>
      modules.map((module) => ({
        group: "Navigation",
        href: module.href,
        id: `navigation:${module.href}`,
        keywords: `${module.title} ${module.description} ${module.group}`.toLowerCase(),
        subtitle: module.description,
        title: module.title,
      })),
    [modules],
  );

  const actionItems = useMemo(() => actionsForModules(modules), [modules]);
  const recentItems = useMemo<CommandItemModel[]>(
    () =>
      recentRoutes.map((item) => ({
        group: "Recent",
        href: item.href,
        id: `recent:${item.href}`,
        keywords: `${item.title} recent last visited`.toLowerCase(),
        subtitle: "Recently opened in this browser",
        title: item.title,
      })),
    [recentRoutes],
  );

  const commandGroups = useMemo(
    () => groupItems([...actionItems, ...navigationItems, ...recentItems]),
    [actionItems, navigationItems, recentItems],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function openItem(item: CommandItemModel) {
    router.push(item.href);
    setIsOpen(false);
  }

  return (
    <>
      <Button
        className="min-w-52 justify-between text-muted-foreground hover:text-foreground"
        onClick={() => setIsOpen(true)}
        size="lg"
        type="button"
        variant="outline"
      >
        <span className="inline-flex items-center gap-2">
          <Search className="size-4" aria-hidden="true" />
          Command search
        </span>
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
          Ctrl K
        </span>
      </Button>

      <CommandDialog
        className="max-w-2xl"
        description="Search Pymble Ops modules, actions, and recent pages."
        onOpenChange={setIsOpen}
        open={isOpen}
        showCloseButton
        title="Operations command palette"
      >
        <Command>
          <CommandInput aria-label="Search operations commands" placeholder="Search modules and actions" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>
              <div className="grid justify-items-center gap-2 rounded-lg border border-dashed border-border bg-muted/60 px-6 py-8 text-center">
                <p className="font-heading text-base font-semibold text-foreground">
                  No matching commands
                </p>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  Try a module name, action, project area, or shortcut keyword.
                </p>
              </div>
            </CommandEmpty>
            {commandGroups.map((section) => (
              <CommandGroup heading={section.group} key={section.group}>
                {section.items.map((item) => (
                  <CommandItem
                    className="min-h-16 cursor-pointer px-3 py-2"
                    key={item.id}
                    onSelect={() => openItem(item)}
                    value={item.keywords}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-data-selected/command-item:bg-primary group-data-selected/command-item:text-primary-foreground">
                      <ItemIcon group={item.group} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{item.title}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    </span>
                    <CommandShortcut className="inline-flex items-center gap-1 tracking-normal">
                      Open
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
