import { Link, useParams, useSearchParams } from "react-router-dom";

import { DataTab } from "../components/DataTab";
import { StatsTab } from "../components/StatsTab";
import { useImport } from "../hooks/useImports";
import { ApiError } from "../services/http";

type Tab = "data" | "stats";

export function ImportPage() {
  const { id = "" } = useParams();
  const { data, isPending, error } = useImport(id);
  const [params, setParams] = useSearchParams();
  // A reload or a shared link opens the same tab, 
  // and Back returns to the previous one. Every other key (table and statistics state) is kept.
  const tab: Tab = params.get("tab") === "stats" ? "stats" : "data";

  function selectTab(next: Tab) {
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      if (next === "stats") updated.set("tab", "stats");
      else updated.delete("tab");
      return updated;
    });
  }

  return (
    <main className="page">
      <Link to="/">← Retour aux imports</Link>

      {isPending && <p>Chargement…</p>}
      {error && (
        <p role="alert" className="error">
          {error instanceof ApiError && error.status === 404
            ? "Import introuvable."
            : `Erreur : ${error.message}`}
        </p>
      )}

      {data && (
        <>
          <h1>{data.name}</h1>
          <div role="tablist" className="tabs">
            <button
              role="tab"
              aria-selected={tab === "data"}
              aria-controls="import-panel"
              onClick={() => selectTab("data")}
            >
              Données
            </button>
            <button
              role="tab"
              aria-selected={tab === "stats"}
              aria-controls="import-panel"
              onClick={() => selectTab("stats")}
            >
              Statistiques
            </button>
          </div>
          <div role="tabpanel" id="import-panel">
            {/* The key remounts the tab when another import is opened. */}
            {tab === "data" ? (
              <DataTab key={data.id} item={data} />
            ) : (
              <StatsTab key={data.id} item={data} />
            )}
          </div>
        </>
      )}
    </main>
  );
}
