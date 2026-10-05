import { useCallback, useMemo, useState } from "react";

import {
  STATS_PAGE_SIZES,
  type Column,
  type FilterCondition,
  type ValueCountPage,
  type ValueTarget,
} from "../types/api";
import { statsOps } from "../utils/filterOps";
import { formatCell } from "../utils/formatCell";
import {
  nextValueSort,
  toFilterCondition,
  toValueFilter,
  type StatsChange,
  type StatsState,
} from "../utils/statsState";
import { FilterCell } from "./FilterCell";
import { Pagination } from "./Pagination";

// Stable references: FilterCell re-validates its draft when its column object changes.
const COUNT_COLUMN: Column = {
  key: "count",
  name: "Occurrences",
  type: "integer",
};
const COUNT_OPS = statsOps("integer");

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

interface ValueCountTableProps {
  column: Column;
  table: ValueCountPage;
  state: StatsState;
  dispatch: (change: StatsChange) => void;
  refreshing: boolean; // the previous page is shown while the next one loads
}

export function ValueCountTable({
  column,
  table,
  state,
  dispatch,
  refreshing,
}: ValueCountTableProps) {
  // Cleared from outside (reset button): the key remounts the inputs, which own their draft.
  const [clearCount, setClearCount] = useState(0);

  // The "value" cell is typed like the analyzed column; the "count" cell is an integer.
  const valueColumn = useMemo<Column>(
    () => ({ key: "value", name: column.name, type: column.type }),
    [column],
  );
  const valueOps = useMemo(() => statsOps(column.type), [column.type]);
  const numeric = column.type === "integer" || column.type === "float";

  const handleFilterChange = useCallback(
    (key: string, filter: FilterCondition | null) => {
      // Only one filter per column of the table.
      const others = state.valueFilters.filter((f) => f.target !== key);
      dispatch({
        type: "valueFilters",
        filters: filter ? [...others, toValueFilter(filter)] : others,
      });
    },
    [state.valueFilters, dispatch],
  );

  const currentOf = (target: ValueTarget): FilterCondition | undefined => {
    const found = state.valueFilters.find((f) => f.target === target);
    return found ? toFilterCondition(found) : undefined;
  };

  const header = (target: ValueTarget, label: string, className?: string) => {
    const active = state.sort.target === target;
    return (
      <th
        className={className}
        aria-sort={active ? ARIA_SORT[state.sort.direction] : "none"}
      >
        <button
          type="button"
          className="sort-button"
          onClick={() =>
            dispatch({ type: "sort", sort: nextValueSort(state.sort, target) })
          }
        >
          {label}
          <span aria-hidden="true" className="sort-icon">
            {active ? (state.sort.direction === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <section aria-label="Valeurs et occurrences">
      <div className="section-head">
        <h3>Valeurs et occurrences</h3>
        {state.valueFilters.length > 0 && (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "valueFilters", filters: [] });
              setClearCount((value) => value + 1);
            }}
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      <div className="data-scroll-static">
        <table
          className="stats-table"
          aria-label="Valeurs et occurrences"
          data-refreshing={refreshing}
        >
          <thead>
            <tr>
              {header("value", column.name, numeric ? "num" : undefined)}
              {header("count", "Occurrences", "num")}
            </tr>
            <tr className="filter-row" key={`filters-${clearCount}`}>
              <td>
                <FilterCell
                  column={valueColumn}
                  current={currentOf("value")}
                  operators={valueOps}
                  onChange={handleFilterChange}
                />
              </td>
              <td>
                <FilterCell
                  column={COUNT_COLUMN}
                  current={currentOf("count")}
                  operators={COUNT_OPS}
                  onChange={handleFilterChange}
                />
              </td>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={String(row.value)}>
                <td className={numeric ? "num" : undefined}>
                  {formatCell(row.value, column.type)}
                </td>
                <td className="num">{formatCell(row.count, "integer")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.total === 0 && (
        <p>
          {state.valueFilters.length > 0
            ? "Aucune valeur ne correspond aux filtres."
            : "Aucune valeur dans cette colonne."}
        </p>
      )}

      <Pagination
        page={state.page}
        pageSize={state.pageSize}
        sizes={STATS_PAGE_SIZES}
        total={table.total}
        disabled={false}
        onPage={(page) => dispatch({ type: "page", page })}
        onPageSize={(pageSize) => dispatch({ type: "pageSize", pageSize })}
      />
    </section>
  );
}
