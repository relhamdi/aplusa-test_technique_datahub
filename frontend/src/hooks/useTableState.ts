import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { Column } from "../types/api";
import {
  DEFAULT_STATE,
  decodeState,
  hasTableParams,
  mergeTableParams,
  reduceState,
  sanitizeState,
  type TableChange,
  type TableState,
} from "../utils/tableState";
import {
  columnsSignature,
  loadSavedState,
  saveState,
} from "../utils/tableStorage";

/**
 * Table state = page, page size, sort and filters.
 *  - The URL is the source of truth while the user works (shareable, survives reload).
 *  - localStorage restores the state when the URL carries none
 * (user left the import and comes back later).
 * Render this inside a component keyed by import id.
 */
export function useTableState(importId: string, columns: Column[]) {
  const [params, setParams] = useSearchParams();
  const signature = useMemo(() => columnsSignature(columns), [columns]);

  // Restored state, read once. It applies only until the user changes something:
  // otherwise "reset" would bring the old saved state back from an empty URL.
  // Using it in the very first render avoids a wasted request with default state.
  const [seed, setSeed] = useState<TableState | null>(() =>
    hasTableParams(params) ? null : loadSavedState(importId, signature),
  );

  const query = params.toString();
  const state = useMemo(() => {
    const current = new URLSearchParams(query);
    const base = hasTableParams(current)
      ? decodeState(current)
      : (seed ?? DEFAULT_STATE);
    return sanitizeState(base, columns);
  }, [query, seed, columns]);

  useEffect(() => {
    saveState(importId, signature, state);
  }, [importId, signature, state]);

  const dispatch = useCallback(
    (change: TableChange) => {
      setSeed(null);
      const next = reduceState(state, change);
      // replace: typing in a filter must not flood the browser history.
      setParams((previous) => mergeTableParams(previous, next), {
        replace: true,
      });
    },
    [state, setParams],
  );

  return { state, dispatch };
}
