import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, ClipboardCopy, Copy, FolderInput, Maximize2, PanelRightOpen, Trash2, Undo2 } from "lucide-react";

interface ModernNoteMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  settled: boolean;
  onOpen: () => void;
  onOpenFull?: () => void;
  onToggleSettled?: () => void;
  onMove: () => void;
  onCopy?: () => void;
  onCopyText?: () => void;
  onDelete: () => void;
}

const WIDTH = 210;
const ITEM_HEIGHT = 32;
/** The menu's padding and border, and the line above Delete. */
const MENU_CHROME = 19;

/** Right-click on a note: open, settle, file or delete it. */
export function ModernNoteMenu({ x, y, settled, onClose, onOpen, onOpenFull, onToggleSettled, onMove, onCopy, onCopyText, onDelete }: ModernNoteMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only the menu closes, not the sheet or dock panel behind it.
        e.stopPropagation();
        onClose();
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const left = Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8));
  const items = 3 + [onOpenFull, onToggleSettled, onCopy, onCopyText].filter(Boolean).length;
  const top = Math.max(8, Math.min(y, window.innerHeight - items * ITEM_HEIGHT - MENU_CHROME - 8));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onMouseDown={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={menuRef} role="menu" className="ui-menu" style={{ position: "fixed", left, top, width: WIDTH, zIndex: 95, transformOrigin: "top left" }}>
        <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onOpen)}>
          <PanelRightOpen size={15} />
          Open
        </button>
        {onOpenFull && (
          <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onOpenFull)}>
            <Maximize2 size={15} />
            Open full size
          </button>
        )}
        {onToggleSettled && (
          <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onToggleSettled)}>
            {settled ? <Undo2 size={15} /> : <CircleCheck size={15} />}
            {settled ? "Bring back" : "Settle"}
          </button>
        )}
        <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onMove)}>
          <FolderInput size={15} />
          Move to…
        </button>
        {onCopy && (
          <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onCopy)}>
            <Copy size={15} />
            Copy to…
          </button>
        )}
        {onCopyText && (
          <button type="button" role="menuitem" className="ui-menu-item" onClick={run(onCopyText)}>
            <ClipboardCopy size={15} />
            Copy text
          </button>
        )}
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
