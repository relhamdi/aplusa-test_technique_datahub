import type { Column } from "../types/api";
import { decodeState, mergeTableParams, type TableState } from "./tableState";

const keyFor = (importId: string) => `datahub:table:${importId}`;

const warned = new Set<string>();

// saveState runs on every table change: warn once per action and page load,
// otherwise a disabled storage would flood the console.
function warn(action: "read" | "write" | "clear", error: unknown): void {
  if (warned.has(action)) return;
  warned.add(action);
  console.warn(
    `[datahub] localStorage ${action} failed, table state is not remembered:`,
    error,
  );
}

/** Test helper: warnings are deduplicated per page load. */
export function resetStorageWarnings(): void {
  warned.clear();
}

/**
 * Column keys are positional ("c0", "c1"...):
 * after a replace with another file, "c2" may be a different column.
 * The signature ties a saved state to the exact schema it was made for,
 * so it is discarded instead of being applied to the wrong column.
 */
export function columnsSignature(columns: Column[]): string {
  return columns.map((c) => `${c.key}:${c.name}:${c.type}`).join("|");
}

export function saveState(
  importId: string,
  signature: string,
  state: TableState,
): void {
  try {
    localStorage.setItem(
      keyFor(importId),
      JSON.stringify({ signature, state }),
    );
  } catch (error) {
    // Storage disabled or full: persistence is best-effort, never blocking.
    warn("write", error);
  }
}

export function loadSavedState(
  importId: string,
  signature: string,
): TableState | null {
  try {
    const raw = localStorage.getItem(keyFor(importId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { signature?: string; state?: TableState };
    if (saved.signature !== signature || !saved.state) return null;
    // Round-trip through the URL codec: it validates and normalises the shape.
    return decodeState(mergeTableParams(new URLSearchParams(), saved.state));
  } catch (error) {
    warn("read", error);
    return null;
  }
}

export function clearSavedState(importId: string): void {
  try {
    localStorage.removeItem(keyFor(importId));
  } catch (error) {
    // Same best-effort policy as saveState.
    warn("clear", error);
  }
}
