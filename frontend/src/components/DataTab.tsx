import { useState } from "react";

import { useTableState } from "../hooks/useTableState";
import type { ImportSummary, IngestionReport, RowOut } from "../types/api";
import { DataTable } from "./DataTable";
import { ImportFileDialog } from "./ImportFileDialog";
import { RowEditDialog } from "./RowEditDialog";

export function DataTab({ item }: { item: ImportSummary }) {
  const [importing, setImporting] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  // The state lives here, above the table, so the import dialog can reset it.
  const { state, dispatch } = useTableState(item.id, item.columns);
  const hasData = item.columns.length > 0;

  const [editing, setEditing] = useState<{
    row: RowOut;
    rowNumber: number;
  } | null>(null);
  // Bumped after an edit: a streamed page does not refetch by itself and must restart.
  const [refreshKey, setRefreshKey] = useState(0);

  function handleImported(report: IngestionReport) {
    // A replace can change every column (old page, sort and filters are meaningless).
    // An append keeps the schema, so the user's view is kept.
    if (report.mode === "replace") {
      dispatch({ type: "reset" });
      setResetCount((count) => count + 1);
    }
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
            {`${item.row_count.toLocaleString("fr-FR")} lignes, ${item.columns.length} colonnes`}
            {item.last_import &&
              ` · dernier import : ${item.last_import.filename}`}
          </p>
          <DataTable
            importId={item.id}
            columns={item.columns}
            state={state}
            dispatch={dispatch}
            filterResetKey={resetCount}
            dataVersion={`${item.updated_at}:${refreshKey}`}
            onEditRow={(row, rowNumber) => setEditing({ row, rowNumber })}
          />{" "}
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
    </section>
  );
}
