import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ConfirmAction } from "../app/context";
export function ConfirmDialog({
  value,
  onClose,
  onConfirm,
}: {
  value: ConfirmAction | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (value) ref.current?.showModal();
    else ref.current?.close();
  }, [value]);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={onClose}
      aria-labelledby="confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {value && (
        <>
          <button
            className="icon-button dialog-close"
            onClick={onClose}
            aria-label="关闭确认"
          >
            <X size={19} />
          </button>
          <span className="eyebrow">请再确认一下</span>
          <h2 id="confirm-title">{value.title}</h2>
          <p>{value.description}</p>
          <div className="button-row">
            <button className="button secondary" autoFocus onClick={onClose}>
              再想一想
            </button>
            <button
              className={`button ${value.danger ? "danger" : ""}`}
              onClick={onConfirm}
            >
              {value.label}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
