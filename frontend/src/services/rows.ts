import type { PageOut, RowOut, RowQuery } from "../types/api";
import { request } from "./http";

// POST rather than GET: filters are a nested structure, cleaner as a JSON body.
export const rowsService = {
  query: (importId: string, query: RowQuery, signal?: AbortSignal) =>
    request<PageOut>(`/imports/${importId}/rows/query`, {
      method: "POST",
      json: query,
      signal,
    }),

  // Only the edited fields are sent, keyed by technical column key.
  update: (importId: string, rowId: string, values: Record<string, unknown>) =>
    request<RowOut>(`/imports/${importId}/rows/${rowId}`, {
      method: "PATCH",
      json: { values },
    }),
};
