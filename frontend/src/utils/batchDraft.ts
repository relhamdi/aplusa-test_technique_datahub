import type { Column, FieldAction } from "../types/api";
import { parseInput } from "./cellValue";

export type BatchMode = "keep" | "set" | "clear";

export interface FieldDraft {
  mode: BatchMode;
  input: string;
}

export interface PlannedChange {
  column: Column;
  action: FieldAction;
  error: string | null; // set when the draft cannot be sent
}

export function defaultDrafts(columns: Column[]): Record<string, FieldDraft> {
  return Object.fromEntries(
    columns.map((column) => [
      column.key,
      // A boolean "set" has no blank choice: it starts on a real value.
      { mode: "keep" as const, input: column.type === "boolean" ? "true" : "" },
    ]),
  );
}

/** Turns the per-column drafts into the changes to send; "keep" columns are left out. */
export function planBatch(
  columns: Column[],
  drafts: Record<string, FieldDraft>,
): PlannedChange[] {
  const plan: PlannedChange[] = [];
  for (const column of columns) {
    const draft = drafts[column.key];
    if (draft.mode === "keep") continue;
    if (draft.mode === "clear") {
      plan.push({ column, action: { action: "clear" }, error: null });
      continue;
    }
    const parsed = parseInput(column.type, draft.input);
    if (!parsed.ok) {
      plan.push({ column, action: { action: "keep" }, error: parsed.message });
    } else if (parsed.value === null) {
      // The backend refuses a blank "set": emptying a field is what "Vider" is for.
      plan.push({
        column,
        action: { action: "keep" },
        error: "Saisissez une valeur, ou choisissez « Vider ».",
      });
    } else {
      plan.push({
        column,
        action: { action: "set", value: parsed.value },
        error: null,
      });
    }
  }
  return plan;
}

export const isPlanValid = (plan: PlannedChange[]): boolean =>
  plan.length > 0 && plan.every((change) => change.error === null);

export function toFields(plan: PlannedChange[]): Record<string, FieldAction> {
  return Object.fromEntries(
    plan
      .filter((change) => change.error === null)
      .map((change) => [change.column.key, change.action]),
  );
}
