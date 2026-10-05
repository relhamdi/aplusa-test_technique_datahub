import { describe, expect, it } from "vitest";

import type { Column } from "../types/api";
import {
  DEFAULT_STATS_STATE,
  decodeStatsState,
  mergeStatsParams,
  nextValueSort,
  reduceStatsState,
  sanitizeStatsState,
  toFilterCondition,
  toStatsRequest,
  toValueFilter,
  type StatsState,
} from "./statsState";

const columns: Column[] = [
  { key: "c0", name: "n", type: "integer" },
  { key: "c1", name: "label", type: "string" },
  { key: "c2", name: "flag", type: "boolean" },
];

const full: StatsState = {
  column: "c1",
  applyDataFilters: true,
  applyValueFilters: true,
  valueFilters: [
    { target: "count", op: "gt", value: "30" },
    { target: "value", op: "starts_with", value: "a&b=c" },
  ],
  sort: { target: "value", direction: "asc" },
  page: 3,
  pageSize: 50,
};

describe("URL encoding", () => {
  it("round-trips a full state, special characters included", () => {
    const query = mergeStatsParams(new URLSearchParams(), full).toString();
    expect(decodeStatsState(new URLSearchParams(query))).toEqual(full);
  });

  it("writes nothing for the default state", () => {
    expect(
      mergeStatsParams(new URLSearchParams(), DEFAULT_STATS_STATE).toString(),
    ).toBe("");
  });

  it("replaces its own keys and keeps unrelated ones (tab, table state)", () => {
    const merged = mergeStatsParams(
      new URLSearchParams("tab=stats&page=4&st_col=c0&st_page=9"),
      DEFAULT_STATS_STATE,
    );
    expect(merged.toString()).toBe("tab=stats&page=4");
  });
});

describe("tolerant decoding", () => {
  it.each(["st_page=0", "st_page=-1", "st_page=abc"])(
    "falls back to page 1 for %s",
    (query) => {
      expect(decodeStatsState(new URLSearchParams(query)).page).toBe(1);
    },
  );

  it("accepts the sizes of the stats table and rejects the others", () => {
    expect(decodeStatsState(new URLSearchParams("st_size=100")).pageSize).toBe(
      100,
    );
    expect(decodeStatsState(new URLSearchParams("st_size=1000")).pageSize).toBe(
      20,
    );
  });

  it.each(["st_sort=count", "st_sort=other:asc", "st_sort=count:sideways"])(
    "falls back to occurrences descending for %s",
    (query) => {
      expect(decodeStatsState(new URLSearchParams(query)).sort).toEqual({
        target: "count",
        direction: "desc",
      });
    },
  );

  it("ignores malformed filters and keeps the valid ones", () => {
    const decode = (value: string) =>
      decodeStatsState(new URLSearchParams({ st_vf: value })).valueFilters;
    expect(decode("not-json")).toEqual([]);
    expect(decode('{"a":1}')).toEqual([]);
    expect(decode('[{"target":"nope","op":"gt"}]')).toEqual([]);
    expect(decode('[{"target":"count","op":"gt","value":"1"},42]')).toEqual([
      { target: "count", op: "gt", value: "1" },
    ]);
  });
});

describe("sanitizeStatsState", () => {
  it("keeps a state the column can honour", () => {
    expect(sanitizeStatsState(full, columns)).toEqual(full);
  });

  it("falls back to the default state for an unknown column, keeping checkbox 1", () => {
    const clean = sanitizeStatsState({ ...full, column: "zz" }, columns);
    expect(clean).toEqual({ ...DEFAULT_STATS_STATE, applyDataFilters: true });
  });

  it("drops filters and checkbox 2 for a boolean column", () => {
    const clean = sanitizeStatsState({ ...full, column: "c2" }, columns);
    expect(clean.valueFilters).toEqual([]);
    expect(clean.applyValueFilters).toBe(false);
  });

  it("refuses checkbox 2 on a numeric column and operators that do not fit the type", () => {
    const clean = sanitizeStatsState(
      {
        ...full,
        column: "c0",
        valueFilters: [
          { target: "value", op: "contains", value: "1" }, // not valid on an integer
          { target: "value", op: "is_empty" }, // never valid in this table
          { target: "count", op: "between", value: "1", value_to: "5" },
        ],
      },
      columns,
    );
    expect(clean.applyValueFilters).toBe(false);
    expect(clean.valueFilters).toEqual([
      { target: "count", op: "between", value: "1", value_to: "5" },
    ]);
  });
});

describe("reduceStatsState", () => {
  it("a new column resets the table but keeps checkbox 1", () => {
    expect(reduceStatsState(full, { type: "column", column: "c0" })).toEqual({
      ...DEFAULT_STATS_STATE,
      applyDataFilters: true,
      column: "c0",
    });
  });

  it("anything that changes the result goes back to page 1", () => {
    const state = { ...full, page: 5 };
    expect(
      reduceStatsState(state, { type: "applyDataFilters", value: false }).page,
    ).toBe(1);
    expect(
      reduceStatsState(state, { type: "applyValueFilters", value: false }).page,
    ).toBe(1);
    expect(
      reduceStatsState(state, { type: "valueFilters", filters: [] }).page,
    ).toBe(1);
    expect(
      reduceStatsState(state, {
        type: "sort",
        sort: { target: "count", direction: "asc" },
      }).page,
    ).toBe(1);
    expect(
      reduceStatsState(state, { type: "pageSize", pageSize: 10 }),
    ).toMatchObject({ page: 1, pageSize: 10 });
  });

  it("changing the page keeps the rest, and never goes below 1", () => {
    expect(reduceStatsState(full, { type: "page", page: 4 })).toEqual({
      ...full,
      page: 4,
    });
    expect(reduceStatsState(full, { type: "page", page: -2 }).page).toBe(1);
  });
});

describe("nextValueSort", () => {
  const byCount = { target: "count", direction: "desc" } as const;

  it("flips the direction on the same column", () => {
    expect(nextValueSort(byCount, "count")).toEqual({
      target: "count",
      direction: "asc",
    });
    expect(
      nextValueSort({ target: "count", direction: "asc" }, "count"),
    ).toEqual(byCount);
  });

  it("starts from the natural direction of the other column", () => {
    expect(nextValueSort(byCount, "value")).toEqual({
      target: "value",
      direction: "asc",
    });
    expect(
      nextValueSort({ target: "value", direction: "asc" }, "count"),
    ).toEqual(byCount);
  });
});

describe("toStatsRequest", () => {
  const dataFilters = [{ column: "c0", op: "gt" as const, value: "2" }];
  const string = columns[1];

  it("sends the data filters only when checkbox 1 is ticked", () => {
    const base = { ...DEFAULT_STATS_STATE, column: "c1" };
    expect(toStatsRequest(base, string, dataFilters)).toMatchObject({
      apply_data_filters: false,
      data_filters: [],
    });
    expect(
      toStatsRequest({ ...base, applyDataFilters: true }, string, dataFilters),
    ).toMatchObject({
      apply_data_filters: true,
      data_filters: dataFilters,
    });
  });

  it("sends checkbox 2 for a string column only, and no filters for a boolean", () => {
    expect(toStatsRequest(full, string, [])).toMatchObject({
      apply_value_filters: true,
      page_size: 50,
    });
    expect(toStatsRequest(full, columns[0], [])).toMatchObject({
      apply_value_filters: false,
    });
    expect(toStatsRequest(full, columns[2], [])).toMatchObject({
      value_filters: [],
      apply_value_filters: false,
    });
  });

  it("converts between the cell filter shape and the API shape", () => {
    const filter = {
      target: "count" as const,
      op: "between" as const,
      value: "2",
      value_to: "9",
    };
    expect(toFilterCondition(filter)).toEqual({
      column: "count",
      op: "between",
      value: "2",
      value_to: "9",
    });
    expect(toValueFilter(toFilterCondition(filter))).toEqual(filter);
  });
});
