import type { ColumnType } from "../types/api";
import { formatCell } from "./formatCell";
import { isNumberText } from "./numbers";

export type ParseResult =
    | { ok: true; value: unknown }
    | { ok: false; message: string };

/** Text shown in a form field for a stored value. */
export function toInput(value: unknown, type: ColumnType): string {
    if (value === null || value === undefined) return "";
    if (type === "boolean") return value ? "true" : "false";
    // French users type a decimal comma; the backend accepts both.
    if (type === "float") return String(value).replace(".", ",");
    return String(value);
}

/**
 * Turns what the user typed into the value sent to the API. 
 * A blank field means "empty value" (null). Numbers are sent as typed text: 
 * the backend converts them with the ingestion rules, so large integers lose no precision on the way.
 */
export function parseInput(type: ColumnType, raw: string): ParseResult {
    switch (type) {
        case "boolean":
            if (raw === "") return { ok: true, value: null };
            if (raw === "true" || raw === "false")
                return { ok: true, value: raw === "true" };
            return { ok: false, message: "Choisissez Oui, Non ou vide." };
        case "integer":
        case "float": {
            const text = raw.trim();
            if (text === "") return { ok: true, value: null };
            if (!isNumberText(type, text)) {
                return {
                    ok: false,
                    message:
                        type === "integer"
                            ? "Entier attendu (ex. 42)."
                            : "Nombre attendu (ex. 3,5).",
                };
            }
            return { ok: true, value: text };
        }
        case "string":
            return { ok: true, value: raw.trim() === "" ? null : raw };
    }
}

const EMPTY = "(vide)";

export function displayStored(value: unknown, type: ColumnType): string {
    return value === null || value === undefined
        ? EMPTY
        : formatCell(value, type);
}

/** Display of a value about to be sent. Numeric text goes through Number: display only. */
export function displayParsed(value: unknown, type: ColumnType): string {
    if (value === null || value === undefined) return EMPTY;
    if (type === "integer" || type === "float") {
        return formatCell(Number(String(value).replace(",", ".")), type);
    }
    return formatCell(value, type);
}
