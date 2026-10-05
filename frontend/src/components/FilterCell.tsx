import { useEffect, useMemo, useState } from "react";

import type { Column, FilterCondition, FilterOp } from "../types/api";
import { draftFromFilter, validateDraft } from "../utils/filterDraft";
import { NO_VALUE_OPS, OP_LABELS, OPS_BY_TYPE } from "../utils/filterOps";

export const FILTER_DEBOUNCE_MS = 300;

interface FilterCellProps {
  column: Column;
  current: FilterCondition | undefined; // the filter currently applied to this column
  // Overrides the operators of the column type (the statistics table has no empty values).
  operators?: FilterOp[];
  onChange: (columnKey: string, filter: FilterCondition | null) => void;
}

export function FilterCell({
  column,
  current,
  operators,
  onChange,
}: FilterCellProps) {
  // The draft is local state: every keystroke updates it,
  // but only the debounced result reaches the table state.
  const [draft, setDraft] = useState(() => draftFromFilter(column, current));
  const { filter, invalid } = useMemo(
    () => validateDraft(column, draft),
    [column, draft],
  );

  const filterKey = JSON.stringify(filter);
  const currentKey = JSON.stringify(current ?? null);

  useEffect(() => {
    // Nothing to emit when the draft already matches what is applied
    // (initial render, restored state): no pointless request.
    if (filterKey === currentKey) return;
    const timer = setTimeout(
      () => onChange(column.key, filter),
      FILTER_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [filterKey, currentKey, filter, column.key, onChange]);

  const hasValue = !NO_VALUE_OPS.includes(draft.op);
  const isBetween = draft.op === "between";
  const label = `Valeur ${column.name}`;

  return (
    <div className="filter-cell">
      <select
        aria-label={`Opérateur ${column.name}`}
        value={draft.op}
        onChange={(event) =>
          setDraft({ ...draft, op: event.target.value as FilterOp })
        }
      >
        {(operators ?? OPS_BY_TYPE[column.type]).map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>

      {hasValue && column.type === "boolean" && (
        <select
          aria-label={label}
          value={draft.value}
          onChange={(event) =>
            setDraft({ ...draft, value: event.target.value })
          }
        >
          <option value="">—</option>
          <option value="true">Oui</option>
          <option value="false">Non</option>
        </select>
      )}

      {hasValue && column.type !== "boolean" && (
        <input
          aria-label={isBetween ? `${label} (min)` : label}
          aria-invalid={invalid || undefined}
          placeholder={isBetween ? "min" : "Filtrer…"}
          value={draft.value}
          onChange={(event) =>
            setDraft({ ...draft, value: event.target.value })
          }
        />
      )}
      {hasValue && isBetween && (
        <input
          aria-label={`${label} (max)`}
          aria-invalid={invalid || undefined}
          placeholder="max"
          value={draft.valueTo}
          onChange={(event) =>
            setDraft({ ...draft, valueTo: event.target.value })
          }
        />
      )}
    </div>
  );
}
