import {
  FILTER_OPS,
  PAGE_SIZES,
  type Column,
  type FilterCondition,
  type PageSize,
  type RowQuery,
  type SortSpec,
} from "../types/api";
import { OPS_BY_TYPE } from "./filterOps";

export interface TableState {
  page: number;
  pageSize: PageSize;
  sort: SortSpec | null;
  filters: FilterCondition[];
}

export const DEFAULT_STATE: TableState = {
  page: 1,
  pageSize: 20,
  sort: null,
  filters: [],
};

// Query-string keys owned by the table.
const KEYS = ["page", "size", "sort", "filters"] as const;

export function hasTableParams(params: URLSearchParams): boolean {
  return KEYS.some((key) => params.has(key));
}

function isPageSize(value: number): value is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(value);
}

function isFilter(value: unknown): value is FilterCondition {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.column === "string" &&
    typeof f.op === "string" &&
    (FILTER_OPS as readonly string[]).includes(f.op)
  );
}

function parseFilters(raw: string | null): FilterCondition[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isFilter) : [];
  } catch {
    return []; // a hand-edited URL must never crash the page
  }
}

function parseSort(raw: string | null): SortSpec | null {
  if (!raw) return null;
  const at = raw.lastIndexOf(":");
  if (at <= 0) return null;
  const direction = raw.slice(at + 1);
  if (direction !== "asc" && direction !== "desc") return null;
  return { column: raw.slice(0, at), direction };
}

/** Every invalid piece falls back to its default instead of throwing. */
export function decodeState(params: URLSearchParams): TableState {
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_STATE.page,
    pageSize: isPageSize(size) ? size : DEFAULT_STATE.pageSize,
    sort: parseSort(params.get("sort")),
    filters: parseFilters(params.get("filters")),
  };
}

/** Writes the state into a copy of `params`; default values are omitted to keep URLs short. */
export function mergeTableParams(
  params: URLSearchParams,
  state: TableState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  KEYS.forEach((key) => next.delete(key));
  if (state.page !== DEFAULT_STATE.page) next.set("page", String(state.page));
  if (state.pageSize !== DEFAULT_STATE.pageSize)
    next.set("size", String(state.pageSize));
  if (state.sort)
    next.set("sort", `${state.sort.column}:${state.sort.direction}`);
  if (state.filters.length > 0)
    next.set("filters", JSON.stringify(state.filters));
  return next;
}

/**
 * Drops what the current columns cannot honour (unknown column, operator invalid for the type),
 * so a stale URL or saved state never produces a 422 from the API.
 */
export function sanitizeState(
  state: TableState,
  columns: Column[],
): TableState {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const filters = state.filters.filter((f) => {
    const column = byKey.get(f.column);
    return column !== undefined && OPS_BY_TYPE[column.type].includes(f.op);
  });
  const sort = state.sort && byKey.has(state.sort.column) ? state.sort : null;
  return { ...state, filters, sort };
}

export type TableChange =
  | { type: "page"; page: number }
  | { type: "pageSize"; pageSize: PageSize }
  | { type: "sort"; sort: SortSpec | null }
  | { type: "filters"; filters: FilterCondition[] }
  | { type: "clear" } // drops filters and sort but keeps the page size the user chose
  | { type: "reset" };

/** Any change that alters the result set sends the user back to page 1. */
export function reduceState(
  state: TableState,
  change: TableChange,
): TableState {
  switch (change.type) {
    case "page":
      return { ...state, page: Math.max(1, change.page) };
    case "pageSize":
      return { ...state, pageSize: change.pageSize, page: 1 };
    case "sort":
      return { ...state, sort: change.sort, page: 1 };
    case "filters":
      return { ...state, filters: change.filters, page: 1 };
    case "clear":
      return { ...state, sort: null, filters: [], page: 1 };
    case "reset":
      return DEFAULT_STATE;
  }
}

export function toRowQuery(state: TableState): RowQuery {
  return {
    filters: state.filters,
    sort: state.sort,
    page: state.page,
    page_size: state.pageSize,
  };
}

// Header click cycle: no sort -> ascending -> descending -> no sort.
export function nextSort(
  current: SortSpec | null,
  column: string,
): SortSpec | null {
  if (current?.column !== column) return { column, direction: "asc" };
  return current.direction === "asc" ? { column, direction: "desc" } : null;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
