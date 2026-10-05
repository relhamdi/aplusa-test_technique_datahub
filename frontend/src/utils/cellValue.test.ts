import { describe, expect, it } from "vitest";

import { displayParsed, displayStored, parseInput, toInput } from "./cellValue";

describe("toInput", () => {
  it("turns stored values into field text", () => {
    expect(toInput(null, "string")).toBe("");
    expect(toInput(undefined, "integer")).toBe("");
    expect(toInput(true, "boolean")).toBe("true");
    expect(toInput(false, "boolean")).toBe("false");
    expect(toInput(12, "integer")).toBe("12");
    expect(toInput("abc", "string")).toBe("abc");
  });

  it("uses a decimal comma for floats", () => {
    expect(toInput(2.5, "float")).toBe("2,5");
  });
});

describe("parseInput", () => {
  it("treats a blank field as an empty value, whatever the type", () => {
    expect(parseInput("string", "   ")).toEqual({ ok: true, value: null });
    expect(parseInput("integer", "")).toEqual({ ok: true, value: null });
    expect(parseInput("float", " ")).toEqual({ ok: true, value: null });
    expect(parseInput("boolean", "")).toEqual({ ok: true, value: null });
  });

  it("keeps text exactly as typed", () => {
    expect(parseInput("string", " a b ")).toEqual({ ok: true, value: " a b " });
  });

  it("sends numbers as trimmed text and accepts a decimal comma", () => {
    expect(parseInput("integer", " 42 ")).toEqual({ ok: true, value: "42" });
    expect(parseInput("float", "3,5")).toEqual({ ok: true, value: "3,5" });
    expect(parseInput("float", "-.5")).toEqual({ ok: true, value: "-.5" });
  });

  it("rejects text that is not a number, with a message", () => {
    expect(parseInput("integer", "1.5")).toMatchObject({
      ok: false,
      message: "Entier attendu (ex. 42).",
    });
    expect(parseInput("integer", "abc")).toMatchObject({ ok: false });
    expect(parseInput("float", "1,2,3")).toMatchObject({
      ok: false,
      message: "Nombre attendu (ex. 3,5).",
    });
  });

  it("converts the boolean choice to a real boolean", () => {
    expect(parseInput("boolean", "true")).toEqual({ ok: true, value: true });
    expect(parseInput("boolean", "false")).toEqual({ ok: true, value: false });
    expect(parseInput("boolean", "maybe")).toMatchObject({ ok: false });
  });
});

describe("display helpers", () => {
  it("shows an explicit marker for empty values", () => {
    expect(displayStored(null, "string")).toBe("(vide)");
    expect(displayParsed(null, "integer")).toBe("(vide)");
  });

  it("formats stored and about-to-be-sent values the same way", () => {
    expect(displayStored(true, "boolean")).toBe("Oui");
    expect(displayStored(2.5, "float")).toBe("2,5");
    expect(displayParsed("2,5", "float")).toBe("2,5");
    expect(displayParsed(false, "boolean")).toBe("Non");
    expect(displayParsed("beta", "string")).toBe("beta");
  });
});
