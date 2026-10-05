import { useMutation, useQueryClient } from "@tanstack/react-query";

import { rowsService } from "../services/rows";
import type { ApiSelection, FieldAction } from "../types/api";
import { importKey, importsKey } from "./useImports";

export function useBatchUpdate(importId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      selection,
      fields,
    }: {
      selection: ApiSelection;
      fields: Record<string, FieldAction>;
    }) => rowsService.batchUpdate(importId, selection, fields),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importKey(importId) });
    },
  });
}

export function useBatchDelete(importId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selection: ApiSelection) =>
      rowsService.batchDelete(importId, selection),
    // Row counts change (page total, import summary, home page list): refresh them all.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importsKey });
    },
  });
}
