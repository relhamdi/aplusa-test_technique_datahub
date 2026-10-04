import { useState } from "react";

import { useBatchDelete } from "../hooks/useBatchMutations";
import { useSelection } from "../hooks/useSelection";
import { useTableState } from "../hooks/useTableState";
import type {
  BatchResult,
  ImportSummary,
  IngestionReport,
  RowOut,
} from "../types/api";
import { EMPTY_SELECTION, toApiSelection } from "../utils/selection";
import { BatchEditDialog } from "./BatchEditDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { DataTable } from "./DataTable";
import { ImportFileDialog } from "./ImportFileDialog";
import { RowEditDialog } from "./RowEditDialog";

type BatchDialog = { kind: "edit" | "delete"; count: number } | null;

const fr = (n: number) => n.toLocaleString("fr-FR");

export function DataTab({ item }: { item: ImportSummary }) {
  const [importing, setImporting] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const [editing, setEditing] = useState<{
    row: RowOut;
    rowNumber: number;
  } | null>(null);
  // Bumped after an edit: a streamed page does not refetch by itself and must restart.
  const [refreshKey, setRefreshKey] = useState(0);
  const [batchDialog, setBatchDialog] = useState<BatchDialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The state lives here, above the table, so the dialogs can reset it.
  const { state, dispatch } = useTableState(item.id, item.columns);
  // A selection only makes sense for the filters it was made under, and for the
  // schema it was made on: changing either drops it.
  const { selection, setSelection } = useSelection(
    `${item.id}:${resetCount}:${JSON.stringify(state.filters)}`,
  );
  const batchDelete = useBatchDelete(item.id);
  const hasData = item.columns.length > 0;

  // "Select all" with no filter targets the whole import: say it in the confirmations.
  const wholeImportWarning =
    selection.mode === "filter" && state.filters.length === 0
      ? "Aucun filtre n'est appliqué : cela concerne toutes les lignes de l'import."
      : null;

  function handleImported(report: IngestionReport) {
    // A replace can change every column (old page, sort and filters are meaningless).
    // An append keeps the schema, so the user's view is kept.
    if (report.mode === "replace") {
      dispatch({ type: "reset" });
      setResetCount((count) => count + 1);
    }
  }

  function closeBatchDialog() {
    setBatchDialog(null);
    batchDelete.reset();
  }

  function finishBatch(message: string) {
    setNotice(message);
    setSelection(EMPTY_SELECTION);
    setRefreshKey((key) => key + 1);
    closeBatchDialog();
  }

  function openBatch(kind: "edit" | "delete", count: number) {
    setNotice(null);
    setBatchDialog({ kind, count });
  }

  return (
    <section>
      <div className="toolbar">
        <button
          type="button"
          className="primary"
          onClick={() => setImporting(true)}
        >
          Importer un fichier
        </button>
      </div>

      {hasData ? (
        <>
          <p>
            {`${fr(item.row_count)} lignes, ${item.columns.length} colonnes`}
            {item.last_import &&
              ` · dernier import : ${item.last_import.filename}`}
          </p>
          {notice && (
            <p role="status" className="notice">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)}>
                Fermer
              </button>
            </p>
          )}
          <DataTable
            importId={item.id}
            columns={item.columns}
            state={state}
            dispatch={dispatch}
            filterResetKey={resetCount}
            dataVersion={`${item.updated_at}:${refreshKey}`}
            selection={selection}
            onSelectionChange={setSelection}
            onEditRow={(row, rowNumber) => setEditing({ row, rowNumber })}
            onEditSelection={(count) => openBatch("edit", count)}
            onDeleteSelection={(count) => openBatch("delete", count)}
          />
        </>
      ) : (
        <p>Aucune donnée. Importez un fichier CSV ou XLSX pour commencer.</p>
      )}

      {importing && (
        <ImportFileDialog
          item={item}
          onClose={() => setImporting(false)}
          onImported={handleImported}
        />
      )}

      {editing && (
        <RowEditDialog
          importId={item.id}
          columns={item.columns}
          row={editing.row}
          rowNumber={editing.rowNumber}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRefreshKey((key) => key + 1);
          }}
        />
      )}

      {batchDialog?.kind === "edit" && (
        <BatchEditDialog
          importId={item.id}
          columns={item.columns}
          count={batchDialog.count}
          selection={toApiSelection(selection, state.filters)}
          warning={wholeImportWarning}
          onClose={closeBatchDialog}
          onDone={(result: BatchResult) =>
            finishBatch(
              `${fr(result.affected)} ligne(s) modifiée(s) sur ${fr(result.matched)} sélectionnée(s).`,
            )
          }
        />
      )}

      {batchDialog?.kind === "delete" && (
        <ConfirmDialog
          title="Supprimer la sélection"
          message={`Supprimer définitivement ${fr(batchDialog.count)} ligne(s) ? ${wholeImportWarning ?? ""}`.trim()}
          confirmLabel="Supprimer"
          pending={batchDelete.isPending}
          error={batchDelete.error?.message ?? null}
          onConfirm={() =>
            batchDelete.mutate(toApiSelection(selection, state.filters), {
              onSuccess: (result) =>
                finishBatch(`${fr(result.affected)} ligne(s) supprimée(s).`),
            })
          }
          onCancel={closeBatchDialog}
        />
      )}
    </section>
  );
}
