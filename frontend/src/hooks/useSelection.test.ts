import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EMPTY_SELECTION, isSelected, toggleRow } from "../utils/selection";
import { useSelection } from "./useSelection";

describe("useSelection", () => {
  it("keeps the selection while the key is stable", () => {
    const { result, rerender } = renderHook(({ key }) => useSelection(key), {
      initialProps: { key: "a" },
    });
    act(() => result.current.setSelection(toggleRow(EMPTY_SELECTION, "x")));
    rerender({ key: "a" });
    expect(isSelected(result.current.selection, "x")).toBe(true);
  });

  it("drops the selection when the key changes, and does not bring it back", () => {
    const { result, rerender } = renderHook(({ key }) => useSelection(key), {
      initialProps: { key: "a" },
    });
    act(() => result.current.setSelection(toggleRow(EMPTY_SELECTION, "x")));

    rerender({ key: "b" });
    expect(isSelected(result.current.selection, "x")).toBe(false);

    rerender({ key: "a" }); // filters reverted: the old selection must not reappear
    expect(isSelected(result.current.selection, "x")).toBe(false);
  });
});
