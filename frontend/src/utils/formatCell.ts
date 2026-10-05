import type { ColumnType } from "../types/api";

// 20 fraction digits: never truncate a float to the default 3 decimals.
export const formatNumber = (value: number): string =>
  value.toLocaleString("fr-FR", { maximumFractionDigits: 20 });

export const formatPercent = (value: number): string =>
  `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

/**
 * Display text for a NON-empty value.
 * Empty cells (null) are rendered by the component with a distinct style,
 * so a real text "(vide)" cannot be confused with them.
 *
 * Known limit: JSON numbers are doubles, so integers beyond 2^53 are shown rounded.
 */
export function formatCell(value: unknown, type: ColumnType): string {
  if (type === "boolean") return value ? "Oui" : "Non";
  if ((type === "integer" || type === "float") && typeof value === "number")
    return formatNumber(value);
  return String(value);
}
