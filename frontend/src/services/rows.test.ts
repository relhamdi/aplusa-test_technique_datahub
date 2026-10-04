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

it("patches only the given fields of one row", async () => {
  let body: unknown;
  stubApi({
    "PATCH /api/imports/7/rows/r9": (init) => {
      body = JSON.parse(init.body as string);
      return json({ id: "r9", values: { c1: "x" } });
    },
  });
  const row = await rowsService.update("7", "r9", { c1: "x" });
  expect(row.id).toBe("r9");
  expect(body).toEqual({ values: { c1: "x" } });
});

it("posts the selection and the field actions to batch-update", async () => {
  let body: unknown;
  stubApi({
    "POST /api/imports/7/rows/batch-update": (init) => {
      body = JSON.parse(init.body as string);
      return json({ matched: 3, affected: 2 });
    },
  });
  const result = await rowsService.batchUpdate(
    "7",
    { mode: "filter", filters: [], excluded_ids: ["x"] },
    { c1: { action: "set", value: "a" }, c2: { action: "clear" } },
  );
  expect(result).toEqual({ matched: 3, affected: 2 });
  expect(body).toEqual({
    selection: { mode: "filter", filters: [], excluded_ids: ["x"] },
    fields: { c1: { action: "set", value: "a" }, c2: { action: "clear" } },
  });
});

it("posts the selection to batch-delete", async () => {
  let body: unknown;
  stubApi({
    "POST /api/imports/7/rows/batch-delete": (init) => {
      body = JSON.parse(init.body as string);
      return json({ matched: 1, affected: 1 });
    },
  });
  await rowsService.batchDelete("7", { mode: "ids", ids: ["a"] });
  expect(body).toEqual({ selection: { mode: "ids", ids: ["a"] } });
});
