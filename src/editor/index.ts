/**
 * The note editor, shared by the canvas sheet and the dock panel. One hook holds the editing
 * behaviour; three pieces render it. See `useNoteEditor` for how a window wires it up.
 */
export { useNoteEditor, type NoteEditor } from "./useNoteEditor";
export { NoteBody } from "./NoteBody";
export { EditorOverlays } from "./EditorOverlays";
export { NoteGallery, hasGallery } from "./NoteGallery";
