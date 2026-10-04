import { useId, useState } from "react";

import { useDetectTypes, useIngest } from "../hooks/useIngestion";
import type {
  ColumnType,
  DetectedColumn,
  ImportSummary,
  IngestionReport,
  IngestMode,
} from "../types/api";
import { Modal } from "./Modal";

const TYPE_LABELS: Record<ColumnType, string> = {
  boolean: "Booléen",
  integer: "Entier",
  float: "Décimal",
  string: "Texte",
};
const TYPES = Object.keys(TYPE_LABELS) as ColumnType[];

type Step = "file" | "types" | "report";

const TITLES: Record<Step, string> = {
  file: "Importer un fichier",
  types: "Vérifier les types",
  report: "Import terminé",
};

interface ImportFileDialogProps {
  item: ImportSummary;
  onClose: () => void;
  // Lets the parent react to a finished import (e.g. reset the table after a replace).
  onImported?: (report: IngestionReport) => void;
}

export function ImportFileDialog({
  item,
  onClose,
  onImported,
}: ImportFileDialogProps) {
  // "append" needs an existing schema: it is only offered once the import has columns.
  const hasData = item.columns.length > 0;
  const [step, setStep] = useState<Step>("file");
  const [mode, setMode] = useState<IngestMode>("replace");
  const [file, setFile] = useState<File | null>(null);
  const [types, setTypes] = useState<DetectedColumn[]>([]);
  const [report, setReport] = useState<IngestionReport | null>(null);
  const detect = useDetectTypes();
  const ingest = useIngest(item.id);
  const fileId = useId();

  const pending = detect.isPending || ingest.isPending;
  const error = detect.error?.message ?? ingest.error?.message ?? null;

  function clearErrors() {
    detect.reset();
    ingest.reset();
  }

  function finish(result: IngestionReport) {
    setReport(result);
    setStep("report");
    onImported?.(result);
  }

  function submitFile() {
    if (!file) return;
    clearErrors();
    if (mode === "append") {
      ingest.mutate({ file, mode }, { onSuccess: finish });
    } else {
      detect.mutate(file, {
        onSuccess: (detected) => {
          setTypes(detected);
          setStep("types");
        },
      });
    }
  }

  function submitTypes() {
    if (!file) return;
    clearErrors();
    ingest.mutate({ file, mode: "replace", types }, { onSuccess: finish });
  }

  function setType(index: number, type: ColumnType) {
    setTypes((current) =>
      current.map((col, i) => (i === index ? { ...col, type } : col)),
    );
  }

  return (
    // While a request is running, closing would hide progress but not stop it.
    <Modal title={TITLES[step]} onClose={pending ? () => undefined : onClose}>
      {step === "file" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitFile();
          }}
        >
          {hasData && (
            <fieldset className="field">
              <legend>Mode d'import</legend>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "replace"}
                  onChange={() => {
                    setMode("replace");
                    clearErrors();
                  }}
                />{" "}
                Remplacer les données
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "append"}
                  onChange={() => {
                    setMode("append");
                    clearErrors();
                  }}
                />{" "}
                Ajouter à la suite
              </label>
            </fieldset>
          )}

          {hasData && mode === "replace" && (
            <p className="hint">
              Les données actuelles seront remplacées par celles du fichier.
            </p>
          )}
          {mode === "append" && (
            <p className="hint">
              Le fichier doit contenir exactement les mêmes colonnes (
              {item.columns.map((c) => c.name).join(", ")}), dans n'importe quel
              ordre. Les types existants sont conservés.
            </p>
          )}

          <div className="field">
            <label htmlFor={fileId}>Fichier (CSV ou XLSX)</label>
            <input
              id={fileId}
              type="file"
              accept=".csv,.txt,.xlsx"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                clearErrors();
              }}
            />
          </div>

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="button" onClick={onClose} disabled={pending}>
              Annuler
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!file || pending}
            >
              {pending
                ? "Traitement…"
                : mode === "append"
                  ? "Importer"
                  : "Analyser le fichier"}
            </button>
          </div>
        </form>
      )}

      {step === "types" && (
        <>
          <p className="hint">
            Types détectés dans « {file?.name} ». Corrigez-les si besoin : une
            valeur qui ne correspond pas au type choisi sera remplacée par une
            valeur vide et signalée dans le rapport. Une colonne ne contenant
            que 0 et 1 est détectée comme booléen : passez-la en Entier si ce
            sont des nombres.
          </p>
          <div className="table-scroll">
            <table className="types-table">
              <thead>
                <tr>
                  <th>Colonne</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {types.map((col, index) => (
                  <tr key={col.name}>
                    <td>{col.name}</td>
                    <td>
                      <select
                        aria-label={`Type de ${col.name}`}
                        value={col.type}
                        disabled={pending}
                        onChange={(event) =>
                          setType(index, event.target.value as ColumnType)
                        }
                      >
                        {TYPES.map((type) => (
                          <option key={type} value={type}>
                            {TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                clearErrors();
                setStep("file");
              }}
            >
              Retour
            </button>
            <button
              type="button"
              className="primary"
              disabled={pending}
              onClick={submitTypes}
            >
              {pending ? "Import en cours…" : "Importer"}
            </button>
          </div>
        </>
      )}

      {step === "report" && report && (
        <>
          <p>{`Lignes importées : ${report.rows_inserted.toLocaleString("fr-FR")}`}</p>
          <p>{`Total de lignes dans l'import : ${report.row_count.toLocaleString("fr-FR")}`}</p>
          {report.rejected.length === 0 ? (
            <p>Toutes les valeurs ont été converties.</p>
          ) : (
            <>
              <p>Valeurs non convertibles, remplacées par une valeur vide :</p>
              <ul>
                {report.rejected.map((r) => (
                  <li key={r.column}>{`${r.column} : ${r.count} valeur(s)`}</li>
                ))}
              </ul>
            </>
          )}
          <div className="actions">
            <button type="button" className="primary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
