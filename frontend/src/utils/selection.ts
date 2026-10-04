import type { ApiSelection, FilterCondition } from "../types/api";

/**
 * "ids": the ticked rows. "filter": every row matching the filters, 
 * minus the ones the user unticked afterwards. 
 * The second form is what makes "select all" on a million rows possible without ever holding a million ids.
 */
export type Selection =
  | { mode: "ids"; ids: ReadonlySet<string> }
  | { mode: "filter"; excluded: ReadonlySet<string> };

export const EMPTY_SELECTION: Selection = { mode: "ids", ids: new Set() };

export const selectAllMatching = (): Selection => ({
  mode: "filter",
  excluded: new Set(),
});

export function isSelected(selection: Selection, id: string): boolean {
  return selection.mode === "ids"
    ? selection.ids.has(id)
    : !selection.excluded.has(id);
}

function withToggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function toggleRow(selection: Selection, id: string): Selection {
  return selection.mode === "ids"
    ? { mode: "ids", ids: withToggled(selection.ids, id) }
    : { mode: "filter", excluded: withToggled(selection.excluded, id) };
}

export type PageState = "none" | "some" | "all";

export function pageState(selection: Selection, pageIds: string[]): PageState {
  if (pageIds.length === 0) return "none";
  let selected = 0;
  for (const id of pageIds) if (isSelected(selection, id)) selected += 1;
  if (selected === 0) return "none";
  return selected === pageIds.length ? "all" : "some";
}

/** Header checkbox: unticks the page when it is fully selected, selects it otherwise. */
export function togglePage(selection: Selection, pageIds: string[]): Selection {
  const select = pageState(selection, pageIds) !== "all";
  if (selection.mode === "ids") {
    const ids = new Set(selection.ids);
    for (const id of pageIds) {
      if (select) ids.add(id);
      else ids.delete(id);
    }
    return { mode: "ids", ids };
  }
  const excluded = new Set(selection.excluded);
  for (const id of pageIds) {
    if (select) excluded.delete(id);
    else excluded.add(id);
  }
  return { mode: "filter", excluded };
}

export function selectedCount(selection: Selection, total: number): number {
  return selection.mode === "ids"
    ? selection.ids.size
    : Math.max(0, total - selection.excluded.size);
}

export function toApiSelection(
  selection: Selection,
  filters: FilterCondition[],
): ApiSelection {
  return selection.mode === "ids"
    ? { mode: "ids", ids: [...selection.ids] }
    : { mode: "filter", filters, excluded_ids: [...selection.excluded] };
}
