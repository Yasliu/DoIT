import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ContentItem } from "../../api/tauriBridge";
import { contentToMarkdown, markdownToContent } from "../../lib/format";
import { uid } from "../../lib/text";

interface RawEditorProps {
  content: ContentItem[];
  onChange: (content: ContentItem[]) => void;
  className?: string;
  minHeight?: number;
  onArrowUpAtStart?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

function scrollTextareaCaretIntoView(el: HTMLTextAreaElement): void {
  const scrollParent = el.closest(".overflow-y-auto, .overflow-y-scroll") as HTMLElement | null;
  if (!scrollParent) return;

  const cs = getComputedStyle(el);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.width = `${el.clientWidth}px`;
  mirror.style.font = cs.font;
  mirror.style.fontFamily = cs.fontFamily;
  mirror.style.fontSize = cs.fontSize;
  mirror.style.fontWeight = cs.fontWeight;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.padding = cs.padding;
  mirror.style.border = cs.border;
  mirror.style.boxSizing = cs.boxSizing;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordBreak = "break-word";

  const pos = el.selectionEnd ?? el.value.length;
  mirror.textContent = el.value.slice(0, pos);
  const marker = document.createElement("span");
  marker.textContent = "\u200B";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20;
  const caretTopInTextarea = marker.offsetTop;
  mirror.remove();

  const elRect = el.getBoundingClientRect();
  const containerRect = scrollParent.getBoundingClientRect();
  const zoomHost = el.closest("[style*='zoom']") as HTMLElement | null;
  const zoomPct = zoomHost ? parseFloat(zoomHost.style.zoom) : NaN;
  const zoomScale = Number.isFinite(zoomPct) && zoomPct > 0 ? zoomPct / 100 : 1;

  const caretTop = elRect.top + caretTopInTextarea * zoomScale;
  const caretBottom = caretTop + lineH * zoomScale;
  const bottomMargin = 44;
  const topMargin = 24;

  if (caretBottom > containerRect.bottom - bottomMargin) {
    scrollParent.scrollTop += caretBottom - (containerRect.bottom - bottomMargin);
  } else if (caretTop < containerRect.top + topMargin) {
    scrollParent.scrollTop -= (containerRect.top + topMargin) - caretTop;
  }
}

/** Text Mode: the file exactly as stored (raw markdown source in a monospace area, no rendering). */
export function RawEditor({ content, onChange, className = "", minHeight = 240, onArrowUpAtStart, textareaRef }: RawEditorProps) {
  const value = contentToMarkdown(content);
  const [text, setText] = useState(value);
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = textareaRef || internalRef;

  // Adopt outside changes (undo / redo) but never normalise what the user is typing
  useEffect(() => {
    const normalised = contentToMarkdown(markdownToContent(text, [], () => "x"));
    if (normalised !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scrollParent = el.closest(".overflow-y-auto, .overflow-y-scroll") as HTMLElement | null;
    const prevScrollTop = scrollParent?.scrollTop ?? 0;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
    if (scrollParent && scrollParent.scrollTop !== prevScrollTop) {
      scrollParent.scrollTop = prevScrollTop;
    }
    if (document.activeElement === el) {
      scrollTextareaCaretIntoView(el);
    }
  }, [text, minHeight]);

  return (
    <textarea
      ref={ref}
      value={text}
      spellCheck={false}
      onChange={(e) => {
        setText(e.target.value);
        onChange(markdownToContent(e.target.value, content, () => uid("line")));
        const target = e.currentTarget;
        requestAnimationFrame(() => scrollTextareaCaretIntoView(target));
      }}
      onKeyDown={(e) => {
        if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const el = ref.current;
          if (!el) return;
          const start = el.selectionStart ?? 0;
          const end = el.selectionEnd ?? start;
          const step = "    ";

          if (!e.shiftKey && !text.slice(start, end).includes("\n")) {
            const next = text.slice(0, start) + step + text.slice(end);
            const nextPos = start + step.length;
            setText(next);
            onChange(markdownToContent(next, content, () => uid("line")));
            requestAnimationFrame(() => {
              el.setSelectionRange(nextPos, nextPos);
              scrollTextareaCaretIntoView(el);
            });
            return;
          }

          const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
          const afterEnd = text.indexOf("\n", end);
          const lineEnd = afterEnd === -1 ? text.length : afterEnd;
          const split = text.slice(lineStart, lineEnd).split("\n");
          let firstDelta = 0;
          let totalDelta = 0;
          const transformed = split.map((line, idx) => {
            if (!e.shiftKey) {
              if (idx === 0) firstDelta = step.length;
              totalDelta += step.length;
              return step + line;
            }
            const stripped = line.replace(/^(?:\t| {1,4})/, "");
            const removed = line.length - stripped.length;
            if (idx === 0) firstDelta = -removed;
            totalDelta -= removed;
            return stripped;
          });
          if (totalDelta === 0) return;
          const next = text.slice(0, lineStart) + transformed.join("\n") + text.slice(lineEnd);
          const newStart = start === end
            ? Math.max(lineStart, Math.min(next.length, start + firstDelta))
            : Math.max(lineStart, start + (start > lineStart ? firstDelta : 0));
          const newEnd = start === end ? newStart : Math.max(newStart, Math.min(next.length, end + totalDelta));
          setText(next);
          onChange(markdownToContent(next, content, () => uid("line")));
          requestAnimationFrame(() => {
            el.setSelectionRange(newStart, newEnd);
            scrollTextareaCaretIntoView(el);
          });
          return;
        }
        if (e.key === "ArrowUp" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && ref.current && ref.current.selectionStart === 0 && ref.current.selectionEnd === 0) {
          if (onArrowUpAtStart) {
            e.preventDefault();
            onArrowUpAtStart();
            return;
          }
        }
        if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
          const target = ref.current;
          if (target) requestAnimationFrame(() => scrollTextareaCaretIntoView(target));
        }
      }}
      placeholder="plain text…"
      className={`block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent font-mono leading-relaxed text-foreground caret-[var(--graph-accent)] outline-none select-text ${className}`}
      style={{ minHeight }}
    />
  );
}
