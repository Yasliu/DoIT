import { useEffect, useMemo, useRef, useState } from "react";
import { tauriApi, type NoteItem } from "../../api/tauriBridge";
import { NOTE_FONTS, fontStack, isMonoFont } from "./fonts";
import {
  applyBlockquote,
  applyDefinitionList,
  applyFootnote,
  applyHeading,
  applyHighlight,
  applyInlineCode,
  applyLink,
  applyOrderedList,
  applyStrikethrough,
  applySubscript,
  applySuperscript,
  applyTask,
  getHeadingLevel,
  insertCodeBlockAtCaret,
  insertFigureAtCaret,
  insertTableAtCaret,
} from "../../lib/format";
import { FIGURES } from "../figures";
import { cn } from "@/lib/utils";
import { Field, Glyph, Kbd, Menu, type MenuItem } from "../ui";
import { hasGallery } from "./NoteGallery";
import type { NoteEditor } from "../../editor/useNoteEditor";
import type { Zoom } from "./useZoom";

interface ToolbarProps {
  editor: NoteEditor;
  note: NoteItem;
  /** Switches MD (rendered, .md) and Text (raw source, .txt). */
  onMode: (raw: boolean) => void;
  onFont: (font: string) => void;
  zoom: Zoom;
  /** The dock's narrower layout. */
  compact?: boolean;
}

type Open = null | "font" | "heading" | "insert" | "figure";

const HEADINGS = [
  { level: 0, label: "text", short: "¶" },
  { level: 1, label: "# heading 1", short: "h1" },
  { level: 2, label: "## heading 2", short: "h2" },
  { level: 3, label: "### heading 3", short: "h3" },
];

/** Tracks the heading level of the line holding the caret. */
function useHeadingLevel(body: React.RefObject<HTMLElement | null>) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const update = () => {
      const ed = body.current;
      const sel = window.getSelection();
      if (!ed || !sel?.anchorNode || !ed.contains(sel.anchorNode)) return;
      setLevel(getHeadingLevel(ed));
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [body]);
  return [level, setLevel] as const;
}

/**
 * The formatting line above a note, shared by the canvas sheet and the dock panel:
 * `md|txt  font  B I  ¶  +  ☺  − 100% +`. Every control keeps the editor's caret.
 */
export function Toolbar({ editor, note, onMode, onFont, zoom, compact = false }: ToolbarProps) {
  const rawMode = editor.rawMode;
  const [open, setOpen] = useState<Open>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [level, setLevel] = useHeadingLevel(editor.bodyRef);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontQuery, setFontQuery] = useState("");
  const savedRange = useRef<Range | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open !== "font" || systemFonts.length) return;
    void tauriApi.getSystemFonts().then((fonts) => setSystemFonts((fonts ?? []).filter(isMonoFont)));
  }, [open, systemFonts.length]);

  const toggle = (which: Exclude<Open, null>) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.bodyRef.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
    setAnchor(e.currentTarget.getBoundingClientRect());
    setOpen((cur) => (cur === which ? null : which));
    if (which !== "font") editor.closeEmojiPicker();
  };

  const restoreCaret = () => {
    const ed = editor.bodyRef.current;
    if (!ed) return;
    ed.focus();
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      try {
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
      } catch {
        /* the line it pointed into is gone */
      }
    }
  };
  const act = (command: (ed: HTMLElement) => void) => () => {
    restoreCaret();
    editor.run(command);
  };

  const fontItems = useMemo<MenuItem[]>(() => {
    const q = fontQuery.trim().toLowerCase();
    const current = (note.font_family || "Geist Mono").toLowerCase();
    const presets = NOTE_FONTS.map((font) => font.name);
    const names = [...presets, ...systemFonts.filter((name) => !presets.some((p) => p.toLowerCase() === name.toLowerCase()))];
    return names
      .filter((name) => !q || name.toLowerCase().includes(q))
      .map((name, i) => ({
        key: name,
        section: i === presets.length && !q ? " " : undefined,
        label: <span style={{ fontFamily: fontStack(name) }}>{name}</span>,
        glyph: name.toLowerCase() === current ? "•" : "",
        run: () => {
          onFont(name);
          if (editor.bodyRef.current) editor.bodyRef.current.style.fontFamily = fontStack(name);
          restoreCaret();
        },
      }));
  }, [fontQuery, systemFonts, note.font_family]);

  const insertItems: MenuItem[] = [
    { key: "table", glyph: "▦", label: "table", hint: <Kbd keys="Ctrl+T" />, run: act(insertTableAtCaret) },
    { key: "task", glyph: "☐", label: "checklist", hint: <Kbd keys="Ctrl+L" />, run: act(applyTask) },
    { key: "ol", glyph: "1.", label: "numbered list", hint: "1.", run: act(applyOrderedList) },
    { key: "quote", glyph: ">", label: "quote", hint: ">", run: act(applyBlockquote) },
    { key: "code", glyph: "`", label: "code block", hint: "```", run: act((ed) => insertCodeBlockAtCaret(ed)) },
    { key: "dl", glyph: ":", label: "definition", hint: ": def", run: act(applyDefinitionList) },
    { key: "image", glyph: "▣", label: "attach image", hint: hasGallery(note) ? "has images" : <Kbd keys="Ctrl+V" />, run: () => fileInput.current?.click() },
    { key: "icode", section: " ", glyph: "`", label: "inline code", hint: "`x`", run: act(applyInlineCode) },
    { key: "link", glyph: "↗", label: "link", hint: "[t](u)", run: act(applyLink) },
    { key: "del", glyph: "~", label: "strikethrough", hint: "~~x~~", run: act(applyStrikethrough) },
    { key: "mark", glyph: "=", label: "highlight", hint: "==x==", run: act(applyHighlight) },
    { key: "sub", glyph: "₂", label: "subscript", hint: "~2~", run: act(applySubscript) },
    { key: "sup", glyph: "²", label: "superscript", hint: "^2^", run: act(applySuperscript) },
    { key: "fn", glyph: "†", label: "footnote", hint: "[^1]", run: act(applyFootnote) },
  ];

  const figureItems: MenuItem[] = FIGURES.map((figure) => ({
    key: figure.tag,
    glyph: figure.glyph,
    label: figure.label,
    run: act((ed) => insertFigureAtCaret(ed, figure.template)),
  }));

  const headingItems: MenuItem[] = HEADINGS.map((h) => ({
    key: String(h.level),
    glyph: h.level === level ? "•" : "",
    label: <span className={h.level ? "font-bold" : undefined}>{h.label}</span>,
    run: () => {
      restoreCaret();
      editor.run((ed) => applyHeading(ed, h.level));
      setLevel(h.level);
    },
  }));

  const keep = (e: React.MouseEvent) => e.preventDefault();
  const sep = <span aria-hidden="true" className="px-[0.5ch] text-graph-faint">│</span>;

  return (
    <div className={cn("flex min-w-0 items-center overflow-x-auto [scrollbar-width:none]", compact ? "gap-0" : "gap-[0.5ch]")}>
      <div role="group" aria-label="Editor mode" className="flex shrink-0 items-center">
        {(["md", "txt"] as const).map((mode) => {
          const on = (mode === "txt") === rawMode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={on}
              onMouseDown={keep}
              onClick={() => onMode(mode === "txt")}
              title={mode === "md" ? "MD: rendered Markdown, saved as .md" : "TXT: the raw source, saved as .txt"}
              className={cn("h-6 px-[1ch] text-[11px] uppercase tracking-[0.08em] transition-colors", on ? "bg-invert text-background" : "text-graph-muted hover:text-foreground")}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {!rawMode && (
        <>
          {sep}
          <button
            type="button"
            onMouseDown={keep}
            onClick={toggle("font")}
            aria-expanded={open === "font"}
            title={`Note typeface: ${note.font_family || "Geist Mono"}`}
            className="flex h-6 shrink-0 items-center gap-[0.5ch] px-[1ch] text-[12px] text-graph-muted hover:bg-hover hover:text-foreground"
          >
            Aa
            {!compact && <span className="max-w-[12ch] truncate">{(note.font_family || "geist mono").toLowerCase()}</span>}
            <span className="text-graph-frame">▾</span>
          </button>
          {sep}
          <Glyph label="Bold (Ctrl+B)" size="sm" on={editor.bold} onMouseDown={keep} onClick={() => editor.format("bold")} className="font-bold">
            B
          </Glyph>
          <Glyph label="Italic (Ctrl+I)" size="sm" on={editor.italic} onMouseDown={keep} onClick={() => editor.format("italic")} className="italic">
            I
          </Glyph>
          <button
            type="button"
            onMouseDown={keep}
            onClick={toggle("heading")}
            aria-expanded={open === "heading"}
            title="Text style"
            className="flex h-6 shrink-0 items-center gap-[0.5ch] px-[1ch] text-[12px] text-graph-muted hover:bg-hover hover:text-foreground"
          >
            {HEADINGS[level]?.short ?? "¶"}
            <span className="text-graph-frame">▾</span>
          </button>
          <Glyph label="Insert blocks and marks" size="sm" on={open === "insert"} onMouseDown={keep} onClick={toggle("insert")}>
            +
          </Glyph>
          <Glyph label="Insert a figure" size="sm" on={open === "figure"} onMouseDown={keep} onClick={toggle("figure")}>
            ◫
          </Glyph>
          <Glyph
            label="Emoji (:name:)"
            size="sm"
            on={Boolean(editor.emojiAnchor)}
            onMouseDown={keep}
            onClick={(e) => {
              setOpen(null);
              editor.toggleEmojiPicker(e.currentTarget.getBoundingClientRect());
            }}
          >
            ☺
          </Glyph>
        </>
      )}

      {sep}
      <div className="flex shrink-0 items-center" title="Zoom: Ctrl + and Ctrl −, Ctrl 0 resets">
        <Glyph label="Zoom out (Ctrl −)" size="sm" onMouseDown={keep} onClick={() => zoom.adjust(-10)}>
          −
        </Glyph>
        <button type="button" onMouseDown={keep} onClick={zoom.reset} title="Reset zoom (Ctrl 0)" className="w-[5ch] text-center text-[11px] tabular-nums text-graph-muted hover:text-foreground">
          {zoom.value}%
        </button>
        <Glyph label="Zoom in (Ctrl +)" size="sm" onMouseDown={keep} onClick={() => zoom.adjust(10)}>
          +
        </Glyph>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) editor.insertImages(Array.from(files), "Attached Image");
          e.target.value = "";
        }}
      />

      {open && anchor && (
        <Menu
          at={anchor}
          width={open === "font" ? 280 : 260}
          onClose={() => {
            setOpen(null);
            setFontQuery("");
          }}
          items={open === "font" ? fontItems : open === "heading" ? headingItems : open === "figure" ? figureItems : insertItems}
          activeKey={open === "heading" ? String(level) : undefined}
          header={
            open === "font" ? (
              <div className="px-[1.5ch] pb-2">
                <Field autoFocus value={fontQuery} onChange={(e) => setFontQuery(e.target.value)} placeholder="search mono fonts" prompt="/" />
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
