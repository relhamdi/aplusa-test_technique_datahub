import { type FormEvent, useId, useState } from "react";

import type { ImportCreate } from "../types/api";
import { Modal } from "./Modal";

interface ImportFormDialogProps {
  title: string;
  submitLabel: string;
  initial?: { name: string; description: string };
  pending: boolean;
  error: string | null;
  onSubmit: (values: ImportCreate) => void;
  onCancel: () => void;
}

// Used for both creation and edition: 
// the only differences are the initial values and the labels.
export function ImportFormDialog({
  title,
  submitLabel,
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: ImportFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const nameId = useId();
  const descriptionId = useId();
  const canSubmit = name.trim().length > 0 && !pending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit({ name: name.trim(), description });
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor={nameId}>Nom</label>
          <input
            id={nameId}
            value={name}
            maxLength={120}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={descriptionId}>Description</label>
          <textarea
            id={descriptionId}
            value={description}
            maxLength={1000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="primary" disabled={!canSubmit}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
