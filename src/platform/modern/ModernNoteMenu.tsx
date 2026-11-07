import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Copy, FolderInput, PanelRightOpen, Trash2 } from "lucide-react";

interface ModernNoteMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onOpen: () => void;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

const WIDTH = 210;
const HEIGHT = 170;

/** Right-click on a note card: open it, move or copy it to another shelf, or delete it. */
export function ModernNoteMenu({ x, y, onClose, onOpen, onMove, onCopy, onDelete }: ModernNoteMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const left = Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - HEIGHT - 8));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onMouseDown={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={menuRef} role="menu" className="ui-menu" style={{ position: "fixed", left, top, width: WIDTH, zIndex: 95, transformOrigin: "top left" }}>
        <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onOpen)}>
          <PanelRightOpen size={15} />
          Open
        </button>
        <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onMove)}>
          <FolderInput size={15} />
          Move to…
        </button>
        <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onCopy)}>
          <Copy size={15} />
          Copy to…
        </button>
        <div className="mx-2 my-1 h-px bg-[var(--l-border)]" />
        <button type="button" role="menuitem" className="ui-menu-item ui-menu-danger" onClick={run(onDelete)}>
          <Trash2 size={15} />
          Delete
        </button>
      </div>
    </>,
    document.body,
  );
}
