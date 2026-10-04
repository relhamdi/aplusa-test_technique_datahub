import type { ImportCreate, ImportSummary, ImportUpdate } from "../types/api";
import { request } from "./http";

// Base functions without state: hooks decide when to call them.
export const importsService = {
  list: (signal?: AbortSignal) =>
    request<ImportSummary[]>("/imports", { signal }),

  get: (id: string, signal?: AbortSignal) =>
    request<ImportSummary>(`/imports/${id}`, { signal }),

  create: (payload: ImportCreate) =>
    request<ImportSummary>("/imports", { method: "POST", json: payload }),

  update: (id: string, payload: ImportUpdate) =>
    request<ImportSummary>(`/imports/${id}`, {
      method: "PATCH",
      json: payload,
    }),

  remove: (id: string) => request<void>(`/imports/${id}`, { method: "DELETE" }),

  // The backend expects the complete ordered list of ids.
  reorder: (ids: string[]) =>
    request<ImportSummary[]>("/imports/reorder", {
      method: "PUT",
      json: { ids },
    }),
};
