import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { DataTab } from "../components/DataTab";
import { useImport } from "../hooks/useImports";
import { ApiError } from "../services/http";

type Tab = "data" | "stats";

export function ImportPage() {
  const { id = "" } = useParams();
  const { data, isPending, error } = useImport(id);
  const [tab, setTab] = useState<Tab>("data");

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
              onClick={() => setTab("data")}
            >
              Données
            </button>
            <button
              role="tab"
              aria-selected={tab === "stats"}
              onClick={() => setTab("stats")}
            >
              Statistiques
            </button>
          </div>
          <div role="tabpanel">
            {tab === "data" ? (
              <DataTab item={data} />
            ) : (
              <p>Statistiques : TODO.</p>
            )}
          </div>{" "}
        </>
      )}
    </main>
  );
}
