import { afterEach, expect, it, vi } from "vitest";

import { json, stubApi } from "../test/api";
import type { StatsRequest } from "../types/api";
import { statsService } from "./stats";

afterEach(() => vi.unstubAllGlobals());

it("posts the request as JSON to the stats endpoint", async () => {
  let body: unknown;
  stubApi({
    "POST /api/imports/7/stats": (init) => {
      body = JSON.parse(init.body as string);
      return json({
        column: "c1",
        type: "string",
        count: 0,
        empty_count: 0,
        boolean: null,
        numeric: null,
        table: null,
        indexing: [],
      });
    },
  });
  const payload: StatsRequest = {
    column: "c1",
    apply_data_filters: false,
    data_filters: [],
    value_filters: [],
    apply_value_filters: false,
    sort: { target: "count", direction: "desc" },
    page: 1,
    page_size: 20,
  };
  const stats = await statsService.compute("7", payload);
  expect(stats.column).toBe("c1");
  expect(body).toEqual(payload);
});
