import { describe, expect, it } from "vitest";

import type { Column } from "../types/api";
import {
  defaultDrafts,
  isPlanValid,
  planBatch,
  toFields,
  type FieldDraft,
} from "./batchDraft";

const columns: Column[] = [
  { key: "c0", name: "id", type: "integer" },
  { key: "c1", name: "label", type: "string" },
  { key: "c2", name: "flag", type: "boolean" },
];

function drafts(overrides: Record<string, Partial<FieldDraft>>) {
  const base = defaultDrafts(columns);
  return Object.fromEntries(
    Object.entries(base).map(([key, draft]) => [
      key,
      { ...draft, ...overrides[key] },
    ]),
  );
}

describe("batch drafts", () => {
  it("keeps every column by default, so nothing can be sent", () => {
    const plan = planBatch(columns, defaultDrafts(columns));
    expect(plan).toEqual([]);
    expect(isPlanValid(plan)).toBe(false);
  });

  it('plans set and clear, and leaves "keep" columns out', () => {
    const plan = planBatch(
      columns,
      drafts({
        c1: { mode: "set", input: "zeta" },
        c2: { mode: "clear" },
      }),
    );
    expect(isPlanValid(plan)).toBe(true);
    expect(toFields(plan)).toEqual({
      c1: { action: "set", value: "zeta" },
      c2: { action: "clear" },
    });
  });

  it('starts a boolean "set" on a real value', () => {
    const plan = planBatch(columns, drafts({ c2: { mode: "set" } }));
    expect(toFields(plan)).toEqual({ c2: { action: "set", value: true } });
  });

  it('refuses a blank value for "set" and points to "Vider"', () => {
    const plan = planBatch(
      columns,
      drafts({ c1: { mode: "set", input: "  " } }),
    );
    expect(isPlanValid(plan)).toBe(false);
    expect(plan[0].error).toContain("Vider");
    expect(toFields(plan)).toEqual({}); // an invalid change is never sent
  });

  it("refuses a value that does not match the column type", () => {
    const plan = planBatch(
      columns,
      drafts({ c0: { mode: "set", input: "abc" } }),
    );
    expect(plan[0].error).toBe("Entier attendu (ex. 42).");
  });

  it("is invalid as soon as one change is invalid, even if another is fine", () => {
    const plan = planBatch(
      columns,
      drafts({
        c0: { mode: "set", input: "abc" },
        c2: { mode: "clear" },
      }),
    );
    expect(isPlanValid(plan)).toBe(false);
    expect(toFields(plan)).toEqual({ c2: { action: "clear" } });
  });
});
