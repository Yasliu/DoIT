import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { EMOJI_MAP } from "../lib/emoji";
import { cx } from "../lib/text";

interface EmojiAutocompleteProps {
  editorRef: React.RefObject<HTMLElement | null>;
  onEmojiInserted?: () => void;
}

interface EmojiMatch {
  name: string;
  emoji: string;
}

export function EmojiAutocomplete({ editorRef, onEmojiInserted }: EmojiAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [matches, setMatches] = useState<EmojiMatch[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeTokenRef = useRef<{ textNode: Text; startOffset: number; endOffset: number; query: string } | null>(null);

  const checkCaret = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !editor.contains(sel.anchorNode)) {
      setIsOpen(false);
      return;
    }

    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      setIsOpen(false);
      return;
    }

    const textNode = node as Text;
    const textBeforeCaret = textNode.data.slice(0, sel.anchorOffset);

    // Look for :word directly preceding caret, e.g. ":s", ":fir", ":+1"
    const match = textBeforeCaret.match(/:([a-zA-Z0-9_+-]{1,16})$/);
    if (!match) {
      setIsOpen(false);
      return;
    }

    const query = match[1].toLowerCase();
    const startOffset = sel.anchorOffset - match[0].length;
    const endOffset = sel.anchorOffset;

    // Filter EMOJI_MAP: max 6 matches
    const starts: EmojiMatch[] = [];
    const includes: EmojiMatch[] = [];

    for (const [name, emoji] of Object.entries(EMOJI_MAP)) {
      const lower = name.toLowerCase();
      if (lower.startsWith(query)) {
        starts.push({ name, emoji });
      } else if (lower.includes(query)) {
        includes.push({ name, emoji });
      }
    }

    const results = [...starts, ...includes].slice(0, 6);
    if (results.length === 0) {
      setIsOpen(false);
      return;
    }

    activeTokenRef.current = { textNode, startOffset, endOffset, query };
    setMatches(results);
    setSelectedIndex(0);

    // Get screen coordinates of the match
    try {
      const r = document.createRange();
      r.setStart(textNode, startOffset);
      r.setEnd(textNode, endOffset);
      const rect = r.getBoundingClientRect();
      const x = Math.max(8, Math.min(rect.left, window.innerWidth - 210));
      const fitsBelow = rect.bottom + 210 <= window.innerHeight;
      const y = fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - 216);
      setCoords({ x, y });
      setIsOpen(true);
    } catch {
      setIsOpen(false);
    }
  }, [editorRef]);

  const insertEmoji = useCallback((item: EmojiMatch) => {
    const token = activeTokenRef.current;
    if (!token) return;

    const { textNode, startOffset, endOffset } = token;
    const full = textNode.data;
    const before = full.slice(0, startOffset);
    const after = full.slice(endOffset);

    textNode.data = before + item.emoji + " " + after;

    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      const newPos = startOffset + item.emoji.length + 1;
      r.setStart(textNode, Math.min(newPos, textNode.data.length));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }

    setIsOpen(false);
    activeTokenRef.current = null;
    onEmojiInserted?.();
  }, [onEmojiInserted]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleInput = () => checkCaret();
    const handleKeyUp = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "Backspace"].includes(e.key)) {
        checkCaret();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || matches.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % matches.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + matches.length) % matches.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        insertEmoji(matches[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    editor.addEventListener("input", handleInput);
    editor.addEventListener("keyup", handleKeyUp);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      editor.removeEventListener("input", handleInput);
      editor.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [editorRef, isOpen, matches, selectedIndex, checkCaret, insertEmoji]);

  if (!isOpen || matches.length === 0) return null;

  return createPortal(
    <div
      className="fixed z-[99999] w-[190px] rounded-[13px] border border-white/15 bg-[#121317]/95 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.92)] backdrop-blur-2xl select-none flex flex-col gap-0.5 animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: coords.x, top: coords.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-0.5 text-[9.5px] font-mono uppercase tracking-[0.12em] text-white/35 flex items-center justify-between border-b border-white/[0.06] mb-0.5">
        <span>Emojis</span>
        <span className="text-[8.5px] text-white/25">Tab / Enter</span>
      </div>
      {matches.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <button
            key={item.name}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              insertEmoji(item);
            }}
            onMouseEnter={() => setSelectedIndex(idx)}
            className={cx(
              "flex h-7 w-full items-center gap-2 rounded-[7px] px-2 text-[12px] text-left transition-colors cursor-pointer",
              isSelected
                ? "bg-white/[0.12] text-white font-medium"
                : "text-ink-2 hover:bg-white/[0.06] hover:text-white"
            )}
          >
            <span className="text-[14px] leading-none shrink-0">{item.emoji}</span>
            <span className="truncate font-mono text-[11px] text-ink-3">:{item.name}:</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}
