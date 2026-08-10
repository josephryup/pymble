import Link from "next/link";
import { firstParam, OPS_FOCUS_CLASS, type OpsSearchParams } from "@/lib/ops/ui";

/**
 * URL-driven tabs for the pages that are too big to render at once.
 *
 * The 2026-08-10 UI/UX audit (§1c, §4) found eight ops pages between 1,500 and
 * 3,245 lines, each a single server component that awaits every query for every
 * section before rendering anything. Paging one list re-ran all of them, which
 * is the "it fails" half of the pagination report.
 *
 * Tabs are a search param rather than sub-routes on purpose: the page keeps one
 * file, one permission check and one set of deep links, and the only thing that
 * changes is that the server skips the queries for tabs you are not looking at.
 *
 * `page` is dropped when switching tabs — page 3 of the PPE register means
 * nothing on the training tab — while every other param is carried through, the
 * same discipline as OpsListControls.
 */

export type OpsTabDefinition = {
  /** Value written to ?tab=. Keep stable; it appears in links people bookmark. */
  id: string;
  label: string;
  /** Optional count badge, e.g. how many rows the tab holds. */
  count?: number;
};

type OpsTabsProps = {
  active: string;
  basePath: string;
  params?: OpsSearchParams;
  tabs: OpsTabDefinition[];
};

/** Params the tab strip owns; everything else on the URL is carried through. */
const OWNED_PARAMS = ["tab", "page"];
const TRANSIENT_PARAMS = ["created", "updated", "error", "notice"];

function tabHref(basePath: string, id: string, params: OpsSearchParams | undefined) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (OWNED_PARAMS.includes(key) || TRANSIENT_PARAMS.includes(key)) continue;
    const single = firstParam(value);
    if (single) search.set(key, single);
  }
  search.set("tab", id);

  return `${basePath}?${search.toString()}`;
}

/**
 * Resolve ?tab= against the known tabs, falling back to the first one. Callers
 * use the result to decide which queries to run, so it must never be a value
 * the page does not recognise.
 */
export function resolveOpsTab(
  params: OpsSearchParams,
  tabs: readonly OpsTabDefinition[],
): string {
  const requested = firstParam(params.tab);
  return tabs.some((tab) => tab.id === requested) ? requested! : tabs[0].id;
}

export function OpsTabs({ active, basePath, params, tabs }: OpsTabsProps) {
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((tab) => {
        const current = tab.id === active;
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              current
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            } ${OPS_FOCUS_CLASS}`}
            href={tabHref(basePath, tab.id, params)}
            key={tab.id}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
