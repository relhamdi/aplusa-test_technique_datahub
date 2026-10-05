import { describe, expect, it } from "vitest";

import type { Column } from "../types/api";
import {
  draftFromFilter,
  validateDraft,
  type FilterDraft,
} from "./filterDraft";

const int: Column = { key: "c0", name: "n", type: "integer" };
const flt: Column = { key: "c1", name: "price", type: "float" };
const str: Column = { key: "c2", name: "label", type: "string" };
const bool: Column = { key: "c3", name: "flag", type: "boolean" };

const draft = (
  op: FilterDraft["op"],
  value = "",
  valueTo = "",
): FilterDraft => ({ op, value, valueTo });

describe("validateDraft", () => {
  it("applies nothing while the value is empty", () => {
    expect(validateDraft(str, draft("contains")).filter).toBeNull();
    expect(validateDraft(str, draft("contains", "   ")).filter).toBeNull();
    expect(validateDraft(int, draft("equals", " ")).invalid).toBe(false);
  });

  it("keeps text as typed, spaces included", () => {
    expect(validateDraft(str, draft("contains", " a b ")).filter).toEqual({
      column: "c2",
      op: "contains",
      value: " a b ",
    });
  });

  it("sends numbers as trimmed strings and accepts a decimal comma", () => {
    expect(validateDraft(flt, draft("gt", " 1,5 ")).filter).toEqual({
      column: "c1",
      op: "gt",
      value: "1,5",
    });
    expect(validateDraft(int, draft("equals", "-7")).filter).toEqual({
      column: "c0",
      op: "equals",
      value: "-7",
    });
  });

  it.each([
    [int, "1.5"],
    [int, "abc"],
    [flt, "1,2,3"],
    [flt, "x"],
  ])("flags %j as invalid for %s", (column, value) => {
    expect(validateDraft(column, draft("equals", value))).toEqual({
      filter: null,
      invalid: true,
    });
  });

  it("needs both bounds for between, and rejects reversed or invalid ones", () => {
    expect(validateDraft(int, draft("between", "2")).filter).toBeNull();
    expect(validateDraft(int, draft("between", "2")).invalid).toBe(false);
    expect(validateDraft(int, draft("between", "2", "9")).filter).toEqual({
      column: "c0",
      op: "between",
      value: "2",
      value_to: "9",
    });
    expect(validateDraft(int, draft("between", "9", "2")).invalid).toBe(true);
    expect(validateDraft(int, draft("between", "2", "x")).invalid).toBe(true);
  });

  it("needs no value for the empty operators", () => {
    expect(validateDraft(str, draft("is_empty")).filter).toEqual({
      column: "c2",
      op: "is_empty",
    });
    expect(validateDraft(int, draft("is_not_empty")).filter).toEqual({
      column: "c0",
      op: "is_not_empty",
    });
  });

  it("converts a boolean choice to a real boolean", () => {
    expect(validateDraft(bool, draft("equals", "true")).filter).toEqual({
      column: "c3",
      op: "equals",
      value: true,
    });
    expect(validateDraft(bool, draft("equals", "false")).filter).toEqual({
      column: "c3",
      op: "equals",
      value: false,
    });
    expect(validateDraft(bool, draft("equals", "")).filter).toBeNull();
  });
});

describe("draftFromFilter", () => {
  it("starts with the natural operator of the column type", () => {
    expect(draftFromFilter(str).op).toBe("contains");
    expect(draftFromFilter(int).op).toBe("equals");
  });

  it("round-trips an applied filter, so a restored state emits nothing", () => {
    const filter = {
      column: "c0",
      op: "between" as const,
      value: "2",
      value_to: "9",
    };
    expect(validateDraft(int, draftFromFilter(int, filter)).filter).toEqual(
      filter,
    );
    const flag = { column: "c3", op: "equals" as const, value: true };
    expect(validateDraft(bool, draftFromFilter(bool, flag)).filter).toEqual(
      flag,
    );
  });
});
