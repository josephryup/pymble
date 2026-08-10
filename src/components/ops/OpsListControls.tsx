import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OpsPaginationState } from "@/lib/ops/listing";
import {
  firstParam,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export type OpsListSelectFilter = {
  label: string;
  name: string;
  options: Array<{
    label: string;
    value: string;
  }>;
  value: string;
};

type OpsListControlsProps = {
  action: string;
  filters?: OpsListSelectFilter[];
  /**
   * The page's raw searchParams. Supply it so state this component does not own
   * (an open tab, a date range, a second list's page) survives a search or a
   * page change — see UI/UX audit §1a.
   */
  params?: OpsSearchParams;
  placeholder: string;
  query: string;
  resultLabel: string;
};

type OpsPaginationControlsProps = {
  /**
   * Element id to return to after paging, e.g. "worker-list". Without it the
   * links keep the current scroll position instead (audit §1b) — either way the
   * user does not get thrown to the top of a long page.
   */
  anchor?: string;
  basePath: string;
  filters?: OpsListSelectFilter[];
  pagination: OpsPaginationState;
  params?: OpsSearchParams;
  query: string;
  resultLabel: string;
};

/**
 * Params the list controls own outright (rewritten on every navigation) and
 * one-shot notice params, which must never be carried forward or the user sees
 * a stale "saved" banner on page 3.
 */
const OWNED_PARAMS = ["q", "page"];
const TRANSIENT_PARAMS = ["created", "updated", "error", "notice"];

function hasActiveFilters(query: string, filters: OpsListSelectFilter[]) {
  return query.length > 0 || filters.some((filter) => filter.value.length > 0);
}

/** Everything in the URL that this component is not responsible for. */
function carriedParams(
  params: OpsSearchParams | undefined,
  filters: OpsListSelectFilter[],
): Array<[string, string]> {
  if (!params) return [];
  const owned = new Set([...OWNED_PARAMS, ...TRANSIENT_PARAMS, ...filters.map((f) => f.name)]);

  return Object.entries(params).flatMap(([key, value]) => {
    if (owned.has(key)) return [];
    const single = firstParam(value);
    return single ? [[key, single] as [string, string]] : [];
  });
}

function buildPageHref(
  basePath: string,
  page: number,
  query: string,
  filters: OpsListSelectFilter[],
  params: OpsSearchParams | undefined,
  anchor: string | undefined,
) {
  const search = new URLSearchParams();

  for (const [key, value] of carriedParams(params, filters)) {
    search.set(key, value);
  }

  if (query) {
    search.set("q", query);
  }

  filters.forEach((filter) => {
    if (filter.value) {
      search.set(filter.name, filter.value);
    }
  });

  if (page > 1) {
    search.set("page", String(page));
  }

  const queryString = search.toString();
  const href = queryString ? `${basePath}?${queryString}` : basePath;
  return anchor ? `${href}#${anchor}` : href;
}

export function OpsListControls({
  action,
  filters = [],
  params,
  placeholder,
  query,
  resultLabel,
}: OpsListControlsProps) {
  const active = hasActiveFilters(query, filters);
  const carried = carriedParams(params, filters);

  return (
    <form
      action={action}
      className="grid gap-3 border-b border-border bg-card p-5 lg:grid-cols-[minmax(16rem,2fr)_repeat(auto-fit,minmax(10rem,1fr))_auto]"
      method="get"
    >
      {/*
        Submitting a GET form replaces the whole query string, so anything this
        form does not render is lost. Carry the rest of the URL state through as
        hidden inputs; `page` is deliberately NOT carried, so a new search always
        starts at page 1.
      */}
      {carried.map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <Label className={`${OPS_LABEL_CLASS} grid min-w-0 gap-1.5`}>
        <span>Search {resultLabel}</span>
        <span className="relative mt-1 block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="min-h-11 pl-10"
            defaultValue={query}
            name="q"
            placeholder={placeholder}
            type="search"
          />
        </span>
      </Label>
      {filters.map((filter) => (
        <Label className={`${OPS_LABEL_CLASS} grid min-w-0 gap-1.5`} key={filter.name}>
          <span>{filter.label}</span>
          <select className={OPS_INPUT_CLASS} defaultValue={filter.value} name={filter.name}>
            {filter.options.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Label>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <OpsSubmitButton className={OPS_PRIMARY_BUTTON_CLASS} pendingLabel="Searching...">
          <Search className="size-4" aria-hidden="true" />
          Search
        </OpsSubmitButton>
        {active ? (
          // Clear drops the search and filters, not the rest of the page state.
          <Link
            className={OPS_SECONDARY_BUTTON_CLASS}
            href={
              carried.length > 0
                ? `${action}?${new URLSearchParams(carried).toString()}`
                : action
            }
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function OpsPaginationControls({
  anchor,
  basePath,
  filters = [],
  pagination,
  params,
  query,
  resultLabel,
}: OpsPaginationControlsProps) {
  // With an anchor the browser jumps back to the list; without one we suppress
  // Next's scroll reset so the user keeps their place. Either beats being
  // thrown to the top of a 2,000-line page.
  const keepScroll = !anchor;

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-card p-5 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
      <p className="text-sm font-medium text-muted-foreground">
        {pagination.total > 0
          ? `Showing ${pagination.fromItem}-${pagination.toItem} of ${pagination.total} ${resultLabel}`
          : `No matching ${resultLabel}`}
      </p>
      <nav aria-label={`${resultLabel} pagination`} className="flex flex-wrap gap-2">
        {pagination.hasPrevious ? (
          <Link
            className={OPS_SECONDARY_BUTTON_CLASS}
            href={buildPageHref(basePath, pagination.page - 1, query, filters, params, anchor)}
            scroll={!keepScroll}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <button
            aria-disabled="true"
            className={`${OPS_SECONDARY_BUTTON_CLASS} cursor-not-allowed opacity-50`}
            disabled
            type="button"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </button>
        )}
        <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-muted-foreground">
          Page {pagination.page} of {pagination.pageCount}
        </span>
        {pagination.hasNext ? (
          <Link
            className={OPS_SECONDARY_BUTTON_CLASS}
            href={buildPageHref(basePath, pagination.page + 1, query, filters, params, anchor)}
            scroll={!keepScroll}
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <button
            aria-disabled="true"
            className={`${OPS_SECONDARY_BUTTON_CLASS} cursor-not-allowed opacity-50`}
            disabled
            type="button"
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </nav>
    </div>
  );
}
