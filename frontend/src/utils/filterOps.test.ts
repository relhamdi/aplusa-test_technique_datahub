import { expect, it } from "vitest";

import { statsOps } from "./filterOps";

it("offers the operators of the type, without the empty ones", () => {
  expect(statsOps("string")).toEqual(["equals", "contains", "starts_with"]);
  expect(statsOps("integer")).toEqual(["equals", "gt", "lt", "between"]);
  expect(statsOps("float")).toEqual(["equals", "gt", "lt", "between"]);
  expect(statsOps("boolean")).toEqual(["equals"]);
});
