import { useEffect, useId, useMemo } from "react";

import { useStats } from "../hooks/useStats";
import { useStatsState } from "../hooks/useStatsState";
import { useTableState } from "../hooks/useTableState";
import type { ImportSummary } from "../types/api";
import { TYPE_LABELS } from "../utils/columnTypes";
import { toStatsRequest } from "../utils/statsState";
import { pageCount } from "../utils/tableState";
import { StatsSummary } from "./StatsSummary";
import { ValueCountTable } from "./ValueCountTable";

export function StatsTab({ item }: { item: ImportSummary }) {
  const columns = item.columns;
  const baseId = useId();

  // Checkbox 1 applies the filters of the Data tab. 
  // They are read the way the Data tab reads them (URL first, then the state saved for this import), 
  // they are right even when this tab is opened directly after a reload.
  const { state: dataState } = useTableState(item.id, columns);
  const dataFilters = dataState.filters;
  const { state, dispatch } = useStatsState(columns);

  const column = columns.find((c) => c.key === state.column) ?? null;
  const request = useMemo(
    () => (column ? toStatsRequest(state, column, dataFilters) : null),
    [state, column, dataFilters],
  );
  const { data, error, isPending, isPlaceholderData } = useStats(
    item.id,
    request,
  );

  // The last page can disappear (rows deleted elsewhere): fall back to the new last page.
  const table = data?.table ?? null;
  const pages = table ? pageCount(table.total, state.pageSize) : 1;
  useEffect(() => {
    if (table && !isPlaceholderData && state.page > pages)
      dispatch({ type: "page", page: pages });
  }, [table, isPlaceholderData, state.page, pages, dispatch]);

  if (columns.length === 0) {
    return (
      <p>Aucune donnée. Importez d'abord un fichier dans l'onglet Données.</p>
    );
  }

  const filterCount = dataFilters.length;
  const valueFiltersApplied =
    state.applyValueFilters && state.valueFilters.length > 0;

  return (
    <section>
      <div className="stats-controls">
        <div className="field">
          <label htmlFor={`${baseId}-column`}>Colonne</label>
          <select
            id={`${baseId}-column`}
            value={state.column ?? ""}
            onChange={(event) =>
              dispatch({ type: "column", column: event.target.value || null })
            }
          >
            <option value="">— Choisir une colonne —</option>
            {columns.map((c) => (
              <option
                key={c.key}
                value={c.key}
              >{`${c.name} (${TYPE_LABELS[c.type]})`}</option>
            ))}
          </select>
        </div>

        <div className="check-line">
          <input
            id={`${baseId}-data`}
            type="checkbox"
            checked={state.applyDataFilters}
            aria-describedby={`${baseId}-data-hint`}
            onChange={(event) =>
              dispatch({
                type: "applyDataFilters",
                value: event.target.checked,
              })
            }
          />
          <label htmlFor={`${baseId}-data`}>
            Appliquer les filtres de l'onglet Données
          </label>
          <span id={`${baseId}-data-hint`} className="hint">
            {filterCount > 0
              ? `${filterCount} filtre(s) actif(s)`
              : "aucun filtre actif"}
          </span>
        </div>

        {column?.type === "string" && (
          <div className="check-line">
            <input
              id={`${baseId}-values`}
              type="checkbox"
              checked={state.applyValueFilters}
              onChange={(event) =>
                dispatch({
                  type: "applyValueFilters",
                  value: event.target.checked,
                })
              }
            />
            <label htmlFor={`${baseId}-values`}>
              Appliquer aussi les filtres du tableau valeur / occurrence aux
              statistiques
            </label>
          </div>
        )}
      </div>

      {column === null && (
        <p>Choisissez une colonne pour calculer ses statistiques.</p>
      )}
      {error && (
        <p role="alert" className="error">
          Erreur : {error.message}
        </p>
      )}
      {column !== null && isPending && !error && <p>Calcul en cours…</p>}
      {data && data.indexing.length > 0 && (
        <p className="hint">
          Index en cours de création (les prochains calculs seront plus
          rapides).
        </p>
      )}

      {data && column && (
        <div aria-busy={isPlaceholderData} data-refreshing={isPlaceholderData}>
          <StatsSummary
            stats={data}
            valueFiltersApplied={valueFiltersApplied}
          />
          {data.table && (
            // The key remounts the table (and its filter inputs) when the column changes.
            <ValueCountTable
              key={column.key}
              column={column}
              table={data.table}
              state={state}
              dispatch={dispatch}
              refreshing={isPlaceholderData}
            />
          )}
        </div>
      )}
    </section>
  );
}
