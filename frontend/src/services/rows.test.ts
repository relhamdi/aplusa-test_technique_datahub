import { afterEach, expect, it, vi } from "vitest";

import { json, stubApi } from "../test/api";
import { rowsService } from "./rows";

afterEach(() => vi.unstubAllGlobals());

it("posts the query as JSON to the import rows endpoint", async () => {
  let body: unknown;
  stubApi({
    "POST /api/imports/7/rows/query": (init) => {
      body = JSON.parse(init.body as string);
      return json({ rows: [], total: 0, page: 2, page_size: 50, indexing: [] });
    },
  });
  const page = await rowsService.query("7", {
    filters: [{ column: "c0", op: "gt", value: 1 }],
    sort: { column: "c0", direction: "asc" },
    page: 2,
    page_size: 50,
  });
  expect(page.total).toBe(0);
  expect(body).toEqual({
    filters: [{ column: "c0", op: "gt", value: 1 }],
    sort: { column: "c0", direction: "asc" },
    page: 2,
    page_size: 50,
  });
});
