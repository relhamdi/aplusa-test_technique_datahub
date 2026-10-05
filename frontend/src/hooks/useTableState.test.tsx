import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { Column } from "../types/api";
import {
  DEFAULT_STATE,
  mergeTableParams,
  type TableState,
} from "../utils/tableState";
import {
  columnsSignature,
  loadSavedState,
  saveState,
} from "../utils/tableStorage";
import { useTableState } from "./useTableState";

// Stable reference.
const COLUMNS: Column[] = [
  { key: "c0", name: "id", type: "integer" },
  { key: "c1", name: "label", type: "string" },
];
const SIGNATURE = columnsSignature(COLUMNS);

const saved: TableState = {
  page: 2,
  pageSize: 100,
  sort: { column: "c0", direction: "desc" },
  filters: [{ column: "c1", op: "contains", value: "x" }],
};

const wrap = (route = "/") =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  };

const setup = (route?: string) =>
  renderHook(() => useTableState("imp1", COLUMNS), { wrapper: wrap(route) });

afterEach(() => localStorage.clear());

describe("useTableState", () => {
  it("starts from the default state", () => {
    expect(setup().result.current.state).toEqual(DEFAULT_STATE);
  });

  it("reads the state from the URL", () => {
    const route = `/?${mergeTableParams(new URLSearchParams(), saved)}`;
    expect(setup(route).result.current.state).toEqual(saved);
  });

  it("restores the saved state when the URL carries none", () => {
    saveState("imp1", SIGNATURE, saved);
    expect(setup().result.current.state).toEqual(saved);
  });

  it("ignores a saved state made for another schema", () => {
    saveState("imp1", "c0:other:string", saved);
    expect(setup().result.current.state).toEqual(DEFAULT_STATE);
  });

  it("drops URL filters on unknown columns", () => {
    const bad: TableState = {
      ...DEFAULT_STATE,
      filters: [{ column: "zz", op: "equals", value: 1 }],
    };
    const route = `/?${mergeTableParams(new URLSearchParams(), bad)}`;
    expect(setup(route).result.current.state.filters).toEqual([]);
  });

  it("applies a change, goes back to page 1 and persists it", () => {
    const { result } = setup();
    act(() => result.current.dispatch({ type: "page", page: 4 }));
    expect(result.current.state.page).toBe(4);

    act(() =>
      result.current.dispatch({
        type: "filters",
        filters: [{ column: "c0", op: "gt", value: 5 }],
      }),
    );
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.filters).toHaveLength(1);
    expect(loadSavedState("imp1", SIGNATURE)).toEqual(result.current.state);
  });

  it("reset does not bring the saved state back", () => {
    saveState("imp1", SIGNATURE, saved);
    const { result } = setup();
    expect(result.current.state).toEqual(saved);

    act(() => result.current.dispatch({ type: "reset" }));
    expect(result.current.state).toEqual(DEFAULT_STATE);
    expect(loadSavedState("imp1", SIGNATURE)).toEqual(DEFAULT_STATE);
  });

  it("does not persist anything while the import has no columns", () => {
    const none: Column[] = [];
    const { result } = renderHook(() => useTableState("imp1", none), {
      wrapper: wrap(),
    });
    act(() => result.current.dispatch({ type: "page", page: 2 }));
    expect(localStorage.length).toBe(0);
  });
});
