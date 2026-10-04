import { useQuery } from "@tanstack/react-query";

import { importsService } from "../services/imports";

export const importsKey = ["imports"] as const;
// Prefix of importsKey: invalidating the list also invalidates every detail,
// so a rename shows up on both the home page and the import page.
export const importKey = (id: string) => ["imports", id] as const;

export function useImports() {
  // TanStack Query passes an AbortSignal: a superseded request is cancelled for free.
  return useQuery({
    queryKey: importsKey,
    queryFn: ({ signal }) => importsService.list(signal),
  });
}

export function useImport(id: string) {
  return useQuery({
    queryKey: importKey(id),
    queryFn: ({ signal }) => importsService.get(id, signal),
  });
}
