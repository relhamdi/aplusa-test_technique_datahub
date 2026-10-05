import type { DetectedColumn, IngestionReport, IngestMode } from "../types/api";
import { request } from "./http";

export interface IngestParams {
  file: File;
  mode: IngestMode;
  // Only meaningful for "replace": on "append" the types are frozen by the import.
  types?: DetectedColumn[];
}

// No Content-Type header is set for FormData (see http.ts): 
// the browser adds it with the multipart boundary, which we could not guess.
export const ingestionService = {
  detectTypes(file: File): Promise<DetectedColumn[]> {
    const form = new FormData();
    form.append("file", file);
    return request<DetectedColumn[]>("/imports/detect-types", {
      method: "POST",
      body: form,
    });
  },

  ingest(
    importId: string,
    { file, mode, types }: IngestParams,
  ): Promise<IngestionReport> {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    // Multipart fields are flat strings: the typed columns travel as JSON text.
    if (types) form.append("types", JSON.stringify(types));
    return request<IngestionReport>(`/imports/${importId}/data`, {
      method: "POST",
      body: form,
    });
  },
};
