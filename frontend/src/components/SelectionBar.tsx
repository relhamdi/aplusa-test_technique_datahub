import type { Selection } from "../utils/selection";

interface SelectionBarProps {
  mode: Selection["mode"];
  count: number;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const fr = (n: number) => n.toLocaleString("fr-FR");

export function SelectionBar({
  mode,
  count,
  total,
  onSelectAll,
  onClear,
  onEdit,
  onDelete,
}: SelectionBarProps) {
  if (total === 0 && count === 0) return null;
  return (
    <div className="selection-bar" role="region" aria-label="Sélection">
      <span>
        {count === 0
          ? "Aucune ligne sélectionnée"
          : `${fr(count)} ligne(s) sélectionnée(s)`}
      </span>
      {mode === "ids" && total > 0 && count < total && (
        <button
          type="button"
          onClick={onSelectAll}
        >{`Tout sélectionner (${fr(total)})`}</button>
      )}
      {count > 0 && (
        <>
          <button type="button" onClick={onEdit}>
            Modifier la sélection
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Supprimer la sélection
          </button>
          <button type="button" onClick={onClear}>
            Tout désélectionner
          </button>
        </>
      )}
    </div>
  );
}
