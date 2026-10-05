import { useCallback } from "react";

import type { StreamStatus } from "../services/rowStreamStore";
import { MAX_PAGINATED_SIZE, type RowOut } from "../types/api";
import { toRowQuery, type TableState } from "../utils/tableState";
import { useRows } from "./useRows";
import { useRowStream } from "./useRowStream";

export interface RowSource {
  count: number; // rows to lay out (scroll height)
  total: number; // rows matching the filters (pagination)
  getRow: (index: number) => RowOut | undefined; // undefined: not received yet
  ready: boolean; // count and total are known and up to date
  isPending: boolean; // nothing to show yet
  isRefreshing: boolean; // previous page is shown while the next one loads
  error: string | null;
  indexing: string[];
  stream: { status: StreamStatus; loaded: number; stop: () => void } | null;
}

const NO_ROWS: RowOut[] = [];

/**
 * Pages up to 10 000 rows come from the paginated endpoint (cached by TanStack Query); 
 * larger ones are streamed. Both hooks always run (rules of hooks) but only one is enabled.
 */
export function useRowSource(
  importId: string,
  state: TableState,
  dataVersion: string,
): RowSource {
  const streaming = state.pageSize > MAX_PAGINATED_SIZE;
  const page = useRows(importId, state);
  const stream = useRowStream(
    importId,
    toRowQuery(state),
    streaming,
    dataVersion,
  );

  const rows = page.data?.rows ?? NO_ROWS;
  const getPageRow = useCallback((index: number) => rows[index], [rows]);

  if (streaming) {
    const { snapshot } = stream;
    const meta = snapshot.meta;
    return {
      count: meta?.returned ?? 0,
      total: meta?.total ?? 0,
      getRow: stream.getRow,
      ready: meta !== null,
      isPending: meta === null && snapshot.status !== "error",
      isRefreshing: false,
      error: snapshot.error,
      indexing: meta?.indexing ?? [],
      stream: {
        status: snapshot.status,
        loaded: snapshot.loaded,
        stop: stream.stop,
      },
    };
  }
  return {
    count: rows.length,
    total: page.data?.total ?? 0,
    getRow: getPageRow,
    ready: page.data !== undefined && !page.isPlaceholderData,
    isPending: page.isPending,
    isRefreshing: page.isPlaceholderData,
    error: page.error?.message ?? null,
    indexing: page.data?.indexing ?? [],
    stream: null,
  };
}
