import { useLayoutEffect, useRef } from "react";
import { htmlToMarkdown, inlineMarkdownToHtml } from "../lib/format";

interface TaskLineInputProps {
  value: string;
  onChange: (markdown: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  elRef?: (node: HTMLDivElement | null) => void;
}

/**
 * Single checklist line: wraps onto extra visual lines (still one item) and renders
 * **bold** / *italic* markdown as real formatting instead of raw asterisks.
 */
export function TaskLineInput({
  value,
  onChange,
  onKeyDown,
  onFocus,
  placeholder,
  className,
  style,
  ariaLabel,
  elRef,
}: TaskLineInputProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (htmlToMarkdown(el) !== value) el.innerHTML = inlineMarkdownToHtml(value);
  }, [value]);

  return (
    <div
      ref={(node) => {
        ref.current = node;
        elRef?.(node);
      }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      data-task-line="true"
      data-placeholder={placeholder}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onInput={() => {
        const el = ref.current;
        if (!el) return;
        const md = htmlToMarkdown(el);
        if (md === "") el.innerHTML = "";
        onChange(md.replace(/\n+/g, " "));
      }}
      onPaste={(e) => {
        const items = e.clipboardData?.items;
        if (items && Array.from(items).some((i) => i.type.startsWith("image/"))) return;
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\s*[\r\n]+\s*/g, " ");
        document.execCommand("insertText", false, text);
      }}
      className={`min-w-0 whitespace-pre-wrap break-words outline-none select-text empty:before:pointer-events-none empty:before:text-white/30 empty:before:content-[attr(data-placeholder)] ${className ?? ""}`}
      style={style}
    />
  );
}
