import { afterEach, describe, expect, it, vi } from "vitest";
import type { Column } from "../types/api";
import { DEFAULT_STATE } from "./tableState";
import {
    clearSavedState,
    columnsSignature,
    loadSavedState,
    resetStorageWarnings,
    saveState,
} from "./tableStorage";

const columns: Column[] = [{ key: "c0", name: "id", type: "integer" }];
const sig = columnsSignature(columns);

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    resetStorageWarnings();
});

describe("tableStorage", () => {
    it("saves, loads and clears per import", () => {
        const state = { ...DEFAULT_STATE, page: 3 };
        saveState("a", sig, state);
        expect(loadSavedState("a", sig)).toEqual(state);
        expect(loadSavedState("b", sig)).toBeNull();
        clearSavedState("a");
        expect(loadSavedState("a", sig)).toBeNull();
    });

    it("changes the signature when a column is renamed or retyped", () => {
        expect(
            columnsSignature([{ key: "c0", name: "id", type: "float" }]),
        ).not.toBe(sig);
        expect(
            columnsSignature([{ key: "c0", name: "ids", type: "integer" }]),
        ).not.toBe(sig);
    });

    it("treats corrupted content as no saved state", () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined); // keep test output clean
        localStorage.setItem("datahub:table:a", "{not json");
        expect(loadSavedState("a", sig)).toBeNull();
        localStorage.setItem(
            "datahub:table:a",
            JSON.stringify({ signature: sig }),
        );
        expect(loadSavedState("a", sig)).toBeNull();
    });

    it("never throws when storage is unavailable, and warns only once per action", () => {
        const warn = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("full");
        });
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
            throw new Error("denied");
        });

        expect(() => saveState("a", sig, DEFAULT_STATE)).not.toThrow();
        expect(() => saveState("a", sig, DEFAULT_STATE)).not.toThrow();
        expect(loadSavedState("a", sig)).toBeNull();
        expect(() => clearSavedState("a")).not.toThrow();

        // write (x2, deduplicated) + read + clear = 3 warnings
        expect(warn).toHaveBeenCalledTimes(3);
    });
});
