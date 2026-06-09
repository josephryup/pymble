import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createOpsDashboardSnapshotFallbackReason,
  fetchOpsDashboardSnapshot,
} from "../src/lib/ops/dashboard-snapshots";

describe("ops dashboard snapshot helpers", () => {
  it("normalizes snapshot data when the RPC succeeds", async () => {
    const result = await fetchOpsDashboardSnapshot({
      fallback: async () => ({ total: 0 }),
      load: async () => ({ data: { count: "7" }, error: null }),
      name: "test",
      normalize: (snapshot: { count: string }) => ({ total: Number(snapshot.count) }),
      onFallback: () => {
        throw new Error("fallback should not run");
      },
    });

    assert.deepEqual(result, { total: 7 });
  });

  it("falls back and reports safe error context when the RPC fails", async () => {
    const reasons: unknown[] = [];
    const result = await fetchOpsDashboardSnapshot({
      fallback: async () => ({ total: 2 }),
      load: async () => ({
        data: null,
        error: {
          code: "42501",
          message: "Not authorized",
        },
      }),
      name: "finance",
      normalize: (snapshot: { count: string }) => ({ total: Number(snapshot.count) }),
      onFallback: (reason) => reasons.push(reason),
    });

    assert.deepEqual(result, { total: 2 });
    assert.deepEqual(reasons, [
      {
        code: "42501",
        message: "Not authorized",
        name: "finance",
      },
    ]);
  });

  it("falls back when a snapshot returns no data", async () => {
    const reasons: unknown[] = [];
    const result = await fetchOpsDashboardSnapshot({
      fallback: async () => ({ total: 1 }),
      load: async () => ({ data: null, error: null }),
      name: "empty",
      normalize: (snapshot: { count: string }) => ({ total: Number(snapshot.count) }),
      onFallback: (reason) => reasons.push(reason),
    });

    assert.deepEqual(result, { total: 1 });
    assert.deepEqual(reasons, [
      {
        code: null,
        message: "Snapshot returned no data.",
        name: "empty",
      },
    ]);
  });

  it("creates fallback reasons without leaking full error objects", () => {
    assert.deepEqual(
      createOpsDashboardSnapshotFallbackReason("executive", {
        code: null,
        message: null,
      }),
      {
        code: null,
        message: "Snapshot returned no data.",
        name: "executive",
      },
    );
  });
});
