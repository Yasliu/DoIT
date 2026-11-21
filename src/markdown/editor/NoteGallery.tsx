import type { NoteItem } from "../../api/tauriBridge";
import { cx } from "../../lib/text";
import type { NoteEditor } from "../../editor/useNoteEditor";

/** Images notes from older versions keep outside their text (`media_urls`), shown above the body. */
export function NoteGallery({ editor, variant }: { editor: NoteEditor; variant: "sheet" | "dock" }) {
  const note = editor.note;
  if (!note) return null;
  const images = galleryOf(note);
  if (images.length === 0) return null;
  const sheet = variant === "sheet";

  const remove = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    editor.change({ media_urls: next, media_url: next[0] || undefined });
  };

  return (
    <div className={sheet ? "mt-4" : "shrink-0"}>
      <div
        className={
          sheet
            ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[220px] overflow-y-auto p-1"
            : "grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1"
        }
      >
        {images.map((src, index) => (
          <div
            key={`img-${index}`}
            onClick={() => editor.setPreviewImage(src)}
            className={cx(
              "relative group aspect-video overflow-hidden bg-surface outline outline-1 outline-[var(--graph-frame)] cursor-pointer hover:outline-[var(--graph-accent)] flex items-center justify-center",
              sheet ? "min-h-[100px]" : "min-h-[80px]",
            )}
            title="Click to preview full image"
          >
            <img
              src={src}
              alt=""
              className={cx("w-full h-full transition-transform duration-200 group-hover:scale-105", sheet ? "object-cover" : "object-contain")}
              onError={(event) => {
                const parent = event.currentTarget.parentElement;
                if (parent) parent.style.display = "none";
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(index);
              }}
              className={cx(
                "absolute grid place-items-center bg-background text-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-background transition-opacity z-10",
                sheet
                  ? "right-1.5 top-1.5 size-6"
                  : "right-1 top-1 size-5",
              )}
              title="Remove image"
              aria-label="Remove image"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function galleryOf(note: NoteItem): string[] {
  const raw = note.media_urls && note.media_urls.length > 0 ? note.media_urls : note.media_url ? [note.media_url] : [];
  return raw.filter((src) => typeof src === "string" && src.trim().length > 0);
}

/** Whether the note still has gallery images (the insert menu shows it). */
export function hasGallery(note: NoteItem): boolean {
  return galleryOf(note).length > 0;
}
