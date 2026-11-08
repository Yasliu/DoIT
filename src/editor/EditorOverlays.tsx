import { EditImageModal } from "../components/EditImageModal";
import { EmojiAutocomplete } from "../components/EmojiAutocomplete";
import { EmojiPickerModal } from "../components/EmojiPickerModal";
import { ImageContextMenu } from "../components/ImageContextMenu";
import { ImageLightbox } from "../components/ImageLightbox";
import { TableMenu } from "../components/TableMenu";
import type { NoteEditor } from "./useNoteEditor";

/** The editor's popovers: emoji, image menu and alt text, table menu and the image lightbox. */
export function EditorOverlays({ editor }: { editor: NoteEditor }) {
  const { imageMenu, imageEdit, tableMenu } = editor;
  return (
    <>
      <EmojiAutocomplete editorRef={editor.bodyRef} onEmojiInserted={() => editor.input()} />

      <EmojiPickerModal
        isOpen={Boolean(editor.emojiAnchor)}
        onClose={editor.closeEmojiPicker}
        anchorRect={editor.emojiAnchor}
        onSelect={editor.insertEmoji}
      />

      {imageMenu && (
        <ImageContextMenu
          isOpen
          x={imageMenu.x}
          y={imageMenu.y}
          imgElement={imageMenu.element}
          onClose={() => editor.setImageMenu(null)}
          onZoom={() => {
            editor.setPreviewImage(imageMenu.element.src);
            editor.setImageMenu(null);
          }}
          onEdit={() => {
            editor.setImageEdit({
              element: imageMenu.element,
              alt: imageMenu.element.alt || "Image",
              src: imageMenu.element.src,
              refKey: imageMenu.element.getAttribute("data-ref") || undefined,
            });
            editor.setImageMenu(null);
          }}
          onDelete={() => {
            imageMenu.element.remove();
            editor.input();
            editor.setImageMenu(null);
          }}
        />
      )}

      <EditImageModal
        isOpen={Boolean(imageEdit)}
        onClose={() => editor.setImageEdit(null)}
        alt={imageEdit?.alt ?? ""}
        src={imageEdit?.src ?? ""}
        refKey={imageEdit?.refKey}
        onSave={(alt) => {
          if (!imageEdit) return;
          const img = imageEdit.element;
          img.alt = alt;
          const ref = img.getAttribute("data-ref");
          img.setAttribute("data-md", ref ? `![${alt}][${ref}]` : `![${alt}](${img.src})`);
          editor.input();
          editor.setImageEdit(null);
        }}
      />

      {tableMenu && (
        <TableMenu x={tableMenu.x} y={tableMenu.y} cell={tableMenu.cell} onClose={() => editor.setTableMenu(null)} onChanged={() => editor.input()} />
      )}

      {editor.previewImage && <ImageLightbox src={editor.previewImage} onClose={() => editor.setPreviewImage(null)} />}
    </>
  );
}
