import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ModernConfirmProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A destructive confirmation, rendered on <body> so a transformed parent (the sliding note sheet)
 * cannot trap it. Cancel has focus; Escape cancels. Centred on the viewport.
 */
export function ModernConfirm({ title, body, confirmLabel, onConfirm, onCancel }: ModernConfirmProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return createPortal(
    <>
      <div className="ui-scrim" onPointerDown={(e) => e.stopPropagation()} onClick={onCancel} />
      <div className="fixed inset-0 z-[125] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ui-confirm-title"
          aria-describedby="ui-confirm-body"
          onPointerDown={(e) => e.stopPropagation()}
          className="ui-dialog pointer-events-auto w-full max-w-[360px]"
        >
          <h2 id="ui-confirm-title" className="text-[15px] font-semibold text-ink-1 [overflow-wrap:anywhere]">
            {title}
          </h2>
          <p id="ui-confirm-body" className="mt-1.5 text-[13.5px] leading-[20px] text-ink-3">
            {body}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={onCancel} autoFocus>
              Cancel
            </button>
            <button type="button" className="btn" data-variant="destructive" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
