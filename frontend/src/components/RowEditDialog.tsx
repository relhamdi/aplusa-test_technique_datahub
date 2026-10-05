import { useId, useMemo, useState } from "react";

import { useUpdateRow } from "../hooks/useRowMutations";
import type { Column, RowOut } from "../types/api";
import {
  displayParsed,
  displayStored,
  parseInput,
  toInput,
} from "../utils/cellValue";
import { Modal } from "./Modal";

interface RowEditDialogProps {
  importId: string;
  columns: Column[];
  row: RowOut;
  rowNumber: number; // position in the result set, for the title
  onClose: () => void;
  onSaved: () => void;
}

type Step = "edit" | "confirm";

export function RowEditDialog({
  importId,
  columns,
  row,
  rowNumber,
  onClose,
  onSaved,
}: RowEditDialogProps) {
  const initial = useMemo(
    () =>
      Object.fromEntries(
        columns.map((c) => [c.key, toInput(row.values[c.key], c.type)]),
      ),
    [columns, row],
  );
  const [inputs, setInputs] = useState<Record<string, string>>(initial);
  const [step, setStep] = useState<Step>("edit");
  const update = useUpdateRow(importId);
  const baseId = useId();

  // Only touched fields are validated and sent: an untouched field never blocks the save.
  const changes = useMemo(
    () =>
      columns
        .filter((c) => inputs[c.key] !== initial[c.key])
        .map((column) => ({
          column,
          parsed: parseInput(column.type, inputs[column.key]),
        })),
    [columns, inputs, initial],
  );
  const canSave = changes.length > 0 && changes.every((c) => c.parsed.ok);
  const errorByKey = new Map(
    changes.flatMap((c) =>
      c.parsed.ok ? [] : [[c.column.key, c.parsed.message] as const],
    ),
  );

  function confirm() {
    const values = Object.fromEntries(
      changes.flatMap(({ column, parsed }) =>
        parsed.ok ? [[column.key, parsed.value]] : [],
      ),
    );
    update.mutate({ rowId: row.id, values }, { onSuccess: onSaved });
  }

  return (
    // While the request runs, closing would hide it without stopping it.
    <Modal
      title={
        step === "edit"
          ? `Éditer la ligne ${rowNumber}`
          : "Confirmer les modifications"
      }
      onClose={update.isPending ? () => undefined : onClose}
    >
      {step === "edit" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) setStep("confirm");
          }}
        >
          <div className="modal-scroll">
            {columns.map((column) => {
              const id = `${baseId}-${column.key}`;
              const error = errorByKey.get(column.key);
              const onChange = (value: string) =>
                setInputs((current) => ({ ...current, [column.key]: value }));
              return (
                <div className="field" key={column.key}>
                  <label htmlFor={id}>{column.name}</label>
                  {column.type === "boolean" ? (
                    <select
                      id={id}
                      value={inputs[column.key]}
                      onChange={(e) => onChange(e.target.value)}
                    >
                      <option value="">(vide)</option>
                      <option value="true">Oui</option>
                      <option value="false">Non</option>
                    </select>
                  ) : (
                    <input
                      id={id}
                      value={inputs[column.key]}
                      inputMode={
                        column.type === "string" ? undefined : "decimal"
                      }
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${id}-error` : undefined}
                      onChange={(e) => onChange(e.target.value)}
                    />
                  )}
                  {error && (
                    <span id={`${id}-error`} className="error">
                      {error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {changes.length === 0 && <p className="hint">Aucune modification.</p>}
          <div className="actions">
            <button type="button" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="primary" disabled={!canSave}>
              Enregistrer
            </button>
          </div>
        </form>
      )}

      {step === "confirm" && (
        <>
          <p>{`Modifier ${changes.length} champ(s) de la ligne ${rowNumber} :`}</p>
          <ul>
            {changes.map(({ column, parsed }) => (
              <li key={column.key}>
                {`${column.name} : ${displayStored(row.values[column.key], column.type)} → ${
                  parsed.ok ? displayParsed(parsed.value, column.type) : ""
                }`}
              </li>
            ))}
          </ul>
          {update.error && (
            <p role="alert" className="error">
              {update.error.message}
            </p>
          )}
          <div className="actions">
            <button type="button" onClick={onClose} disabled={update.isPending}>
              Annuler
            </button>
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => {
                update.reset();
                setStep("edit");
              }}
            >
              Retour
            </button>
            <button
              type="button"
              className="primary"
              disabled={update.isPending}
              onClick={confirm}
            >
              {update.isPending ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
