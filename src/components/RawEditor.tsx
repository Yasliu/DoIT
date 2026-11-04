import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ContentItem } from "../api/tauriBridge";
import { contentToMarkdown, markdownToContent } from "../lib/format";
import { uid } from "../lib/text";

interface RawEditorProps {
  content: ContentItem[];
  onChange: (content: ContentItem[]) => void;
  className?: string;
  minHeight?: number;
  onArrowUpAtStart?: () => void;
}

/** Text Mode: the file exactly as stored (raw markdown source in a monospace area, no rendering). */
export function RawEditor({ content, onChange, className = "", minHeight = 240, onArrowUpAtStart }: RawEditorProps) {
  const value = contentToMarkdown(content);
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Adopt outside changes (undo / redo) but never normalise what the user is typing
  useEffect(() => {
    const normalised = contentToMarkdown(markdownToContent(text, [], () => "x"));
    if (normalised !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [text, minHeight]);

  return (
    <textarea
      ref={ref}
      value={text}
      spellCheck={false}
      onChange={(e) => {
        setText(e.target.value);
        onChange(markdownToContent(e.target.value, content, () => uid("line")));
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" && ref.current && ref.current.selectionStart === 0 && ref.current.selectionEnd === 0) {
          if (onArrowUpAtStart) {
            e.preventDefault();
            onArrowUpAtStart();
          }
        }
      }}
      placeholder="Plain text..."
      className={`block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent font-mono leading-relaxed text-ink-2 outline-none select-text placeholder:text-ink-4 ${className}`}
      style={{ minHeight }}
    />
  );
}
