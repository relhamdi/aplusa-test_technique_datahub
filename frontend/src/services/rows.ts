import type { PageOut, RowQuery } from "../types/api";
import { request } from "./http";

// POST rather than GET: filters are a nested structure, cleaner as a JSON body.
export const rowsService = {
  query: (importId: string, query: RowQuery, signal?: AbortSignal) =>
    request<PageOut>(`/imports/${importId}/rows/query`, {
      method: "POST",
      json: query,
      signal,
    }),
};
