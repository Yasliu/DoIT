import type { PointerEvent as ReactPointerEvent } from "react";
import React, { useMemo, useState } from "react";
import { foldFigures, useFigureMounts } from "../figures";
import type { NoteItem } from "../../api/tauriBridge";
import { fontStack } from "../editor/fonts";
import { copyImageToClipboard, openExternalUrl, previewMarkup, previewText } from "../../lib/format";
import { cleanText, densityOf, relativeShort } from "../../lib/text";
import { Frame, Glyph } from "../ui";

interface NoteCardProps {
  note: NoteItem;
  pressed: boolean;
  dragging: boolean;
  landed: boolean;
  reorderTarget?: boolean;
  onOpen: (note: NoteItem, rect: DOMRect, maximize?: boolean) => void;
  onArm: (event: ReactPointerEvent, note: NoteItem) => void;
  onToggleItem: (note: NoteItem, itemId: string) => void;
  onContextMenu?: (event: React.MouseEvent, note: NoteItem) => void;
  /** Settles the note, or brings a settled one back. */
  onToggleSettled?: (note: NoteItem) => void;
}

const LINE = 19;
/**
 * Room a figure starting within the preview's lines gets on top of them: a callout or short list
 * fits whole. Past the first two, figures clip like long text instead of stretching the row.
 */
const FIGURE_ROOM = 96;
const MAX_FIGURE_ROOMS = 2;

function imagesOf(note: NoteItem): string[] {
  const raw = note.media_urls && note.media_urls.length > 0 ? note.media_urls : note.media_url ? [note.media_url] : [];
  return raw.filter((img) => typeof img === "string" && img.trim().length > 0);
}

/** A note on the canvas: its title on the frame's edge, the rendered note inside, tasks as a bar. */
function NoteCardComponent({ note, pressed, dragging, landed, reorderTarget, onOpen, onArm, onToggleItem, onContextMenu, onToggleSettled }: NoteCardProps) {
  const [copied, setCopied] = useState(false);
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  useFigureMounts(previewEl);
  const rawMode = note.format === "txt";
  const { density, shownFigures } = useMemo(() => {
    // A plain-text note shows figure blocks as the lines they are.
    if (rawMode) return { density: densityOf(note), shownFigures: 0 };
    const folded = foldFigures(note.content);
    const density = densityOf({ ...note, content: folded.content });
    const shown = folded.figures.filter((at) => at < density.lines).length;
    return { density, shownFigures: Math.min(shown, MAX_FIGURE_ROOMS) };
  }, [note, rawMode]);
  const empty = note.content.every((item) => item.text.trim().length === 0);
  const preview = useMemo(() => (rawMode ? null : previewMarkup(note.content)), [note.content, rawMode]);
  const total = note.content.filter((item) => item.is_todo).length;
  const done = note.content.filter((item) => item.is_todo && item.completed).length;
  const images = imagesOf(note);
  const maxHeight = density.lines * LINE + 6 + shownFigures * FIGURE_ROOM;
  const title = cleanText(note.title) || "untitled";

  return (
    <Frame
      as="article"
      role="button"
      tabIndex={0}
      aria-label={`Open note: ${title}`}
      data-note-id={note.id}
      data-weight={density.weight}
      data-pressed={pressed || undefined}
      data-dragging={dragging || undefined}
      data-landed={landed || undefined}
      data-target={reorderTarget || undefined}
      title={title}
      caps={false}
      meta={relativeShort(note.last_edited)}
      corners={!!note.is_pinned}
      corner="*"
      className="tm-card group"
      onPointerDown={(event: ReactPointerEvent) => onArm(event, note)}
      onContextMenu={(event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event, note);
      }}
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(note, event.currentTarget.getBoundingClientRect());
        }
      }}
    >
      {images.length > 0 && (
        <div className="mb-4 grid h-[120px] gap-[6px] overflow-hidden" style={{ gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, minmax(0, 1fr))` }}>
          {images.slice(0, 3).map((src, i) => (
            <div key={i} className="relative overflow-hidden outline outline-1 outline-[var(--graph-frame)]">
              <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
              {i === 2 && images.length > 3 && (
                <span className="absolute inset-0 grid place-items-center bg-background/75 text-[11px]">+{images.length - 2}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {empty ? (
          <p className="text-graph-muted">empty</p>
        ) : rawMode ? (
          <pre className="md-preview-raw" style={{ maxHeight }}>
            {previewText(note.content)}
          </pre>
        ) : (
          <div
            ref={setPreviewEl}
            className="md-preview"
            style={{ maxHeight, fontFamily: fontStack(note.font_family) }}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest(".md-cb, img.md-img")) event.stopPropagation();
            }}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              const img = target.closest("img.md-img") as HTMLImageElement | null;
              if (img) {
                event.stopPropagation();
                event.preventDefault();
                void copyImageToClipboard(img.src).then((ok) => {
                  if (!ok) return;
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                });
                return;
              }
              const link = target.closest("a.md-link") as HTMLAnchorElement | null;
              if (link) {
                event.stopPropagation();
                event.preventDefault();
                const href = link.getAttribute("href");
                if (href) openExternalUrl(href);
                return;
              }
              const cb = target.closest(".md-cb");
              if (!cb) return;
              event.stopPropagation();
              const boxes = Array.from(event.currentTarget.querySelectorAll(".md-cb"));
              const id = preview?.taskIds[boxes.indexOf(cb)];
              if (id) onToggleItem(note, id);
            }}
            dangerouslySetInnerHTML={{ __html: preview?.html ?? "" }}
          />
        )}

        <div className="mt-auto flex min-h-[26px] items-center gap-[1ch] pt-4 text-[12px] text-graph-muted">
          {total > 0 && (
            <span className="tabular-nums">
              {done}/{total} done
            </span>
          )}
          {copied && <span className="text-graph-accent">image copied</span>}
          <span className="tm-card-actions ml-auto flex items-center" onPointerDown={(e) => e.stopPropagation()}>
            {onToggleSettled && !note.source_path && (
              <Glyph
                size="sm"
                label={note.is_settled ? "Bring back to its shelf" : "Settle: put away, search still finds it"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSettled(note);
                }}
              >
                {note.is_settled ? "↺" : "✓"}
              </Glyph>
            )}
            <Glyph
              size="sm"
              label="Open full size"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(note, e.currentTarget.getBoundingClientRect(), true);
              }}
            >
              ⤢
            </Glyph>
          </span>
        </div>
      </div>
    </Frame>
  );
}

export const NoteCard = React.memo(NoteCardComponent);
