import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ingestionService, type IngestParams } from "../services/ingestion";
import { importsKey } from "./useImports";

export function useDetectTypes() {
  // Stateless on the server: nothing to invalidate.
  return useMutation({ mutationFn: ingestionService.detectTypes });
}

export function useIngest(importId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: IngestParams) =>
      ingestionService.ingest(importId, params),
    // importsKey is a prefix of every import/rows/stats key:
    // one invalidation refreshes the list, the import page and (later) the data table.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsKey }),
  });
}
