import { expect, it } from "vitest";

import { formatCell } from "./formatCell";

it("formats booleans in French", () => {
  expect(formatCell(true, "boolean")).toBe("Oui");
  expect(formatCell(false, "boolean")).toBe("Non");
});

it("uses the French decimal comma and never truncates decimals", () => {
  expect(formatCell(2.5, "float")).toBe("2,5");
  expect(formatCell(0.123456, "float")).toBe("0,123456");
  expect(formatCell(42, "integer")).toBe("42");
});

it("keeps text as is", () => {
  expect(formatCell("(vide)", "string")).toBe("(vide)");
});
