import {
  FILTER_OPS,
  STATS_PAGE_SIZES,
  type Column,
  type FilterCondition,
  type StatsPageSize,
  type StatsRequest,
  type ValueFilter,
  type ValueSort,
  type ValueTarget,
} from "../types/api";
import { statsOps } from "./filterOps";

export interface StatsState {
  column: string | null; // technical key of the analyzed column
  applyDataFilters: boolean; // checkbox 1
  applyValueFilters: boolean; // checkbox 2, string columns only
  valueFilters: ValueFilter[];
  sort: ValueSort;
  page: number;
  pageSize: StatsPageSize;
}

// Most frequent values first.
const DEFAULT_SORT: ValueSort = { target: "count", direction: "desc" };

export const DEFAULT_STATS_STATE: StatsState = {
  column: null,
  applyDataFilters: false,
  applyValueFilters: false,
  valueFilters: [],
  sort: DEFAULT_SORT,
  page: 1,
  pageSize: 20,
};

// Prefixed: this state shares the query string with the tab and the table state.
const KEYS = [
  "st_col",
  "st_data",
  "st_values",
  "st_vf",
  "st_sort",
  "st_page",
  "st_size",
] as const;

function isStatsPageSize(value: number): value is StatsPageSize {
  return (STATS_PAGE_SIZES as readonly number[]).includes(value);
}

function isValueFilter(value: unknown): value is ValueFilter {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    (f.target === "value" || f.target === "count") &&
    typeof f.op === "string" &&
    (FILTER_OPS as readonly string[]).includes(f.op)
  );
}

function parseValueFilters(raw: string | null): ValueFilter[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isValueFilter) : [];
  } catch {
    return []; // a hand-edited URL must never crash the page
  }
}

function parseSort(raw: string | null): ValueSort {
  const [target, direction] = (raw ?? "").split(":");
  if (
    (target === "value" || target === "count") &&
    (direction === "asc" || direction === "desc")
  ) {
    return { target, direction };
  }
  return DEFAULT_SORT;
}

/** Tolerant: every invalid piece falls back to its default instead of throwing. */
export function decodeStatsState(params: URLSearchParams): StatsState {
  const page = Number(params.get("st_page"));
  const size = Number(params.get("st_size"));
  return {
    column: params.get("st_col") || null,
    applyDataFilters: params.get("st_data") === "1",
    applyValueFilters: params.get("st_values") === "1",
    valueFilters: parseValueFilters(params.get("st_vf")),
    sort: parseSort(params.get("st_sort")),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: isStatsPageSize(size) ? size : DEFAULT_STATS_STATE.pageSize,
  };
}

/** Writes the state into a copy of `params`; defaults are omitted, other keys untouched. */
export function mergeStatsParams(
  params: URLSearchParams,
  state: StatsState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  KEYS.forEach((key) => next.delete(key));
  if (state.column) next.set("st_col", state.column);
  if (state.applyDataFilters) next.set("st_data", "1");
  if (state.applyValueFilters) next.set("st_values", "1");
  if (state.valueFilters.length > 0)
    next.set("st_vf", JSON.stringify(state.valueFilters));
  if (
    state.sort.target !== DEFAULT_SORT.target ||
    state.sort.direction !== DEFAULT_SORT.direction
  ) {
    next.set("st_sort", `${state.sort.target}:${state.sort.direction}`);
  }
  if (state.page !== 1) next.set("st_page", String(state.page));
  if (state.pageSize !== DEFAULT_STATS_STATE.pageSize)
    next.set("st_size", String(state.pageSize));
  return next;
}

/**
 * Drops what the current columns cannot honour 
 * (unknown column, operator invalid for the type, checkbox 2 on a non-string column), 
 * so a stale URL never produces a 422.
 */
export function sanitizeStatsState(
  state: StatsState,
  columns: Column[],
): StatsState {
  const column = columns.find((c) => c.key === state.column);
  if (!column)
    return { ...DEFAULT_STATS_STATE, applyDataFilters: state.applyDataFilters };

  const valueOps = statsOps(column.type);
  const countOps = statsOps("integer");
  const valueFilters =
    column.type === "boolean" // a boolean has no value/occurrence table
      ? []
      : state.valueFilters.filter((f) =>
          (f.target === "value" ? valueOps : countOps).includes(f.op),
        );
  return {
    ...state,
    valueFilters,
    applyValueFilters: column.type === "string" && state.applyValueFilters,
  };
}

export type StatsChange =
  | { type: "column"; column: string | null }
  | { type: "applyDataFilters"; value: boolean }
  | { type: "applyValueFilters"; value: boolean }
  | { type: "valueFilters"; filters: ValueFilter[] }
  | { type: "sort"; sort: ValueSort }
  | { type: "page"; page: number }
  | { type: "pageSize"; pageSize: StatsPageSize };

/** Anything that changes the result set sends the user back to page 1. */
export function reduceStatsState(
  state: StatsState,
  change: StatsChange,
): StatsState {
  switch (change.type) {
    case "column":
      // A new column starts from a clean table: its sort and filters do not carry over.
      return {
        ...DEFAULT_STATS_STATE,
        applyDataFilters: state.applyDataFilters,
        column: change.column,
      };
    case "applyDataFilters":
      return { ...state, applyDataFilters: change.value, page: 1 };
    case "applyValueFilters":
      return { ...state, applyValueFilters: change.value, page: 1 };
    case "valueFilters":
      return { ...state, valueFilters: change.filters, page: 1 };
    case "sort":
      return { ...state, sort: change.sort, page: 1 };
    case "page":
      return { ...state, page: Math.max(1, change.page) };
    case "pageSize":
      return { ...state, pageSize: change.pageSize, page: 1 };
  }
}

/** Header click: same column flips the direction, another column starts from its natural one. */
export function nextValueSort(
  current: ValueSort,
  target: ValueTarget,
): ValueSort {
  if (current.target === target) {
    return { target, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { target, direction: target === "count" ? "desc" : "asc" };
}

// FilterCell speaks FilterCondition ("column" = the key of the cell); the API speaks ValueFilter.
export const toValueFilter = (f: FilterCondition): ValueFilter => ({
  target: f.column as ValueTarget,
  op: f.op,
  value: f.value,
  value_to: f.value_to,
});

export const toFilterCondition = (f: ValueFilter): FilterCondition => ({
  column: f.target,
  op: f.op,
  value: f.value,
  value_to: f.value_to,
});

export function toStatsRequest(
  state: StatsState,
  column: Column,
  dataFilters: FilterCondition[],
): StatsRequest {
  return {
    column: column.key,
    apply_data_filters: state.applyDataFilters,
    // Sent only when applied: changing the Data tab filters must not refetch statistics ignoring them.
    data_filters: state.applyDataFilters ? dataFilters : [],
    value_filters: column.type === "boolean" ? [] : state.valueFilters,
    apply_value_filters: column.type === "string" && state.applyValueFilters,
    sort: state.sort,
    page: state.page,
    page_size: state.pageSize,
  };
}
