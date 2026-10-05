import type { ColumnType, FilterOp } from "../types/api";

const COMMON: FilterOp[] = ["equals", "is_empty", "is_not_empty"];
const NUMERIC: FilterOp[] = [...COMMON, "gt", "lt", "between"];

// Mirrors the backend: an operator not listed here would be answered with a 422.
export const OPS_BY_TYPE: Record<ColumnType, FilterOp[]> = {
  string: [...COMMON, "contains", "starts_with"],
  integer: NUMERIC,
  float: NUMERIC,
  boolean: COMMON,
};

export const OP_LABELS: Record<FilterOp, string> = {
  equals: "est égal à",
  contains: "contient",
  starts_with: "commence par",
  gt: "supérieur à",
  lt: "inférieur à",
  between: "entre",
  is_empty: "est vide",
  is_not_empty: "n'est pas vide",
};

// These operators take no value: the input must be hidden.
export const NO_VALUE_OPS: FilterOp[] = ["is_empty", "is_not_empty"];

// The value/occurrence table of the statistics never contains empty cells,
// empty operators are meaningless there (the backend answers 422).
export function statsOps(type: ColumnType): FilterOp[] {
  return OPS_BY_TYPE[type].filter((op) => !NO_VALUE_OPS.includes(op));
}
