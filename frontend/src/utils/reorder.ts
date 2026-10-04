import { arrayMove } from "@dnd-kit/sortable";

/**
 * Pure part of the drag-and-drop: given the current list and a drop,
 * return the complete ordered list of ids the backend expects, or null when nothing moves.
 * Extracted from the component because the gesture itself cannot run in jsdom.
 */
export function reorderedIds<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string | null,
): string[] | null {
  if (overId === null || activeId === overId) return null;
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0) return null;
  return arrayMove(items, from, to).map((item) => item.id);
}
