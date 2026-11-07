import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Bookmark,
  Code,
  Highlighter,
  Image as ImageIcon,
  Link2,
  ListChecks,
  ListOrdered,
  Menu,
  Quote,
  Strikethrough,
  Subscript,
  Superscript,
  Table as TableIcon,
  Terminal,
} from "lucide-react";
import { cx } from "../lib/text";

interface InsertMenuProps {
  editorRef?: React.RefObject<HTMLElement | null>;
  onInsertTable: () => void;
  onInsertTask: () => void;
  onInsertOrderedList: () => void;
  onInsertBlockquote: () => void;
  onInsertCode: () => void;
  onInsertDefinitionList: () => void;
  onAttachImage: () => void;
  onInsertInlineCode: () => void;
  onInsertLink: () => void;
  onInsertFootnote: () => void;
  onInsertStrikethrough: () => void;
  onInsertHighlight: () => void;
  onInsertSubscript: () => void;
  onInsertSuperscript: () => void;
  hasMedia?: boolean;
  large?: boolean;
  compact?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function InsertMenu({
  editorRef,
  onInsertTable,
  onInsertTask,
  onInsertOrderedList,
  onInsertBlockquote,
  onInsertCode,
  onInsertDefinitionList,
  onAttachImage,
  onInsertInlineCode,
  onInsertLink,
  onInsertFootnote,
  onInsertStrikethrough,
  onInsertHighlight,
  onInsertSubscript,
  onInsertSuperscript,
  hasMedia = false,
  large = false,
  compact = false,
  onOpenChange,
}: InsertMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; maxHeight: number }>({
    left: 0,
    top: 0,
    maxHeight: 380,
  });

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const w = 240;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const maxHeight = Math.min(380, window.innerHeight - 24);
    const fitsBelow = r.bottom + maxHeight + 8 <= window.innerHeight;
    const top = fitsBelow ? r.bottom + 4 : Math.max(8, r.top - maxHeight - 4);
    setMenuPos({ left, top, maxHeight });
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
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
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
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
    closeMenu();
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
        aria-label="Insert blocks & formatting"
        title="Insert blocks, lists & markdown formatting"
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
                closeMenu();
              }}
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
              }}
            />

            <div
              style={{
                position: "fixed",
                left: menuPos.left,
                top: menuPos.top,
                maxHeight: `${menuPos.maxHeight}px`,
                zIndex: 9999,
                animation: "bubblePop 160ms cubic-bezier(0.16, 1, 0.3, 1) both",
              }}
              className="w-[240px] rounded-[15px] border border-white/15 bg-[#121317]/95 p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl select-none flex flex-col gap-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* SECTION: Blocks & Structure */}
              <div className="px-2.5 pt-1.5 pb-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                Blocks & Structure
              </div>

              {/* Table */}
              <button
                type="button"
                onClick={() => handleAction(onInsertTable)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <TableIcon size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Table</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  Ctrl+T
                </kbd>
              </button>

              {/* Task Checklist */}
              <button
                type="button"
                onClick={() => handleAction(onInsertTask)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ListChecks size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Checklist</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  Ctrl+L
                </kbd>
              </button>

              {/* Ordered List */}
              <button
                type="button"
                onClick={() => handleAction(onInsertOrderedList)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ListOrdered size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Numbered list</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  1.
                </kbd>
              </button>

              {/* Blockquote */}
              <button
                type="button"
                onClick={() => handleAction(onInsertBlockquote)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Quote size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Blockquote</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  &gt;
                </kbd>
              </button>

              {/* Fenced Code Block */}
              <button
                type="button"
                onClick={() => handleAction(onInsertCode)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Terminal size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Code block</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  ```
                </kbd>
              </button>

              {/* Definition List */}
              <button
                type="button"
                onClick={() => handleAction(onInsertDefinitionList)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <BookOpen size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Definition list</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  : def
                </kbd>
              </button>

              {/* Attach Image */}
              <button
                type="button"
                onClick={() => handleAction(onAttachImage)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Attach image</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  Ctrl+V
                </kbd>
              </button>

              <div className="h-px bg-white/[0.08] my-1" />

              {/* SECTION: Inline & Mark Formatting */}
              <div className="px-2.5 pt-1 pb-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                Text & Marks
              </div>

              {/* Inline Code */}
              <button
                type="button"
                onClick={() => handleAction(onInsertInlineCode)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Code size={13} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Inline code</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  `code`
                </kbd>
              </button>

              {/* Link */}
              <button
                type="button"
                onClick={() => handleAction(onInsertLink)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Link2 size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Link</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  Ctrl+K
                </kbd>
              </button>

              {/* Strikethrough */}
              <button
                type="button"
                onClick={() => handleAction(onInsertStrikethrough)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Strikethrough size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Strikethrough</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  ~~text~~
                </kbd>
              </button>

              {/* Highlight */}
              <button
                type="button"
                onClick={() => handleAction(onInsertHighlight)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Highlighter size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Highlight</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  ==word==
                </kbd>
              </button>

              {/* Subscript & Superscript Row */}
              <div className="grid grid-cols-2 gap-1 px-0.5">
                <button
                  type="button"
                  onClick={() => handleAction(onInsertSubscript)}
                  className="group flex h-7.5 items-center justify-between rounded-[7px] px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  title="Subscript (H~2~O)"
                >
                  <div className="flex items-center gap-1.5">
                    <Subscript size={13} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                    <span>Sub (~2~)</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(onInsertSuperscript)}
                  className="group flex h-7.5 items-center justify-between rounded-[7px] px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  title="Superscript (x^2^)"
                >
                  <div className="flex items-center gap-1.5">
                    <Superscript size={13} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                    <span>Super (^2^)</span>
                  </div>
                </button>
              </div>

              {/* Footnote */}
              <button
                type="button"
                onClick={() => handleAction(onInsertFootnote)}
                className="group flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Bookmark size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70 group-hover:text-white transition-colors" />
                  <span>Footnote</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  [^1]
                </kbd>
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
