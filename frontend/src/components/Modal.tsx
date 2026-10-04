import { type ReactNode, useEffect, useId } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Deliberately no close-on-overlay-click: 
// a stray click must not discard what the user is typing.
// Escape and the Cancel button are the exits.
export function Modal({ title, onClose, children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
