import { describe, expect, it } from "vitest";

import { reorderedIds } from "./reorder";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("reorderedIds", () => {
  it("moves an item down and up", () => {
    expect(reorderedIds(items, "a", "c")).toEqual(["b", "c", "a"]);
    expect(reorderedIds(items, "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("returns null when dropped on itself or outside the list", () => {
    expect(reorderedIds(items, "b", "b")).toBeNull();
    expect(reorderedIds(items, "b", null)).toBeNull();
  });

  it("returns null for unknown ids instead of corrupting the order", () => {
    expect(reorderedIds(items, "zz", "a")).toBeNull();
    expect(reorderedIds(items, "a", "zz")).toBeNull();
  });
});
