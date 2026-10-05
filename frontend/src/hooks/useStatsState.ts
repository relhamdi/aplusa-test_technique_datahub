import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { Column } from "../types/api";
import {
  decodeStatsState,
  mergeStatsParams,
  reduceStatsState,
  sanitizeStatsState,
  type StatsChange,
} from "../utils/statsState";

/** Statistics state, kept in the URL: a reload or a shared link restores the same screen. */
export function useStatsState(columns: Column[]) {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const state = useMemo(
    () =>
      sanitizeStatsState(decodeStatsState(new URLSearchParams(query)), columns),
    [query, columns],
  );

  const dispatch = useCallback(
    (change: StatsChange) => {
      // replace: typing in a filter must not flood the browser history.
      setParams(
        (previous) =>
          mergeStatsParams(previous, reduceStatsState(state, change)),
        {
          replace: true,
        },
      );
    },
    [state, setParams],
  );

  return { state, dispatch };
}
