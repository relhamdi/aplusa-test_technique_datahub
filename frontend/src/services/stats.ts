import type { StatsOut, StatsRequest } from "../types/api";
import { request } from "./http";

export const statsService = {
  compute: (importId: string, payload: StatsRequest, signal?: AbortSignal) =>
    request<StatsOut>(`/imports/${importId}/stats`, {
      method: "POST",
      json: payload,
      signal,
    }),
};
