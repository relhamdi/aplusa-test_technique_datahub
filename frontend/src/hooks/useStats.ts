import { skipToken, useQuery } from "@tanstack/react-query";

import { statsService } from "../services/stats";
import type { StatsRequest } from "../types/api";
import { importKey } from "./useImports";

export function useStats(importId: string, request: StatsRequest | null) {
  return useQuery({
    // Prefix ['imports', id]: an ingestion, an edit or a batch invalidates it for free.
    queryKey: [...importKey(importId), "stats", request],
    // skipToken: no request until a column is chosen.
    queryFn: request
      ? ({ signal }) => statsService.compute(importId, request, signal)
      : skipToken,
    // Keep the previous result while the next page or filter loads, 
    // only for the SAME column: another column's figures under a new selection would be misleading.
    placeholderData: (previous) =>
      previous?.column === request?.column ? previous : undefined,
  });
}
