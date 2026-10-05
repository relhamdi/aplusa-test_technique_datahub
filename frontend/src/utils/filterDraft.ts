import type {
  Column,
  ColumnType,
  FilterCondition,
  FilterOp,
} from "../types/api";
import { NO_VALUE_OPS } from "./filterOps";
import { isNumberText } from "./numbers";

export interface FilterDraft {
  op: FilterOp;
  value: string;
  valueTo: string; // upper bound, only used by "between"
}

export interface DraftResult {
  filter: FilterCondition | null; // null: nothing to apply yet
  invalid: boolean; // the user typed something that cannot be a value of this column
}

const NONE: DraftResult = { filter: null, invalid: false };
const INVALID: DraftResult = { filter: null, invalid: true };

export function defaultOp(type: ColumnType): FilterOp {
  return type === "string" ? "contains" : "equals";
}

const toText = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);

export function draftFromFilter(
  column: Column,
  filter?: FilterCondition,
): FilterDraft {
  if (!filter) return { op: defaultOp(column.type), value: "", valueTo: "" };
  return {
    op: filter.op,
    value: toText(filter.value),
    valueTo: toText(filter.value_to),
  };
}

const toNumber = (raw: string): number => Number(raw.replace(",", "."));

/**
 * Turns what the user typed into a filter. Numbers are sent as the typed string:
 * the backend converts them with the same rules as the ingestion
 * (no precision loss on 64-bit integers, decimal comma accepted).
 */
export function validateDraft(column: Column, draft: FilterDraft): DraftResult {
  const { op } = draft;
  if (NO_VALUE_OPS.includes(op))
    return { filter: { column: column.key, op }, invalid: false };

  const isNumeric = column.type === "integer" || column.type === "float";
  const value = isNumeric ? draft.value.trim() : draft.value;

  if (op === "between") {
    const valueTo = draft.valueTo.trim();
    if (!value || !valueTo) return NONE; // incomplete: wait for both bounds
    if (
      !isNumberText(column.type, value) ||
      !isNumberText(column.type, valueTo)
    )
      return INVALID;
    if (toNumber(value) > toNumber(valueTo)) return INVALID;
    return {
      filter: { column: column.key, op, value, value_to: valueTo },
      invalid: false,
    };
  }

  if (value.trim() === "") return NONE;
  if (column.type === "boolean") {
    if (value !== "true" && value !== "false") return NONE;
    return {
      filter: { column: column.key, op, value: value === "true" },
      invalid: false,
    };
  }
  if (isNumeric && !isNumberText(column.type, value)) return INVALID;
  return { filter: { column: column.key, op, value }, invalid: false };
}
