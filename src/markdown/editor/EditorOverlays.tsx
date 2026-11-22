import { useState } from "react";
import { addTableColumn, addTableRow, copyImageToClipboard, deleteTable, deleteTableColumn, deleteTableRow, imageMarkdownWithAlt } from "../../lib/format";
import { Btn, Dialog, Field, Menu, type MenuItem } from "../ui";
import { EmojiAutocomplete } from "./EmojiAutocomplete";
import { EmojiPickerModal } from "./EmojiPickerModal";
import { ImageLightbox } from "./ImageLightbox";
import type { NoteEditor } from "../../editor/useNoteEditor";

/** Alt text for an image in the note. */
function AltTextDialog({ src, alt: initial, refKey, onSave, onClose }: { src: string; alt: string; refKey?: string; onSave: (alt: string) => void; onClose: () => void }) {
  const [alt, setAlt] = useState(initial);
  const save = () => {
    onSave(alt.trim() || "Image");
    onClose();
  };
  return (
    <Dialog title={refKey ? `alt text [${refKey}]` : "alt text"} onClose={onClose} width={440}>
      <div className="flex items-center gap-[2ch]">
        {src && <img src={src} alt="" className="size-14 shrink-0 object-cover outline outline-1 outline-offset-2 outline-[var(--graph-frame)]" onError={(e) => ((e.target as HTMLElement).style.display = "none")} />}
        <Field data-autofocus value={alt} onChange={(e) => setAlt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="workflow diagram" wrapClassName="flex-1" />
      </div>
      <div className="mt-6 flex justify-end gap-[2ch]">
        <Btn variant="ghost" onClick={onClose}>
          cancel
        </Btn>
        <Btn variant="primary" onClick={save}>
          save
        </Btn>
      </div>
    </Dialog>
  );
}

/** The editor's popovers: emoji, the image and table menus, alt text and the image viewer. */
export function EditorOverlays({ editor }: { editor: NoteEditor }) {
  const { imageMenu, imageEdit, tableMenu } = editor;

  const imageItems = (img: HTMLImageElement): MenuItem[] => [
    { key: "copy", glyph: "⧉", label: "copy image", run: () => void copyImageToClipboard(img.src) },
    { key: "zoom", glyph: "⤢", label: "view", run: () => editor.setPreviewImage(img.src) },
    {
      key: "alt",
      glyph: "✎",
      label: "alt text…",
      run: () => editor.setImageEdit({ element: img, alt: img.alt || "Image", src: img.src, refKey: img.getAttribute("data-ref") || undefined }),
    },
    {
      key: "delete",
      glyph: "⌫",
      label: "delete image",
      danger: true,
      section: " ",
      run: () => {
        img.remove();
        editor.input();
      },
    },
  ];

  const tableItems = (cell: HTMLElement): MenuItem[] => {
    const change = (fn: () => void) => () => {
      fn();
      editor.input();
    };
    return [
      { key: "col", glyph: "+", label: "add column", run: change(() => addTableColumn(cell)) },
      { key: "row", glyph: "+", label: "add row", run: change(() => addTableRow(cell)) },
      { key: "dcol", glyph: "−", label: "delete column", section: " ", disabled: (cell.closest("tr")?.children.length ?? 1) <= 1, run: change(() => deleteTableColumn(cell)) },
      { key: "drow", glyph: "−", label: "delete row", disabled: cell.tagName === "TH", run: change(() => deleteTableRow(cell)) },
      { key: "dtable", glyph: "⌫", label: "delete table", danger: true, section: " ", run: change(() => deleteTable(cell)) },
    ];
  };

  return (
    <>
      <EmojiAutocomplete editorRef={editor.bodyRef} onEmojiInserted={() => editor.input()} />
      <EmojiPickerModal isOpen={Boolean(editor.emojiAnchor)} onClose={editor.closeEmojiPicker} anchorRect={editor.emojiAnchor} onSelect={editor.insertEmoji} />

      {imageMenu && <Menu at={{ x: imageMenu.x, y: imageMenu.y }} width={200} onClose={() => editor.setImageMenu(null)} items={imageItems(imageMenu.element)} />}

      {imageEdit && (
        <AltTextDialog
          src={imageEdit.src}
          alt={imageEdit.alt}
          refKey={imageEdit.refKey}
          onClose={() => editor.setImageEdit(null)}
          onSave={(alt) => {
            const img = imageEdit.element;
            img.setAttribute("data-md", imageMarkdownWithAlt(img, alt));
            img.alt = alt;
            editor.input();
          }}
        />
      )}

      {tableMenu && <Menu at={{ x: tableMenu.x, y: tableMenu.y }} width={200} onClose={() => editor.setTableMenu(null)} items={tableItems(tableMenu.cell)} />}

      {editor.previewImage && <ImageLightbox src={editor.previewImage} onClose={() => editor.setPreviewImage(null)} />}
    </>
  );
}
