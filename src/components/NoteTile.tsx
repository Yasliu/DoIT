import type { PointerEvent as ReactPointerEvent } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { NoteItem } from "../api/tauriBridge";
import { fontStack } from "../api/tauriBridge";
import { accentFor, cleanText, cx, densityOf, edgeOpacity, relativeShort, stripDate } from "../lib/text";
import { contentToMarkdown, previewMarkup } from "../lib/format";

interface NoteTileProps {
  note: NoteItem;
  shelves: string[];
  pressed: boolean;
  dragging: boolean;
  landed: boolean;
  reorderTarget?: boolean;
  onOpen: (note: NoteItem, rect: DOMRect) => void;
  onArm: (event: ReactPointerEvent, note: NoteItem) => void;
  onToggleItem: (note: NoteItem, itemId: string) => void;
  onContextMenu?: (event: React.MouseEvent, note: NoteItem) => void;
}

export function NoteTile({
  note,
  shelves,
  pressed,
  dragging,
  landed,
  reorderTarget,
  onOpen,
  onArm,
  onToggleItem,
  onContextMenu,
}: NoteTileProps) {
  const [hovered, setHovered] = useState(false);
  const density = densityOf(note);
  const accent = accentFor(note.category, shelves);

  // Subtle, soft organic lift (eliminated harsh bubble bounce)
  const transform = pressed && !dragging
    ? "translate3d(0, 0, 0) scale(0.995)"
    : hovered && !dragging
      ? "translate3d(0, -1.5px, 0)"
      : "none";

  const rawMode = note.format === "txt";
  const empty = note.content.every((item) => item.text.trim().length === 0);
  const preview = useMemo(() => (rawMode ? null : previewMarkup(note.content)), [note.content, rawMode]);
  const previewRef = useRef<HTMLElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const previewMax = Math.max(40, density.lines * 34);
  useLayoutEffect(() => {
    const el = previewRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 2);
  }, [note.content, rawMode, previewMax]);
  const fadeStyle: React.CSSProperties = overflowing
    ? {
        WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)",
        maskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)",
      }
    : {};
  const total = note.content.filter((item) => item.is_todo).length;
  const done = note.content.filter((item) => item.is_todo && item.completed).length;

  return (
    <motion.article
      layout
      transition={{ type: "spring", stiffness: 180, damping: 25, mass: 0.8 }}
      role="button"
      tabIndex={0}
      aria-label={`Open note: ${cleanText(note.title) || "Untitled"}`}
      data-note-id={note.id}
      data-dragging={dragging || undefined}
      onPointerDown={(event) => onArm(event, note)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event, note);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(note, event.currentTarget.getBoundingClientRect());
        }
      }}
      style={{
        minHeight: density.minHeight,
        transform,
      }}
      className={cx(
        "card group relative flex flex-col h-full p-[17px] text-left outline-none",
        density.span,
        landed && "landed",
        reorderTarget && "ring-1 ring-white/50 !bg-white/[0.09] scale-[1.01] !shadow-[0_0_20px_rgba(255,255,255,0.12)]",
      )}
    >
      <span
        className="strip"
        style={{ backgroundColor: accent, opacity: edgeOpacity(note.last_edited) }}
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute bottom-0 left-[2px] top-0 flex w-[18px] items-center justify-center overflow-hidden z-10">
        <span className="strip-label font-mono text-white/90">{stripDate(note.last_edited)}</span>
      </span>

      {(() => {
        const rawImages = (note.media_urls && note.media_urls.length > 0)
          ? note.media_urls
          : (note.media_url ? [note.media_url] : []);
        const images = rawImages.filter((img) => img && typeof img === "string" && img.trim().length > 0);
        if (images.length === 0) return null;

        if (images.length === 1) {
          return (
            <div className="relative mb-3.5 h-[135px] w-full overflow-hidden rounded-[12px] bg-black/40 border border-white/[0.08] shadow-sm">
              <img
                src={images[0]}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover opacity-95 group-hover:scale-[1.02] transition-transform duration-300"
                onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }}
              />
            </div>
          );
        }

        if (images.length === 2) {
          return (
            <div className="relative mb-3.5 grid grid-cols-2 gap-1.5 h-[135px] w-full overflow-hidden rounded-[12px]">
              {images.map((img, i) => (
                <div key={i} className="h-full w-full overflow-hidden rounded-[8px] bg-black/40 border border-white/[0.08]">
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover opacity-95 group-hover:scale-[1.02] transition-transform duration-300"
                    onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }}
                  />
                </div>
              ))}
            </div>
          );
        }

        if (images.length === 3) {
          return (
            <div className="relative mb-3.5 grid grid-cols-2 gap-1.5 h-[135px] w-full overflow-hidden rounded-[12px]">
              <div className="h-full w-full overflow-hidden rounded-[8px] bg-black/40 border border-white/[0.08]">
                <img
                  src={images[0]}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover opacity-95 group-hover:scale-[1.02] transition-transform duration-300"
                  onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }}
                />
              </div>
              <div className="grid grid-rows-2 gap-1.5 h-full w-full">
                <div className="h-full w-full overflow-hidden rounded-[8px] bg-black/40 border border-white/[0.08]">
                  <img
                    src={images[1]}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover opacity-95 group-hover:scale-[1.02] transition-transform duration-300"
                    onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }}
                  />
                </div>
                <div className="h-full w-full overflow-hidden rounded-[8px] bg-black/40 border border-white/[0.08]">
                  <img
                    src={images[2]}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover opacity-95 group-hover:scale-[1.02] transition-transform duration-300"
                    onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }}
                  />
                </div>
              </div>
            </div>
          );
        }

        // 4 or more images: 2x2 Bento grid with +N counter on the 4th item
        return (
          <div className="relative mb-3.5 grid grid-cols-2 gap-1.5 h-[135px] w-full overflow-hidden rounded-[12px]">
            {images.slice(0, 4).map((img, i) => (
              <div key={i} className="relative h-[64px] w-full overflow-hidden rounded-[8px] bg-black/40 border border-white/[0.08]">
                <img
                  src={img}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover opacity-95 group-hover:scale-[1.02] transition-transform duration-300"
                  onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }}
                />
                {i === 3 && images.length > 4 && (
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex items-center justify-center font-mono text-[10.5px] font-semibold text-white/95">
                    +{images.length - 3}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      <div className="flex min-w-0 items-start gap-2">
        {note.is_pinned && (
          <span
            className="mt-[8px] size-[4px] shrink-0 rounded-full bg-white/85"
            aria-label="Pinned"
          />
        )}
        <h3
          className={cx(
            "min-w-0 flex-1 tracking-[-0.014em] text-ink-1",
            density.weight === "square" ? "text-[14px]" : "text-[15px]",
          )}
          style={{
            fontWeight: 560,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: "22px",
            maxHeight: 44,
          }}
        >
          {cleanText(note.title) || "Untitled"}
        </h3>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {empty ? (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-4">Open to start writing.</p>
        ) : rawMode ? (
          /* Text Mode note: the file exactly as the user sees it when the tile is opened */
          <pre
            ref={previewRef as React.RefObject<HTMLPreElement>}
            className="md-preview-raw mt-2.5"
            style={{ maxHeight: previewMax, ...fadeStyle }}
          >
            {contentToMarkdown(note.content)}
          </pre>
        ) : (
          /* MD Mode note: the rendered document (headings, tables, tasks, images) */
          <div
            ref={previewRef as React.RefObject<HTMLDivElement>}
            className="md-preview mt-2.5"
            style={{ maxHeight: previewMax, fontFamily: fontStack(note.font_family), ...fadeStyle }}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest(".md-cb")) event.stopPropagation();
            }}
            onClick={(event) => {
              const cb = (event.target as HTMLElement).closest(".md-cb");
              if (!cb) return;
              event.stopPropagation();
              const boxes = Array.from(event.currentTarget.querySelectorAll(".md-cb"));
              const id = preview?.taskIds[boxes.indexOf(cb)];
              if (id) onToggleItem(note, id);
            }}
            dangerouslySetInnerHTML={{ __html: preview?.html ?? "" }}
          />
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-4">
            {total > 0
              ? `${done}/${total} done`
              : `${note.content.length} line${note.content.length === 1 ? "" : "s"}`}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] tracking-[0.04em] text-ink-3 group-hover:text-ink-1 transition-colors">
            {relativeShort(note.last_edited)}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
