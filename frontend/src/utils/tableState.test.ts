import { describe, expect, it } from "vitest";

import type { Column } from "../types/api";
import {
  DEFAULT_STATE,
  decodeState,
  hasTableParams,
  mergeTableParams,
  nextSort,
  pageCount,
  reduceState,
  sanitizeState,
  toRowQuery,
  type TableState,
} from "./tableState";

const columns: Column[] = [
  { key: "c0", name: "id", type: "integer" },
  { key: "c1", name: "label", type: "string" },
  { key: "c2", name: "flag", type: "boolean" },
];

const full: TableState = {
  page: 3,
  pageSize: 50,
  sort: { column: "c1", direction: "desc" },
  filters: [
    { column: "c0", op: "between", value: 2, value_to: 9 },
    { column: "c1", op: "contains", value: "a&b=c" },
  ],
};

describe("URL encoding", () => {
  it("round-trips a full state, special characters included", () => {
    const query = mergeTableParams(new URLSearchParams(), full).toString();
    expect(decodeState(new URLSearchParams(query))).toEqual(full);
  });

  it("writes nothing for the default state", () => {
    expect(
      mergeTableParams(new URLSearchParams(), DEFAULT_STATE).toString(),
    ).toBe("");
  });

  it("replaces its own keys and keeps unrelated ones", () => {
    const merged = mergeTableParams(
      new URLSearchParams("tab=stats&page=9"),
      DEFAULT_STATE,
    );
    expect(merged.toString()).toBe("tab=stats");
  });

  it("detects table params", () => {
    expect(hasTableParams(new URLSearchParams("tab=stats"))).toBe(false);
    expect(hasTableParams(new URLSearchParams("sort=c0:asc"))).toBe(true);
  });
});

describe("tolerant decoding", () => {
  it.each(["page=0", "page=-2", "page=abc", "page=1.5"])(
    "falls back to page 1 for %s",
    (query) => {
      expect(decodeState(new URLSearchParams(query)).page).toBe(1);
    },
  );

  it("accepts the imposed page sizes and rejects the others", () => {
    expect(decodeState(new URLSearchParams("size=1000000")).pageSize).toBe(
      1_000_000,
    );
    expect(decodeState(new URLSearchParams("size=7")).pageSize).toBe(20);
  });

  it.each(["sort=c1", "sort=c1:sideways", "sort=:asc"])(
    "ignores malformed sort %s",
    (query) => {
      expect(decodeState(new URLSearchParams(query)).sort).toBeNull();
    },
  );

  it("ignores malformed filters and keeps the valid ones", () => {
    const decode = (value: string) =>
      decodeState(new URLSearchParams({ filters: value })).filters;
    expect(decode("not-json")).toEqual([]);
    expect(decode('{"a":1}')).toEqual([]);
    expect(decode('[{"column":"c0","op":"drop_table"}]')).toEqual([]);
    expect(decode('[{"column":"c0","op":"gt","value":1},42]')).toEqual([
      { column: "c0", op: "gt", value: 1 },
    ]);
  });
});

describe("sanitizeState", () => {
  it("keeps a state the columns can honour", () => {
    expect(sanitizeState(full, columns)).toEqual(full);
  });

  it("drops unknown columns and operators invalid for the type", () => {
    const state: TableState = {
      ...DEFAULT_STATE,
      sort: { column: "zz", direction: "asc" },
      filters: [
        { column: "zz", op: "equals", value: 1 },
        { column: "c0", op: "contains", value: "1" }, // "contains" is not valid on an integer
        { column: "c2", op: "gt", value: true }, // nor "gt" on a boolean
        { column: "c1", op: "starts_with", value: "a" },
      ],
    };
    const clean = sanitizeState(state, columns);
    expect(clean.sort).toBeNull();
    expect(clean.filters).toEqual([
      { column: "c1", op: "starts_with", value: "a" },
    ]);
  });
});

describe("reduceState", () => {
  it("changing sort, filters or page size goes back to page 1", () => {
    const state = { ...DEFAULT_STATE, page: 5 };
    expect(
      reduceState(state, {
        type: "sort",
        sort: { column: "c0", direction: "asc" },
      }).page,
    ).toBe(1);
    expect(reduceState(state, { type: "filters", filters: [] }).page).toBe(1);
    expect(
      reduceState(state, { type: "pageSize", pageSize: 100 }),
    ).toMatchObject({ page: 1, pageSize: 100 });
  });

  it("changing the page keeps the rest, and never goes below 1", () => {
    expect(reduceState(full, { type: "page", page: 4 })).toEqual({
      ...full,
      page: 4,
    });
    expect(reduceState(full, { type: "page", page: -3 }).page).toBe(1);
  });

  it("reset returns the default state", () => {
    expect(reduceState(full, { type: "reset" })).toEqual(DEFAULT_STATE);
  });
});

it("maps the state to the API query", () => {
  expect(toRowQuery(full)).toEqual({
    filters: full.filters,
    sort: full.sort,
    page: 3,
    page_size: 50,
  });
});

it("clear drops filters and sort but keeps the page size", () => {
  const cleared = reduceState({ ...full, pageSize: 100 }, { type: "clear" });
  expect(cleared).toEqual({ page: 1, pageSize: 100, sort: null, filters: [] });
});

describe("nextSort", () => {
  it("cycles none -> asc -> desc -> none on the same column", () => {
    const asc = nextSort(null, "c0");
    expect(asc).toEqual({ column: "c0", direction: "asc" });
    const desc = nextSort(asc, "c0");
    expect(desc).toEqual({ column: "c0", direction: "desc" });
    expect(nextSort(desc, "c0")).toBeNull();
  });

  it("starts ascending when another column is clicked", () => {
    expect(nextSort({ column: "c0", direction: "desc" }, "c1")).toEqual({
      column: "c1",
      direction: "asc",
    });
  });
});

it("computes the page count, never below 1", () => {
  expect(pageCount(0, 20)).toBe(1);
  expect(pageCount(45, 20)).toBe(3);
  expect(pageCount(40, 20)).toBe(2);
});
