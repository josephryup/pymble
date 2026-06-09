import { firstParam, type OpsSearchParams } from "@/lib/ops/ui";

export const OPS_DEFAULT_PAGE_SIZE = 12;
export const OPS_MAX_PAGE_SIZE = 50;

export type OpsListState = {
  from: number;
  page: number;
  pageSize: number;
  query: string;
  to: number;
};

export type OpsPaginationState = {
  fromItem: number;
  hasNext: boolean;
  hasPrevious: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  toItem: number;
  total: number;
};

export type OpsPaginatedResult<T> = {
  items: T[];
  pagination: OpsPaginationState;
};

type ParseOpsListStateOptions = {
  defaultPageSize?: number;
  maxPageSize?: number;
  pageParam?: string;
  pageSizeParam?: string;
  queryParam?: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeOpsSearchTerm(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 96);
}

export function parseOpsListState(
  params: OpsSearchParams,
  options: ParseOpsListStateOptions = {},
): OpsListState {
  const pageParam = options.pageParam ?? "page";
  const pageSizeParam = options.pageSizeParam ?? "page_size";
  const queryParam = options.queryParam ?? "q";
  const defaultPageSize = options.defaultPageSize ?? OPS_DEFAULT_PAGE_SIZE;
  const maxPageSize = options.maxPageSize ?? OPS_MAX_PAGE_SIZE;
  const pageSize = clamp(
    parsePositiveInt(firstParam(params[pageSizeParam]), defaultPageSize),
    1,
    maxPageSize,
  );
  const page = parsePositiveInt(firstParam(params[pageParam]), 1);
  const from = (page - 1) * pageSize;

  return {
    from,
    page,
    pageSize,
    query: normalizeOpsSearchTerm(firstParam(params[queryParam])),
    to: from + pageSize - 1,
  };
}

export function createOpsPagination(total: number | null | undefined, state: OpsListState) {
  const safeTotal = Math.max(Number(total ?? 0), 0);
  const pageCount = Math.max(Math.ceil(safeTotal / state.pageSize), 1);
  const hasItems = safeTotal > 0;

  return {
    fromItem: hasItems ? state.from + 1 : 0,
    hasNext: state.page < pageCount,
    hasPrevious: state.page > 1,
    page: state.page,
    pageCount,
    pageSize: state.pageSize,
    toItem: hasItems ? Math.min(state.to + 1, safeTotal) : 0,
    total: safeTotal,
  } satisfies OpsPaginationState;
}

export function toOpsPaginatedResult<T>(
  items: T[],
  total: number | null | undefined,
  state: OpsListState,
) {
  return {
    items,
    pagination: createOpsPagination(total, state),
  } satisfies OpsPaginatedResult<T>;
}

export function opsIlikePattern(query: string) {
  const safeQuery = normalizeOpsSearchTerm(query)
    .replace(/[^a-zA-Z0-9\s._-]+/g, " ")
    .trim()
    .replace(/\s+/g, "%");

  return safeQuery ? `%${safeQuery}%` : "";
}

export function opsIlikeOrFilter(columns: string[], query: string) {
  const pattern = opsIlikePattern(query);

  if (!pattern) {
    return null;
  }

  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}
