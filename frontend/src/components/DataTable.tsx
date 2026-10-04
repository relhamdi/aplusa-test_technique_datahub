import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { useRowSource } from "../hooks/useRowSource";
import type { Column, FilterCondition, RowOut } from "../types/api";
import { formatCell } from "../utils/formatCell";
import {
  nextSort,
  pageCount,
  toRowQuery,
  type TableChange,
  type TableState,
} from "../utils/tableState";
import { FilterCell } from "./FilterCell";
import { Pagination } from "./Pagination";

// Fixed row height: no per-row measurement, so the scroll height is exact.
const ROW_HEIGHT = 28;
const MIN_COLUMN_WIDTH = 160;
// Also covers the sticky header, which sits above the list inside the scroll area.
const OVERSCAN = 10;

// Stable reference: a new [] on every render makes TanStack Table re-render in a loop.
const NO_ROWS: RowOut[] = [];

// Fixed width of the trailing "Actions" column.
const ACTION_WIDTH = 90;

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;
const fr = (n: number) => n.toLocaleString("fr-FR");

interface GridCellProps {
  value: unknown;
  type: Column["type"];
  loaded: boolean; // false: the streamed row has not arrived yet
}

function GridCell({ value, type, loaded }: GridCellProps) {
  const className =
    type === "integer" || type === "float" ? "grid-cell num" : "grid-cell";
  if (!loaded) {
    return (
      <div role="cell" className={className}>
        <span className="empty">…</span>
      </div>
    );
  }
  if (value === null || value === undefined) {
    return (
      <div role="cell" className={className}>
        <span className="empty">(vide)</span>
      </div>
    );
  }
  const text = formatCell(value, type);
  return (
    <div role="cell" className={className} title={text}>
      {text}
    </div>
  );
}

interface DataTableProps {
  importId: string;
  columns: Column[];
  state: TableState;
  dispatch: (change: TableChange) => void;
  // Bumped by the parent after a replace, to empty the filter inputs.
  filterResetKey: number;
  // Changes when the data changes behind our back (import): restarts a streamed page.
  dataVersion: string;
  onEditRow: (row: RowOut, rowNumber: number) => void;
}

export function DataTable({
  importId,
  columns,
  state,
  dispatch,
  filterResetKey,
  dataVersion,
  onEditRow,
}: DataTableProps) {
  const source = useRowSource(importId, state, dataVersion);
  const [clearCount, setClearCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // TanStack Table keeps the column model, the headers and the sort state.
  // It gets no rows; building a row model for 1M rows would defeat the virtualization.
  const tableColumns = useMemo<ColumnDef<RowOut>[]>(
    () => columns.map((column) => ({ id: column.key, header: column.name })),
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
    data: NO_ROWS,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    // Sorting, filtering and pagination are done by the backend.
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    state: { sorting },
  });

  // Same remark: the virtualizer hands back functions that change identity.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: source.count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  // A new page, sort or filter starts at the top of the grid.
  const queryKey = JSON.stringify(toRowQuery(state));
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [queryKey]);

  const pages = pageCount(source.total, state.pageSize);
  // The last page can disappear (rows deleted elsewhere): fall back to the new last page.
  useEffect(() => {
    if (source.ready && state.page > pages)
      dispatch({ type: "page", page: pages });
  }, [source.ready, state.page, pages, dispatch]);

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

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns.length}, minmax(${MIN_COLUMN_WIDTH}px, 1fr)) ${ACTION_WIDTH}px`,
  };
  const isFiltered = state.filters.length > 0 || state.sort !== null;
  const stream = source.stream;

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

      {source.error && (
        <p role="alert" className="error">
          Erreur : {source.error}
        </p>
      )}
      {source.indexing.length > 0 && (
        <p className="hint">
          Index en cours de création (les prochaines requêtes seront plus
          rapides).
        </p>
      )}

      {stream?.status === "loading" && source.count > 0 && (
        <div className="stream-status" role="status">
          <span>{`Chargement en flux : ${fr(stream.loaded)} / ${fr(source.count)} lignes`}</span>
          <progress value={stream.loaded} max={source.count} />
          <button type="button" onClick={stream.stop}>
            Arrêter le chargement
          </button>
        </div>
      )}
      {stream?.status === "stopped" && (
        <p role="status" className="hint">
          {`Chargement interrompu : ${fr(stream.loaded)} lignes reçues sur ${fr(source.count)}.`}
        </p>
      )}

      <div
        ref={scrollRef}
        className="data-scroll"
        role="table"
        aria-label="Données"
        aria-rowcount={source.count + 2}
        aria-busy={source.isPending || source.isRefreshing}
        data-refreshing={source.isRefreshing}
      >
        <div
          className="grid-inner"
          style={{
            minWidth: columns.length * MIN_COLUMN_WIDTH + ACTION_WIDTH,
          }}
        >
          <div className="grid-header" role="rowgroup">
            <div
              role="row"
              aria-rowindex={1}
              className="grid-row"
              style={gridStyle}
            >
              {table.getHeaderGroups().flatMap((group) =>
                group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <div
                      key={header.id}
                      role="columnheader"
                      className="grid-head-cell"
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
                    </div>
                  );
                }),
              )}
              <div role="columnheader" className="grid-head-cell">
                Actions
              </div>
            </div>
            {/* The key remounts the inputs when filters are cleared from outside. */}
            <div
              role="row"
              aria-rowindex={2}
              className="grid-row filter-row"
              style={gridStyle}
              key={`filters-${filterResetKey}-${clearCount}`}
            >
              {columns.map((column) => (
                <div key={column.key} role="cell" className="grid-head-cell">
                  <FilterCell
                    column={column}
                    current={state.filters.find((f) => f.column === column.key)}
                    onChange={handleFilterChange}
                  />
                </div>
              ))}
              <div role="cell" className="grid-head-cell" />
            </div>
          </div>

          <div
            role="rowgroup"
            aria-label="Lignes"
            className="grid-body"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = source.getRow(item.index);
              // Position in the whole result set, not in the page.
              const rowNumber =
                (state.page - 1) * state.pageSize + item.index + 1;
              return (
                <div
                  key={item.key}
                  role="row"
                  aria-rowindex={item.index + 3}
                  className="grid-row data-row"
                  style={{
                    ...gridStyle,
                    height: ROW_HEIGHT,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {columns.map((column) => (
                    <GridCell
                      key={column.key}
                      value={row?.values[column.key]}
                      type={column.type}
                      loaded={row !== undefined}
                    />
                  ))}
                  <div role="cell" className="grid-cell actions-cell">
                    {row && (
                      <button
                        type="button"
                        aria-label={`Éditer la ligne ${rowNumber}`}
                        onClick={() => onEditRow(row, rowNumber)}
                      >
                        Éditer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {source.isPending && <p>Chargement…</p>}
      {source.ready && source.total === 0 && (
        <p>
          {state.filters.length > 0
            ? "Aucune ligne ne correspond aux filtres."
            : "Cet import ne contient aucune ligne."}
        </p>
      )}

      <Pagination
        page={state.page}
        pageSize={state.pageSize}
        total={source.total}
        disabled={source.isPending}
        onPage={(page) => dispatch({ type: "page", page })}
        onPageSize={(pageSize) => dispatch({ type: "pageSize", pageSize })}
      />
    </div>
  );
}
