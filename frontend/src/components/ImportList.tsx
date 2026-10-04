import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import type { ImportSummary } from "../types/api";
import { ImportListItem } from "./ImportListItem";

interface ImportListProps {
  items: ImportSummary[];
  onReorder: (ids: string[]) => void;
  onEdit: (item: ImportSummary) => void;
  onDelete: (item: ImportSummary) => void;
}

export function ImportList({
  items,
  onReorder,
  onEdit,
  onDelete,
}: ImportListProps) {
  const sensors = useSensors(
    // A 5px threshold separates a click from a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Keyboard support: Space to grab, arrows to move, Space to drop.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    // The backend expects the complete ordered list of ids, not a single move.
    onReorder(arrayMove(items, from, to).map((item) => item.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="import-list">
          {items.map((item) => (
            <ImportListItem
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
