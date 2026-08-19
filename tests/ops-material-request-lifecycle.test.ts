import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MATERIAL_REQUEST_TRANSITIONS,
  TERMINAL_MATERIAL_REQUEST_STATUSES,
  type MaterialRequestEdge,
} from "../src/lib/ops/material-request-lifecycle";

const ALL_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "pricing_pending",
  "priced",
  "md_review",
  "approved",
  "rejected",
  "cancelled",
  "partially_ordered",
  "ordered",
  "delivered",
  "closed",
] as const;

const edges = Object.keys(MATERIAL_REQUEST_TRANSITIONS) as MaterialRequestEdge[];

/** Every status that can be reached by walking the table from `draft`. */
function reachableFromDraft() {
  const seen = new Set<string>(["draft"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of edges) {
      const spec = MATERIAL_REQUEST_TRANSITIONS[edge];
      if (spec.from.some((from) => seen.has(from)) && !seen.has(spec.to)) {
        seen.add(spec.to);
        grew = true;
      }
    }
  }
  return seen;
}

describe("material request transition table", () => {
  it("declares only real statuses on both sides of every edge", () => {
    for (const edge of edges) {
      const spec = MATERIAL_REQUEST_TRANSITIONS[edge];
      assert.ok(
        ALL_STATUSES.includes(spec.to as (typeof ALL_STATUSES)[number]),
        `${edge} targets unknown status ${spec.to}`,
      );
      for (const from of spec.from) {
        assert.ok(
          ALL_STATUSES.includes(from as (typeof ALL_STATUSES)[number]),
          `${edge} accepts unknown status ${from}`,
        );
      }
      assert.ok(spec.from.length > 0, `${edge} accepts nothing, so it can never fire`);
      assert.ok(spec.label.length > 0, `${edge} has no label for the audit trail`);
    }
  });

  it("never lets a terminal request move again", () => {
    // A closed or cancelled request is finished. Any edge accepting one would
    // resurrect spend that has already been posted and relieved.
    for (const edge of edges) {
      for (const terminal of TERMINAL_MATERIAL_REQUEST_STATUSES) {
        assert.ok(
          !MATERIAL_REQUEST_TRANSITIONS[edge].from.includes(terminal),
          `${edge} would move a ${terminal} request`,
        );
      }
    }
  });

  it("can reach every live status from draft", () => {
    // A status nothing can reach is dead code in the workflow, and one the UI
    // filters on would render a permanently empty tab.
    const reachable = reachableFromDraft();
    for (const status of ALL_STATUSES) {
      assert.ok(reachable.has(status), `${status} is unreachable from draft`);
    }
  });

  it("routes ordering only through approved or a prior partial round", () => {
    // Audit F2: the second writer moved requests to `ordered` from `submitted`
    // and `in_review` — before Finance had approved the cost at all.
    assert.deepEqual(MATERIAL_REQUEST_TRANSITIONS.ordered.from.toSorted(), [
      "approved",
      "ordered",
      "partially_ordered",
    ]);
    for (const from of MATERIAL_REQUEST_TRANSITIONS.ordered.from) {
      assert.ok(
        !["submitted", "in_review", "pricing_pending", "priced"].includes(from),
        `ordering must not be reachable from ${from}`,
      );
    }
  });

  it("refuses to close a request that was never ordered (F10)", () => {
    // Four requests were closed on 1 July straight from `approved`, while the
    // purchase orders they were closed for sat unissued for seven weeks.
    assert.ok(
      !MATERIAL_REQUEST_TRANSITIONS.closed.from.includes("approved"),
      "closing from approved is what stranded the 1 July purchase orders",
    );
  });

  it("keeps the operations approval landing on pricing, not on approved", () => {
    // `approved` means Finance has authorised the money. The operations chain
    // completing only means procurement may now go and find prices.
    assert.equal(MATERIAL_REQUEST_TRANSITIONS.operations_approved.to, "pricing_pending");
    assert.equal(MATERIAL_REQUEST_TRANSITIONS.cost_approved.to, "approved");
  });

  it("does not let the operations approval reach a request past pricing (F9)", () => {
    // The bug: the approval sync had no prior-state filter, so a stale or
    // re-decided approval threw a priced/approved/ordered request back to
    // pricing_pending.
    for (const from of ["priced", "md_review", "approved", "ordered", "delivered"]) {
      assert.ok(
        !MATERIAL_REQUEST_TRANSITIONS.operations_approved.from.includes(
          from as (typeof ALL_STATUSES)[number],
        ),
        `an operations approval must not reach a ${from} request`,
      );
    }
  });

  it("lets anything unfinished be cancelled", () => {
    const cancellable = MATERIAL_REQUEST_TRANSITIONS.cancelled.from;
    for (const status of ["draft", "submitted", "pricing_pending", "priced", "approved"]) {
      assert.ok(
        cancellable.includes(status as (typeof ALL_STATUSES)[number]),
        `${status} should be cancellable`,
      );
    }
  });

  it("allows a partial round to complete into a full order", () => {
    // A second procurement round finishing the request is the normal path.
    assert.ok(MATERIAL_REQUEST_TRANSITIONS.ordered.from.includes("partially_ordered"));
    assert.ok(MATERIAL_REQUEST_TRANSITIONS.delivered.from.includes("partially_ordered"));
    assert.ok(MATERIAL_REQUEST_TRANSITIONS.closed.from.includes("partially_ordered"));
  });
});
