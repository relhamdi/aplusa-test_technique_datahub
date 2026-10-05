import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { rowsService } from "../services/rows";
import { MAX_PAGINATED_SIZE } from "../types/api";
import { toRowQuery, type TableState } from "../utils/tableState";
import { importKey } from "./useImports";

export function useRows(importId: string, state: TableState) {
  const query = toRowQuery(state);
  return useQuery({
    // Prefix ['imports', id]: an ingestion or an import update invalidates it for free.
    queryKey: [...importKey(importId), "rows", query],
    queryFn: ({ signal }) => rowsService.query(importId, query, signal),
    // While the next page loads, keep showing the previous one instead of a blank table.
    placeholderData: keepPreviousData,
    // Larger sizes only exist through the streaming endpoint.
    enabled: state.pageSize <= MAX_PAGINATED_SIZE,
  });
}
