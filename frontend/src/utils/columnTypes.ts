import type { ColumnType } from "../types/api";

export const TYPE_LABELS: Record<ColumnType, string> = {
  boolean: "Booléen",
  integer: "Entier",
  float: "Décimal",
  string: "Texte",
};
export const COLUMN_TYPES = Object.keys(TYPE_LABELS) as ColumnType[];
