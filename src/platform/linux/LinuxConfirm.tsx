import { useEffect } from "react";
import { createPortal } from "react-dom";

interface LinuxConfirmProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A destructive confirmation, rendered on <body> so a transformed parent (the sliding note sheet)
 * cannot trap it. Cancel has focus; Escape cancels.
 */
export function LinuxConfirm({ title, body, confirmLabel, onConfirm, onCancel }: LinuxConfirmProps) {
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
      <div className="lx-scrim" onPointerDown={(e) => e.stopPropagation()} onClick={onCancel} />
      <div className="pointer-events-none fixed inset-0 z-[125] grid place-items-center p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="lx-confirm-title"
          aria-describedby="lx-confirm-body"
          onPointerDown={(e) => e.stopPropagation()}
          className="lx-dialog w-full max-w-[360px]"
        >
          <h2 id="lx-confirm-title" className="text-[15px] font-semibold text-ink-1 [overflow-wrap:anywhere]">
            {title}
          </h2>
          <p id="lx-confirm-body" className="mt-1.5 text-[13.5px] leading-[20px] text-ink-3">
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
