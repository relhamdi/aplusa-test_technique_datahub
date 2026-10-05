import { useMutation, useQueryClient } from "@tanstack/react-query";

import { rowsService } from "../services/rows";
import { importKey } from "./useImports";

export function useUpdateRow(importId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      rowId,
      values,
    }: {
      rowId: string;
      values: Record<string, unknown>;
    }) => rowsService.update(importId, rowId, values),
    onSuccess: () => {
      // The table state (page, sort, filters) lives in the URL:
      // refetching the active queries gives the same view with fresh data.
      void queryClient.invalidateQueries({ queryKey: importKey(importId) });
    },
  });
}
