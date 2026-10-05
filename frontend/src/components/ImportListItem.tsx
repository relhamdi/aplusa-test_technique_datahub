import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";

import type { ImportSummary } from "../types/api";

interface ImportListItemProps {
  item: ImportSummary;
  onEdit: (item: ImportSummary) => void;
  onDelete: (item: ImportSummary) => void;
}

export function ImportListItem({
  item,
  onEdit,
  onDelete,
}: ImportListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      className="import-item"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      {/* Drag listeners live on the handle only:
        clicking the link or the buttons must never start a drag. */}
      <button
        type="button"
        className="handle"
        aria-label={`Réorganiser ${item.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <div className="import-info">
        <Link to={`/imports/${item.id}`} className="import-name">
          {item.name}
        </Link>
        {item.description && (
          <p className="import-description">{item.description}</p>
        )}
        <span className="import-count">
          {item.row_count.toLocaleString("fr-FR")} lignes
        </span>
      </div>

      <div className="import-actions">
        <button
          type="button"
          aria-label={`Modifier ${item.name}`}
          onClick={() => onEdit(item)}
        >
          Modifier
        </button>
        <button
          type="button"
          className="danger"
          aria-label={`Supprimer ${item.name}`}
          onClick={() => onDelete(item)}
        >
          Supprimer
        </button>
      </div>
    </li>
  );
}
