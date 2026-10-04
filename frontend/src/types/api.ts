export type ColumnType = "boolean" | "integer" | "float" | "string";

// Above this size a page is read through the streaming endpoint instead.
export const MAX_PAGINATED_SIZE = 10_000;

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

export const FILTER_OPS = [
  "equals",
  "contains",
  "starts_with",
  "gt",
  "lt",
  "between",
  "is_empty",
  "is_not_empty",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export interface FilterCondition {
  column: string; // technical key ("c0"), not the display name
  op: FilterOp;
  value?: unknown;
  value_to?: unknown; // upper bound, only for "between"
}

export interface SortSpec {
  column: string;
  direction: "asc" | "desc";
}

// Imposed sizes.
// Above 10 000 only served them through the streaming endpoint.
export const PAGE_SIZES = [
  10, 20, 50, 100, 1000, 5000, 10000, 1_000_000, 10_000_000,
] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface RowQuery {
  filters: FilterCondition[];
  sort: SortSpec | null;
  page: number;
  page_size: PageSize;
}

export interface RowOut {
  id: string;
  values: Record<string, unknown>; // keyed by technical column key
}

export interface PageOut {
  rows: RowOut[];
  total: number;
  page: number;
  page_size: number;
  // Column keys whose index is still being built (query ran anyway).
  indexing: string[];
}

export interface StreamMeta {
  total: number; // rows matching the filters
  returned: number; // rows this page really contains (size capped to what is left)
  page: number;
  page_size: number;
  indexing: string[];
}
