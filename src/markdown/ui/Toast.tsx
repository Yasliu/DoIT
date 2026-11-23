import { createPortal } from "react-dom";
import { Btn, Glyph } from "./controls";

interface ToastProps {
  message: string;
  /** One button after the message, such as undo. */
  action?: { label: string; run: () => void };
  onDismiss: () => void;
  /** How long it stays; a rule under it drains over this time. */
  ms?: number;
}

/** One line at the bottom of the window, like a shell's status message. */
export function Toast({ message, action, onDismiss, ms = 6200 }: ToastProps) {
  return createPortal(
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-10 z-[140] flex justify-center px-4">
      <div
        className="tm-layer graph-frame pointer-events-auto relative flex h-12 max-w-[560px] items-center gap-[2ch] pl-[2.5ch] pr-[1ch]"
        style={{ animation: "tm-in 180ms var(--ease) both" }}
      >
        <span className="min-w-0 truncate">{message}</span>
        {action && (
          <Btn
            onClick={() => {
              action.run();
              onDismiss();
            }}
          >
            {action.label.toLowerCase()}
          </Btn>
        )}
        <Glyph label="Dismiss" size="sm" onClick={onDismiss}>
          ×
        </Glyph>
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-graph-accent"
          style={{ animation: `tm-drain ${ms}ms linear forwards` }}
        />
      </div>
    </div>,
    document.body,
  );
}
