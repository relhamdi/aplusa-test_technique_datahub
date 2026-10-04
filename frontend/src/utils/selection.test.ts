import { describe, expect, it } from "vitest";

import {
  EMPTY_SELECTION,
  isSelected,
  pageState,
  selectAllMatching,
  selectedCount,
  toApiSelection,
  togglePage,
  toggleRow,
} from "./selection";

describe("ids mode", () => {
  it("toggles a row without mutating the previous selection", () => {
    const one = toggleRow(EMPTY_SELECTION, "a");
    expect(isSelected(one, "a")).toBe(true);
    expect(isSelected(EMPTY_SELECTION, "a")).toBe(false); // the original is untouched
    expect(isSelected(toggleRow(one, "a"), "a")).toBe(false);
  });

  it("reports the state of a page", () => {
    const page = ["a", "b", "c"];
    expect(pageState(EMPTY_SELECTION, page)).toBe("none");
    expect(pageState(toggleRow(EMPTY_SELECTION, "b"), page)).toBe("some");
    expect(pageState(togglePage(EMPTY_SELECTION, page), page)).toBe("all");
    expect(pageState(EMPTY_SELECTION, [])).toBe("none");
  });

  it("selects a partially selected page, and unticks a fully selected one", () => {
    const page = ["a", "b"];
    const some = toggleRow(EMPTY_SELECTION, "a");
    expect(pageState(togglePage(some, page), page)).toBe("all");
    expect(pageState(togglePage(togglePage(some, page), page), page)).toBe(
      "none",
    );
  });

  it("keeps ids from other pages when a page is toggled", () => {
    const selection = togglePage(toggleRow(EMPTY_SELECTION, "other-page"), [
      "a",
      "b",
    ]);
    expect(selectedCount(selection, 100)).toBe(3);
    expect(isSelected(togglePage(selection, ["a", "b"]), "other-page")).toBe(
      true,
    );
  });

  it("counts the ticked ids, whatever the total", () => {
    expect(selectedCount(toggleRow(EMPTY_SELECTION, "a"), 1000)).toBe(1);
  });
});

describe('filter mode ("select all")', () => {
  it("selects every row, and unticking one excludes it", () => {
    const all = selectAllMatching();
    expect(isSelected(all, "anything")).toBe(true);
    const without = toggleRow(all, "x");
    expect(isSelected(without, "x")).toBe(false);
    expect(isSelected(toggleRow(without, "x"), "x")).toBe(true); // ticked again
  });

  it("counts total minus exclusions, never below zero", () => {
    const excluded = toggleRow(toggleRow(selectAllMatching(), "a"), "b");
    expect(selectedCount(excluded, 45)).toBe(43);
    expect(selectedCount(excluded, 1)).toBe(0);
  });

  it("unticking a page excludes its rows, ticking it again restores them", () => {
    const page = ["a", "b"];
    const none = togglePage(selectAllMatching(), page);
    expect(pageState(none, page)).toBe("none");
    expect(selectedCount(none, 10)).toBe(8);
    expect(pageState(togglePage(none, page), page)).toBe("all");
  });
});

describe("toApiSelection", () => {
  it("sends the ticked ids", () => {
    const selection = toggleRow(toggleRow(EMPTY_SELECTION, "a"), "b");
    expect(toApiSelection(selection, [])).toEqual({
      mode: "ids",
      ids: ["a", "b"],
    });
  });

  it("sends the filters and the exclusions, never the ids of the whole result", () => {
    const filters = [{ column: "c0", op: "gt" as const, value: "1" }];
    const selection = toggleRow(selectAllMatching(), "x");
    expect(toApiSelection(selection, filters)).toEqual({
      mode: "filter",
      filters,
      excluded_ids: ["x"],
    });
  });
});
