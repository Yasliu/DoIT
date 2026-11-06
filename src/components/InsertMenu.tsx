import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Code, Image as ImageIcon, ListChecks, Menu, Table as TableIcon } from "lucide-react";
import { cx } from "../lib/text";

interface InsertMenuProps {
  editorRef?: React.RefObject<HTMLElement | null>;
  onInsertTable: () => void;
  onInsertTask: () => void;
  onInsertCode: () => void;
  onAttachImage: () => void;
  hasMedia?: boolean;
  large?: boolean;
  compact?: boolean;
}

export function InsertMenu({
  editorRef,
  onInsertTable,
  onInsertTask,
  onInsertCode,
  onAttachImage,
  hasMedia = false,
  large = false,
  compact = false,
}: InsertMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const w = 210;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const menuHeight = 180;
    const fitsBelow = r.bottom + menuHeight + 8 <= window.innerHeight;
    const top = fitsBelow ? r.bottom + 4 : Math.max(8, r.top - menuHeight - 4);
    setMenuPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open) {
      const ed = editorRef?.current;
      const sel = window.getSelection();
      if (ed && sel && sel.rangeCount > 0 && ed.contains(sel.anchorNode)) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    }
    setOpen((v) => !v);
  };

  const restoreCaret = () => {
    const ed = editorRef?.current;
    if (ed) {
      ed.focus();
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        if (sel) {
          try {
            sel.removeAllRanges();
            sel.addRange(savedRangeRef.current);
          } catch {}
        }
      }
    }
  };

  const handleAction = (action: () => void) => {
    setOpen(false);
    restoreCaret();
    action();
  };

  return (
    <div className="relative pointer-events-auto shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={handleToggle}
        aria-label="Insert blocks & media"
        title="Insert blocks & tools (Table, Checklist, Code, Image)"
        data-active={open || hasMedia || undefined}
        className={cx(
          "icon-btn cursor-pointer shrink-0 transition-all duration-150 ease-out",
          large ? "!size-8.5" : (compact ? "!size-6" : "!size-7"),
          open && "!bg-white/20 !text-white",
        )}
      >
        <Menu size={large ? 15 : (compact ? 12 : 13)} strokeWidth={1.8} />
      </button>

      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onPointerDown={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />

            <div
              style={{
                position: "fixed",
                left: menuPos.left,
                top: menuPos.top,
                zIndex: 9999,
                animation: "bubblePop 160ms cubic-bezier(0.16, 1, 0.3, 1) both",
              }}
              className="w-[210px] rounded-[15px] border border-white/20 bg-[#14151a]/95 p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl select-none flex flex-col gap-0.5"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                Insert blocks
              </div>
              <div className="h-px bg-white/[0.08] my-0.5" />

              {/* Table Option */}
              <button
                type="button"
                onClick={() => handleAction(onInsertTable)}
                className="flex h-8 w-full items-center justify-between rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <TableIcon size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
                  <span>Table</span>
                </div>
                <kbd className="font-mono text-[9.5px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  Ctrl+T
                </kbd>
              </button>

              {/* Task Checklist Option */}
              <button
                type="button"
                onClick={() => handleAction(onInsertTask)}
                className="flex h-8 w-full items-center justify-between rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ListChecks size={14} strokeWidth={1.8} className="shrink-0 text-white/70" />
                  <span>Checklist</span>
                </div>
                <kbd className="font-mono text-[9.5px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  - [ ]
                </kbd>
              </button>

              {/* Code Block Option */}
              <button
                type="button"
                onClick={() => handleAction(onInsertCode)}
                className="flex h-8 w-full items-center justify-between rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Code size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
                  <span>Code block</span>
                </div>
                <kbd className="font-mono text-[9.5px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  ```
                </kbd>
              </button>

              {/* Attach Image Option */}
              <button
                type="button"
                onClick={() => handleAction(onAttachImage)}
                className="flex h-8 w-full items-center justify-between rounded-[8px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
                  <span>Attach image</span>
                </div>
                <kbd className="font-mono text-[9.5px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  Ctrl+V
                </kbd>
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
