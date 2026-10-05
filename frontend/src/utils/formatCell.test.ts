import { expect, it } from "vitest";

import {
  formatAverage,
  formatCell,
  formatNumber,
  formatPercent,
} from "./formatCell";

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

it("formats percentages with two decimals and a French comma", () => {
  expect(formatPercent(25)).toBe("25,00 %");
  expect(formatPercent(50.08)).toBe("50,08 %");
});

it("formats plain numbers without truncating decimals", () => {
  expect(formatNumber(2.625)).toBe("2,625");
});

it("rounds an average to two decimals for display", () => {
  expect(formatAverage(250.63347991)).toBe("250,63");
  expect(formatAverage(2.5)).toBe("2,50");
});
