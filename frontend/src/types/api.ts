export type ColumnType = "boolean" | "integer" | "float" | "string";

export interface Column {
  key: string; // technical key ("c0"), used in row values
  name: string; // display name from the file header
  type: ColumnType;
}

export interface RejectedColumn {
  column: string;
  count: number;
}

export interface LastImport {
  mode: "replace" | "append";
  filename: string;
  at: string;
  rows_inserted: number;
  rejected: RejectedColumn[];
}

export interface ImportSummary {
  id: string;
  name: string;
  description: string;
  order: number;
  columns: Column[];
  row_count: number;
  last_import: LastImport | null;
  created_at: string;
  updated_at: string;
}

export interface ImportCreate {
  name: string;
  description?: string;
}

export interface ImportUpdate {
  name?: string;
  description?: string;
}

export interface DetectedColumn {
  name: string;
  type: ColumnType;
}

export type IngestMode = "replace" | "append";

export interface IngestionReport {
  mode: IngestMode;
  filename: string;
  rows_inserted: number;
  row_count: number;
  // Only columns with at least one value that could not be converted.
  rejected: RejectedColumn[];
}
