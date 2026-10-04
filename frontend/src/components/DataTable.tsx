import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useRows } from "../hooks/useRows";
import {
  MAX_PAGINATED_SIZE,
  type Column,
  type FilterCondition,
  type RowOut,
} from "../types/api";
import { formatCell } from "../utils/formatCell";
import {
  nextSort,
  pageCount,
  type TableChange,
  type TableState,
} from "../utils/tableState";
import { FilterCell } from "./FilterCell";
import { Pagination } from "./Pagination";

interface DataTableProps {
  importId: string;
  columns: Column[];
  state: TableState;
  dispatch: (change: TableChange) => void;
  // Bumped by the parent after a replace, to empty the filter inputs.
  filterResetKey: number;
}

// Stable reference: a new [] on every render makes TanStack Table re-render in a loop.
const NO_ROWS: RowOut[] = [];

function CellValue({ value, type }: { value: unknown; type: Column["type"] }) {
  if (value === null || value === undefined)
    return <span className="empty">(vide)</span>;
  return <>{formatCell(value, type)}</>;
}

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

export function DataTable({
  importId,
  columns,
  state,
  dispatch,
  filterResetKey,
}: DataTableProps) {
  const { data, error, isPending, isFetching, isPlaceholderData } = useRows(
    importId,
    state,
  );
  const [clearCount, setClearCount] = useState(0);

  const typeByKey = useMemo(
    () => new Map(columns.map((c) => [c.key, c.type])),
    [columns],
  );

  // Columns are built from the file headers: nothing is hard-coded.
  const tableColumns = useMemo<ColumnDef<RowOut>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        header: column.name,
        accessorFn: (row) => row.values[column.key],
        cell: (context) => (
          <CellValue value={context.getValue()} type={column.type} />
        ),
      })),
    [columns],
  );

  const sorting = useMemo<SortingState>(
    () =>
      state.sort
        ? [{ id: state.sort.column, desc: state.sort.direction === "desc" }]
        : [],
    [state.sort],
  );

  // TanStack Table returns functions React Compiler cannot memoize;
  // nothing derived from `table` is passed to a memoized component here, so skipping is harmless.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.rows ?? NO_ROWS,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    // Sorting, filtering and pagination are done by the backend: the table only displays.
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    state: { sorting },
  });

  const total = data?.total ?? 0;
  const pages = pageCount(total, state.pageSize);

  // The last page can disappear (rows deleted elsewhere): fall back to the new last page.
  useEffect(() => {
    if (data && !isPlaceholderData && state.page > pages) {
      dispatch({ type: "page", page: pages });
    }
  }, [data, isPlaceholderData, state.page, pages, dispatch]);

  const handleFilterChange = useCallback(
    (columnKey: string, filter: FilterCondition | null) => {
      // One filter per column in the UI: replace the column's filter, keep the others.
      const others = state.filters.filter((f) => f.column !== columnKey);
      dispatch({
        type: "filters",
        filters: filter ? [...others, filter] : others,
      });
    },
    [state.filters, dispatch],
  );

  if (state.pageSize > MAX_PAGINATED_SIZE) {
    return (
      <div role="alert" className="error">
        <p>Cette taille de page nécessite le mode flux (WIP).</p>
        <button
          type="button"
          onClick={() => dispatch({ type: "pageSize", pageSize: 20 })}
        >
          Revenir à 20 lignes par page
        </button>
      </div>
    );
  }

  const isFiltered = state.filters.length > 0 || state.sort !== null;

  return (
    <div>
      {isFiltered && (
        <div className="toolbar">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "clear" });
              setClearCount((count) => count + 1);
            }}
          >
            Réinitialiser filtres et tri
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="error">
          Erreur : {error.message}
        </p>
      )}
      {data?.indexing.length ? (
        <p className="hint">
          Index en cours de création (les prochaines requêtes seront plus
          rapides).
        </p>
      ) : null}

      <div className="data-scroll">
        <table
          className="data-table"
          aria-busy={isFetching}
          data-refreshing={isPlaceholderData}
        >
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      aria-sort={sorted ? ARIA_SORT[sorted] : "none"}
                    >
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() =>
                          dispatch({
                            type: "sort",
                            sort: nextSort(state.sort, header.column.id),
                          })
                        }
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <span aria-hidden="true" className="sort-icon">
                          {sorted === "asc"
                            ? "▲"
                            : sorted === "desc"
                              ? "▼"
                              : "↕"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
            {/* The key remounts the inputs when filters are cleared from outside. */}
            <tr
              className="filter-row"
              key={`filters-${filterResetKey}-${clearCount}`}
            >
              {columns.map((column) => (
                <th key={column.key}>
                  <FilterCell
                    column={column}
                    current={state.filters.find((f) => f.column === column.key)}
                    onChange={handleFilterChange}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const type = typeByKey.get(cell.column.id);
                  const numeric = type === "integer" || type === "float";
                  return (
                    <td key={cell.id} className={numeric ? "num" : undefined}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isPending && <p>Chargement…</p>}
      {data && total === 0 && (
        <p>
          {state.filters.length > 0
            ? "Aucune ligne ne correspond aux filtres."
            : "Cet import ne contient aucune ligne."}
        </p>
      )}

      <Pagination
        page={state.page}
        pageSize={state.pageSize}
        total={total}
        disabled={isPending}
        onPage={(page) => dispatch({ type: "page", page })}
        onPageSize={(pageSize) => dispatch({ type: "pageSize", pageSize })}
      />
    </div>
  );
}
