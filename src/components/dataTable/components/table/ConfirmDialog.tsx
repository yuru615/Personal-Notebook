import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const descriptionId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  return createPortal(
    <div
      className="table-confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={descriptionId}
        className="table-confirm-dialog"
      >
        <div className="table-confirm-header">
          <h2>{title}</h2>
        </div>
        <div className="table-confirm-body">
          <p id={descriptionId}>{description}</p>
        </div>
        <div className="table-confirm-actions">
          <button
            type="button"
            className="table-confirm-action"
            onClick={onCancel}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              danger
                ? "table-confirm-action table-confirm-action--danger"
                : "table-confirm-action table-confirm-action--primary"
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
