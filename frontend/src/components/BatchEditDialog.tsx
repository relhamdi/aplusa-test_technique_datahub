import { useMemo, useState } from "react";

import { useBatchUpdate } from "../hooks/useBatchMutations";
import type { ApiSelection, BatchResult, Column } from "../types/api";
import {
  defaultDrafts,
  isPlanValid,
  planBatch,
  toFields,
  type BatchMode,
  type FieldDraft,
} from "../utils/batchDraft";
import { displayParsed } from "../utils/cellValue";
import { Modal } from "./Modal";

const MODE_LABELS: Record<BatchMode, string> = {
  keep: "Conserver",
  set: "Modifier",
  clear: "Vider",
};
const MODES = Object.keys(MODE_LABELS) as BatchMode[];
const fr = (n: number) => n.toLocaleString("fr-FR");

interface BatchEditDialogProps {
  importId: string;
  columns: Column[];
  count: number; // rows the selection covers, for the messages
  selection: ApiSelection;
  warning: string | null; // shown when the selection covers the whole import
  onClose: () => void;
  onDone: (result: BatchResult) => void;
}

export function BatchEditDialog({
  importId,
  columns,
  count,
  selection,
  warning,
  onClose,
  onDone,
}: BatchEditDialogProps) {
  const [drafts, setDrafts] = useState(() => defaultDrafts(columns));
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const update = useBatchUpdate(importId);

  const plan = useMemo(() => planBatch(columns, drafts), [columns, drafts]);
  const valid = isPlanValid(plan);
  const errorByKey = new Map(
    plan.flatMap((change) =>
      change.error ? [[change.column.key, change.error] as const] : [],
    ),
  );

  function patch(key: string, change: Partial<FieldDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], ...change },
    }));
  }

  function apply() {
    update.mutate({ selection, fields: toFields(plan) }, { onSuccess: onDone });
  }

  return (
    <Modal
      title={
        step === "edit" ? "Modifier la sélection" : "Confirmer la modification"
      }
      onClose={update.isPending ? () => undefined : onClose}
    >
      {step === "edit" && (
        <>
          <p>{`${fr(count)} ligne(s) concernée(s). Pour chaque colonne : conserver, modifier ou vider la valeur (la ligne est conservée).`}</p>
          <div className="modal-scroll">
            {columns.map((column) => {
              const draft = drafts[column.key];
              const error = errorByKey.get(column.key);
              const valueLabel = `Valeur pour ${column.name}`;
              return (
                <div className="batch-row" key={column.key}>
                  <span className="batch-name">{column.name}</span>
                  <select
                    aria-label={`Action pour ${column.name}`}
                    value={draft.mode}
                    onChange={(event) =>
                      patch(column.key, {
                        mode: event.target.value as BatchMode,
                      })
                    }
                  >
                    {MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                  {draft.mode !== "set" ? (
                    <span />
                  ) : column.type === "boolean" ? (
                    <select
                      aria-label={valueLabel}
                      value={draft.input}
                      onChange={(event) =>
                        patch(column.key, { input: event.target.value })
                      }
                    >
                      <option value="true">Oui</option>
                      <option value="false">Non</option>
                    </select>
                  ) : (
                    <input
                      aria-label={valueLabel}
                      aria-invalid={error ? true : undefined}
                      value={draft.input}
                      inputMode={
                        column.type === "string" ? undefined : "decimal"
                      }
                      onChange={(event) =>
                        patch(column.key, { input: event.target.value })
                      }
                    />
                  )}
                  {error && <span className="error">{error}</span>}
                </div>
              );
            })}
          </div>
          <div className="actions">
            <button type="button" onClick={onClose}>
              Annuler
            </button>
            <button
              type="button"
              className="primary"
              disabled={!valid}
              onClick={() => setStep("confirm")}
            >
              Continuer
            </button>
          </div>
        </>
      )}

      {step === "confirm" && (
        <>
          <p>{`Appliquer à ${fr(count)} ligne(s) :`}</p>
          <ul>
            {plan.map(({ column, action }) => (
              <li key={column.key}>
                {`${column.name} → ${action.action === "set" ? displayParsed(action.value, column.type) : "(vide)"}`}
              </li>
            ))}
          </ul>
          {warning && <p className="error">{warning}</p>}
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
              onClick={apply}
            >
              {update.isPending ? "Application…" : "Appliquer"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
