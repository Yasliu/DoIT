import { useEffect } from "react";
import { addTableColumn, addTableRow, deleteTableColumn, deleteTableRow } from "../lib/format";
import { cx } from "../lib/text";

interface TableMenuProps {
  x: number;
  y: number;
  cell: HTMLElement;
  onClose: () => void;
  /** called after the DOM was mutated so the owner can re-serialise the document */
  onChanged: () => void;
}

/** Right-click menu for table cells: + Add Column, + Add Row, Delete Row. */
export function TableMenu({ x, y, cell, onClose, onChanged }: TableMenuProps) {
  const isHeader = cell.tagName === "TH";
  const onlyColumn = (cell.closest("tr")?.children.length ?? 1) <= 1;
  const width = 168;
  const posX = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const posY = Math.max(8, Math.min(y, window.innerHeight - 170));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (fn: () => void) => {
    fn();
    onChanged();
    onClose();
  };

  const item =
    "flex h-8 w-full items-center rounded-[8px] px-2.5 text-left text-[12px] transition-colors duration-150";

  return (
    <>
      <div
        className="fixed inset-0 z-[110] cursor-default"
        onPointerDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        style={{ left: posX, top: posY, width }}
        onContextMenu={(e) => e.preventDefault()}
        className="fixed z-[115] rounded-[13px] border border-white/15 bg-[#131418]/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.88)] backdrop-blur-2xl select-none"
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(() => addTableColumn(cell))}
          className={cx(item, "text-ink-2 hover:bg-white/[0.08] hover:text-white")}
        >
          + Add Column
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(() => addTableRow(cell))}
          className={cx(item, "text-ink-2 hover:bg-white/[0.08] hover:text-white")}
        >
          + Add Row
        </button>
        <div className="my-1 h-px bg-white/[0.08]" />
        <button
          type="button"
          disabled={onlyColumn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(() => deleteTableColumn(cell))}
          className={cx(
            item,
            onlyColumn ? "cursor-default text-ink-4 opacity-40" : "text-ink-2 hover:bg-white/[0.08] hover:text-white",
          )}
        >
          Delete Column
        </button>
        <button
          type="button"
          disabled={isHeader}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(() => deleteTableRow(cell))}
          className={cx(
            item,
            isHeader ? "cursor-default text-ink-4 opacity-40" : "text-ink-2 hover:bg-white/[0.08] hover:text-white",
          )}
        >
          Delete Row
        </button>
      </div>
    </>
  );
}
