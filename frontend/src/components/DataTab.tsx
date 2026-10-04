import { useState } from "react";

import type { ImportSummary } from "../types/api";
import { ImportFileDialog } from "./ImportFileDialog";

export function DataTab({ item }: { item: ImportSummary }) {
  const [importing, setImporting] = useState(false);
  const hasData = item.columns.length > 0;

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
        <p>
          {`${item.row_count.toLocaleString("fr-FR")} lignes, ${item.columns.length} colonnes`}
          {item.last_import &&
            ` · dernier import : ${item.last_import.filename}`}
        </p>
      ) : (
        <p>Aucune donnée. Importez un fichier CSV ou XLSX pour commencer.</p>
      )}
      <p className="hint">Tableau des données : à venir.</p>

      {importing && (
        <ImportFileDialog item={item} onClose={() => setImporting(false)} />
      )}
    </section>
  );
}
