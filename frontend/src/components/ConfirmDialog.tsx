import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={pending ? () => undefined : onCancel}>
      <p>{message}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={onCancel} disabled={pending}>
          Annuler
        </button>
        <button
          type="button"
          className="danger"
          onClick={onConfirm}
          disabled={pending}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
