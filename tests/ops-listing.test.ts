import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createOpsPagination,
  opsIlikeOrFilter,
  opsIlikePattern,
  parseOpsListState,
} from "../src/lib/ops/listing";

describe("ops listing helpers", () => {
  it("normalizes page, page size, and search query params", () => {
    const state = parseOpsListState(
      {
        page: "3",
        page_size: "200",
        q: "  site   alpha  ",
      },
      {
        defaultPageSize: 25,
        maxPageSize: 50,
      },
    );

    assert.deepEqual(state, {
      from: 100,
      page: 3,
      pageSize: 50,
      query: "site alpha",
      to: 149,
    });
  });

  it("falls back to safe pagination defaults", () => {
    const state = parseOpsListState({
      page: "-7",
      page_size: "nope",
      q: "",
    });

    assert.equal(state.page, 1);
    assert.equal(state.pageSize, 12);
    assert.equal(state.from, 0);
    assert.equal(state.to, 11);
  });

  it("creates stable pagination metadata", () => {
    const state = parseOpsListState({ page: "2", page_size: "10" });

    assert.deepEqual(createOpsPagination(26, state), {
      fromItem: 11,
      hasNext: true,
      hasPrevious: true,
      page: 2,
      pageCount: 3,
      pageSize: 10,
      toItem: 20,
      total: 26,
    });
  });

  it("sanitizes ilike patterns for PostgREST filters", () => {
    assert.equal(opsIlikePattern(" Site, (Alpha)% "), "%Site%Alpha%");
    assert.equal(opsIlikePattern("(),"), "");
    assert.equal(
      opsIlikeOrFilter(["code", "name"], "Site Alpha"),
      "code.ilike.%Site%Alpha%,name.ilike.%Site%Alpha%",
    );
  });
});
