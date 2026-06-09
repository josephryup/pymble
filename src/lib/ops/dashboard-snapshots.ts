export type OpsDashboardSnapshotError = {
  code?: string | null;
  message?: string | null;
};

export type OpsDashboardSnapshotLoadResult<TRaw> = {
  data: TRaw | null;
  error: OpsDashboardSnapshotError | null;
};

export type OpsDashboardSnapshotFallbackReason = {
  code: string | null;
  message: string;
  name: string;
};

type FetchOpsDashboardSnapshotOptions<TRaw, TResult> = {
  fallback: () => Promise<TResult>;
  load: () => Promise<OpsDashboardSnapshotLoadResult<TRaw>>;
  name: string;
  normalize: (snapshot: TRaw) => TResult;
  onFallback?: (reason: OpsDashboardSnapshotFallbackReason) => void;
};

export function createOpsDashboardSnapshotFallbackReason(
  name: string,
  error: OpsDashboardSnapshotError | null,
): OpsDashboardSnapshotFallbackReason {
  return {
    code: error?.code ?? null,
    message: error?.message ?? "Snapshot returned no data.",
    name,
  };
}

function logOpsDashboardSnapshotFallback(reason: OpsDashboardSnapshotFallbackReason) {
  console.warn(`[ops] ${reason.name} snapshot unavailable; using query fallback`, {
    code: reason.code,
    message: reason.message,
  });
}

export async function fetchOpsDashboardSnapshot<TRaw, TResult>({
  fallback,
  load,
  name,
  normalize,
  onFallback = logOpsDashboardSnapshotFallback,
}: FetchOpsDashboardSnapshotOptions<TRaw, TResult>) {
  const { data, error } = await load();

  if (!error && data !== null && data !== undefined) {
    return normalize(data);
  }

  onFallback(createOpsDashboardSnapshotFallbackReason(name, error));
  return fallback();
}
