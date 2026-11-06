import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Code,
  FileText,
  Highlighter,
  Image as ImageIcon,
  Link2,
  ListChecks,
  ListOrdered,
  Menu,
  Quote,
  Smile,
  Strikethrough,
  Subscript,
  Superscript,
  Table as TableIcon,
} from "lucide-react";
import { cx } from "../lib/text";
import { QUICK_EMOJIS } from "../lib/emoji";

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
  onInsertEmoji: (emoji: string) => void;
  hasMedia?: boolean;
  large?: boolean;
  compact?: boolean;
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
  onInsertEmoji,
  hasMedia = false,
  large = false,
  compact = false,
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
                maxHeight: `${menuPos.maxHeight}px`,
                zIndex: 9999,
                animation: "bubblePop 160ms cubic-bezier(0.16, 1, 0.3, 1) both",
              }}
              className="w-[240px] rounded-[15px] border border-white/20 bg-[#14151a]/95 p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl select-none flex flex-col gap-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <TableIcon size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ListChecks size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ListOrdered size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Quote size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Code size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <BookOpen size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Code size={13} strokeWidth={1.8} className="shrink-0 text-pink-300/80" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Link2 size={13.5} strokeWidth={1.8} className="shrink-0 text-blue-400" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Strikethrough size={13.5} strokeWidth={1.8} className="shrink-0 text-white/70" />
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
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Highlighter size={13.5} strokeWidth={1.8} className="shrink-0 text-yellow-300" />
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
                  className="flex h-7.5 items-center justify-between rounded-[7px] px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  title="Subscript (H~2~O)"
                >
                  <div className="flex items-center gap-1.5">
                    <Subscript size={13} strokeWidth={1.8} className="shrink-0 text-white/70" />
                    <span>Sub (~2~)</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(onInsertSuperscript)}
                  className="flex h-7.5 items-center justify-between rounded-[7px] px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  title="Superscript (x^2^)"
                >
                  <div className="flex items-center gap-1.5">
                    <Superscript size={13} strokeWidth={1.8} className="shrink-0 text-white/70" />
                    <span>Super (^2^)</span>
                  </div>
                </button>
              </div>

              {/* Footnote */}
              <button
                type="button"
                onClick={() => handleAction(onInsertFootnote)}
                className="flex h-7.5 w-full items-center justify-between rounded-[7px] px-2 text-[12px] text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText size={13.5} strokeWidth={1.8} className="shrink-0 text-indigo-300" />
                  <span>Footnote</span>
                </div>
                <kbd className="font-mono text-[9px] text-ink-4 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded">
                  [^1]
                </kbd>
              </button>

              <div className="h-px bg-white/[0.08] my-1" />

              {/* SECTION: Quick Emojis */}
              <div className="px-2 pt-1 pb-1">
                <div className="flex items-center gap-1 mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                  <Smile size={11} strokeWidth={1.8} />
                  <span>Quick Emojis (:name:)</span>
                </div>
                <div className="grid grid-cols-8 gap-1 pt-0.5">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleAction(() => onInsertEmoji(emoji))}
                      className="size-6 grid place-items-center rounded text-[13px] hover:bg-white/[0.12] hover:scale-115 transition-transform cursor-pointer"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
