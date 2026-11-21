import type { ReactNode } from "react";
import { Btn } from "./controls";
import { Dialog } from "./Dialog";

interface ConfirmProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A destructive confirmation. Cancel has focus; Escape cancels. */
export function Confirm({ title, body, confirmLabel, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog title={title} onClose={onCancel} role="alertdialog" width={420} bare>
      <p className="leading-relaxed text-graph-muted [overflow-wrap:anywhere]">{body}</p>
      <div className="mt-6 flex justify-end gap-[2ch]">
        <Btn data-autofocus onClick={onCancel}>
          cancel
        </Btn>
        <Btn variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Btn>
      </div>
    </Dialog>
  );
}
