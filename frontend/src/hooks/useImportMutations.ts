import { useMutation, useQueryClient } from "@tanstack/react-query";

import { importsService } from "../services/imports";
import type { ImportSummary, ImportUpdate } from "../types/api";
import { clearSavedState } from "../utils/tableStorage";
import { importsKey } from "./useImports";

export function useCreateImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importsService.create,
    // The list is refetched from the API rather than patched locally:
    // the server owns `order`, ids and timestamps.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsKey }),
  });
}

export function useUpdateImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ImportUpdate }) =>
      importsService.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsKey }),
  });
}

export function useDeleteImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importsService.remove,
    onSuccess: (_data, id) => {
      clearSavedState(id);
      return queryClient.invalidateQueries({ queryKey: importsKey });
    },
  });
}

/**
 * Reordering is optimistic: the list must follow the drop immediately,
 * otherwise the item visibly snaps back until the server answers.
 * On failure the previous order is restored, and the list is always refetched to resynchronise.
 */
export function useReorderImports() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => importsService.reorder(ids),
    onMutate: async (ids): Promise<{ previous?: ImportSummary[] }> => {
      // An in-flight refetch would overwrite the optimistic order when it lands.
      await queryClient.cancelQueries({ queryKey: importsKey });
      const previous = queryClient.getQueryData<ImportSummary[]>(importsKey);
      if (previous) {
        const byId = new Map(previous.map((item) => [item.id, item]));
        queryClient.setQueryData(
          importsKey,
          ids
            .map((id) => byId.get(id))
            .filter((item): item is ImportSummary => item !== undefined),
        );
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous)
        queryClient.setQueryData(importsKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: importsKey }),
  });
}
