import { useState } from "react";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { ImportFormDialog } from "../components/ImportFormDialog";
import { ImportList } from "../components/ImportList";
import {
  useCreateImport,
  useDeleteImport,
  useReorderImports,
  useUpdateImport,
} from "../hooks/useImportMutations";
import { useImports } from "../hooks/useImports";
import type { ImportSummary } from "../types/api";

// One state value for "which dialog is open": two dialogs can never be open at once.
type DialogState =
  | { kind: "create" }
  | { kind: "edit"; item: ImportSummary }
  | { kind: "delete"; item: ImportSummary }
  | null;

export function HomePage() {
  const { data, isPending, isError, error } = useImports();
  const create = useCreateImport();
  const update = useUpdateImport();
  const remove = useDeleteImport();
  const reorder = useReorderImports();
  const [dialog, setDialog] = useState<DialogState>(null);

  function closeDialog() {
    setDialog(null);
    // Do not show a previous attempt's error the next time a dialog opens.
    create.reset();
    update.reset();
    remove.reset();
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Datahub Simplifié</h1>
        <button
          type="button"
          className="primary"
          onClick={() => setDialog({ kind: "create" })}
        >
          Nouvel import
        </button>
      </header>

      {isPending && <p>Chargement…</p>}
      {isError && (
        <p role="alert" className="error">
          Erreur : {error.message}
        </p>
      )}
      {reorder.isError && (
        <p role="alert" className="error">
          Réorganisation impossible : {reorder.error.message}
        </p>
      )}
      {data && data.length === 0 && <p>Aucun import pour le moment.</p>}
      {data && data.length > 0 && (
        <ImportList
          items={data}
          onReorder={(ids) => reorder.mutate(ids)}
          onEdit={(item) => setDialog({ kind: "edit", item })}
          onDelete={(item) => setDialog({ kind: "delete", item })}
        />
      )}

      {dialog?.kind === "create" && (
        <ImportFormDialog
          title="Nouvel import"
          submitLabel="Créer"
          pending={create.isPending}
          error={create.error?.message ?? null}
          onSubmit={(values) =>
            create.mutate(values, { onSuccess: closeDialog })
          }
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "edit" && (
        <ImportFormDialog
          title="Modifier l'import"
          submitLabel="Enregistrer"
          initial={{
            name: dialog.item.name,
            description: dialog.item.description,
          }}
          pending={update.isPending}
          error={update.error?.message ?? null}
          onSubmit={(payload) =>
            update.mutate(
              { id: dialog.item.id, payload },
              { onSuccess: closeDialog },
            )
          }
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Supprimer l'import"
          message={`Supprimer « ${dialog.item.name} » ? Toutes ses données seront définitivement supprimées.`}
          confirmLabel="Supprimer"
          pending={remove.isPending}
          error={remove.error?.message ?? null}
          onConfirm={() =>
            remove.mutate(dialog.item.id, { onSuccess: closeDialog })
          }
          onCancel={closeDialog}
        />
      )}
    </main>
  );
}
