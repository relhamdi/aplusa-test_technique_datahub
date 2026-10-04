import { useQuery } from "@tanstack/react-query";

import { importsService } from "../services/imports";

export const importsKey = ["imports"] as const;

export function useImports() {
  return useQuery({
    queryKey: importsKey,
    queryFn: ({ signal }) => importsService.list(signal),
  });
}
