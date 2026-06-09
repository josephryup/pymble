import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OpsPaginationState } from "@/lib/ops/listing";
import {
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
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
  placeholder: string;
  query: string;
  resultLabel: string;
};

type OpsPaginationControlsProps = {
  basePath: string;
  filters?: OpsListSelectFilter[];
  pagination: OpsPaginationState;
  query: string;
  resultLabel: string;
};

function hasActiveFilters(query: string, filters: OpsListSelectFilter[]) {
  return query.length > 0 || filters.some((filter) => filter.value.length > 0);
}

function buildPageHref(
  basePath: string,
  page: number,
  query: string,
  filters: OpsListSelectFilter[],
) {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  filters.forEach((filter) => {
    if (filter.value) {
      params.set(filter.name, filter.value);
    }
  });

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

export function OpsListControls({
  action,
  filters = [],
  placeholder,
  query,
  resultLabel,
}: OpsListControlsProps) {
  const active = hasActiveFilters(query, filters);

  return (
    <form
      action={action}
      className="grid gap-3 border-b border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_repeat(2,minmax(10rem,14rem))_auto]"
      method="get"
    >
      <Label className={`${OPS_LABEL_CLASS} grid gap-1.5 lg:col-span-2`}>
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
        <Label className={`${OPS_LABEL_CLASS} grid gap-1.5`} key={filter.name}>
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
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href={action}>
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function OpsPaginationControls({
  basePath,
  filters = [],
  pagination,
  query,
  resultLabel,
}: OpsPaginationControlsProps) {
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
            href={buildPageHref(basePath, pagination.page - 1, query, filters)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <span className={`${OPS_SECONDARY_BUTTON_CLASS} cursor-not-allowed opacity-50`}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </span>
        )}
        <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-muted-foreground">
          Page {pagination.page} of {pagination.pageCount}
        </span>
        {pagination.hasNext ? (
          <Link
            className={OPS_SECONDARY_BUTTON_CLASS}
            href={buildPageHref(basePath, pagination.page + 1, query, filters)}
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={`${OPS_SECONDARY_BUTTON_CLASS} cursor-not-allowed opacity-50`}>
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </nav>
    </div>
  );
}
