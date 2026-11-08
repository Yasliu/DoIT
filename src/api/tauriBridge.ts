import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { pick } from "../platform";

export interface GridCoordinates {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContentItem {
  id: string;
  text: string;
  is_todo: boolean;
  completed: boolean;
}

export interface NoteItem {
  id: string;
  title: string;
  content: ContentItem[];
  category: string;
  /** Unix milliseconds. The edge strip and every timestamp read from this. */
  last_edited: number;
  grid_coordinates: GridCoordinates;
  font_family?: string;
  is_bold?: boolean;
  is_italic?: boolean;
  media_url?: string;
  media_urls?: string[];
  is_collapsed?: boolean;
  is_pinned?: boolean;
  /** source file format; "txt" notes show a Convert to Markdown action */
  format?: "md" | "txt" | string;
  /** absolute path of an external file opened in place (edited only via the Save button) */
  source_path?: string;
  external_header?: string;
}

/** A shelf in display order; the backend keeps "Uncategorized" last. */
export interface Shelf {
  name: string;
  /** An icon name or "dot"; absent lets the app pick one from the name. */
  icon?: string | null;
  collapsed: boolean;
}

/** A folder imported as one shelf (see `importFolderAsShelf`). */
export interface FolderImport {
  shelf: string;
  total_scanned: number;
  imported_count: number;
  skipped_count: number;
  /** Every note in the workspace afterwards. */
  notes: NoteItem[];
}

export interface ScanSummary {
  total_scanned: number;
  imported_count: number;
  skipped_count: number;
  imported_notes: NoteItem[];
}

/** The dock pill's look, measured from CSS for the natively drawn pill (see platform/pillLook.ts). */
export interface PillLook {
  width: number;
  height: number;
  radius: number;
  background: [number, number, number, number];
  border: [number, number, number, number];
  border_width: number;
  text: [number, number, number, number];
  letter_spacing: number;
}

export interface QuadrantInfo {
  grow_x: "right" | "left" | "center";
  grow_y: "down" | "up";
}

export interface AppSettings {
  storage_path: string;
  hotkey_new_note: string;
  hotkey_toggle_tray: string;
  hotkey_search: string;
  hotkey_settings: string;
  hotkey_open_file?: string;
  hotkey_h1?: string;
  hotkey_h2?: string;
  hotkey_h3?: string;
  hotkey_bold?: string;
  hotkey_italic?: string;
  hotkey_table?: string;
  hotkey_table_col?: string;
  hotkey_table_row?: string;
  hotkey_task?: string;
  hotkey_strikethrough?: string;
  hotkey_highlight?: string;
  hotkey_inline_code?: string;
  hotkey_link?: string;
  hotkey_ordered_list?: string;
  hotkey_blockquote?: string;
  hotkey_footnote?: string;
  hotkey_subscript?: string;
  hotkey_superscript?: string;
  theme_mode?: "glass" | "monochrome";
  dock_on_close?: boolean;
  last_seen_version?: string;
  /** Modern design only: colour theme and light/dark choice (see src/platform/modern/theme.ts). */
  palette?: string;
  appearance?: string;
  glass?: boolean;
  /** Modern design only: near-square corners and hairline edges. */
  boxy?: boolean;
  /** Windows: "modern" opts into the new design (Linux always has it). */
  design?: "classic" | "modern";
}

export const DEFAULT_SETTINGS: AppSettings = {
  storage_path: "",
  hotkey_new_note: "Ctrl+N",
  hotkey_toggle_tray: "Ctrl+J",
  hotkey_search: "Ctrl+F",
  hotkey_settings: "Ctrl+,",
  hotkey_open_file: "Ctrl+O",
  hotkey_h1: "Ctrl+1",
  hotkey_h2: "Ctrl+2",
  hotkey_h3: "Ctrl+3",
  hotkey_bold: "Ctrl+B",
  hotkey_italic: "Ctrl+I",
  hotkey_table: "Ctrl+T",
  hotkey_table_col: "Ctrl+Alt+ArrowRight",
  hotkey_table_row: "Ctrl+Alt+ArrowDown",
  hotkey_task: "Ctrl+L",
  theme_mode: "glass",
  dock_on_close: true,
};

/** The fields of `next` that differ from `prev`, i.e. what a settings screen changed. */
export function settingsChanges(prev: AppSettings, next: AppSettings): Partial<AppSettings> {
  const changes: Partial<Record<keyof AppSettings, unknown>> = {};
  for (const key of Object.keys(next) as (keyof AppSettings)[]) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) changes[key] = next[key];
  }
  return changes as Partial<AppSettings>;
}

export const NOTE_FONTS: Array<{ name: string; label: string; stack: string }> = [
  // Linux's interface typeface, offered for notes too.
  ...pick([], [{ name: "Inter", label: "Inter", stack: '"Inter Variable", "Inter", system-ui, sans-serif' }]),
  { name: "Instrument Sans", label: "Instrument Sans", stack: '"Instrument Sans", "DoIT_Default", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  { name: "Instrument Serif", label: "Instrument Serif", stack: '"Instrument Serif", "DoIT_Default", Georgia, serif' },
  { name: "Newsreader", label: "Newsreader", stack: '"Newsreader", "Instrument Serif", "DoIT_Default", Georgia, serif' },
  { name: "JetBrains Mono", label: "JetBrains Mono", stack: '"JetBrains Mono", "DoIT_Default", monospace' },
  { name: "Bricolage Grotesque", label: "Bricolage Grotesque", stack: '"Bricolage Grotesque", "DoIT_Default", sans-serif' },
];

export function fontStack(name?: string): string {
  if (!name || name === "default" || name === "DoIT_Default") {
    return '"Instrument Sans", "DoIT_Default", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
  }
  const found = NOTE_FONTS.find((font) => font.name.toLowerCase() === name.toLowerCase());
  if (found) {
    return found.stack;
  }
  return `"${name}", "DoIT_Default", "Instrument Sans", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
}

export const isTauri = () =>
  typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

const NOTES_KEY = "doit.notes.v2";
const SHELVES_KEY = "doit.shelves.v1";

const DEFAULT_NOTES: NoteItem[] = [];

const DEFAULT_SHELVES: Shelf[] = [{ name: "Uncategorized", collapsed: false }];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the in-memory state still works */
  }
}

/**
 * Every write goes through this bridge. In the Tauri shell it hits the Rust
 * commands; in a plain browser preview it degrades to a local cache with the
 * exact same payload shape, so the view layer never learns the difference.
 */
export const tauriApi = {
  async getNotes(): Promise<NoteItem[]> {
    if (isTauri()) {
      try {
        return await invoke<NoteItem[]>("get_notes");
      } catch (err) {
      }
    }
    return readLocal<NoteItem[]>(NOTES_KEY, DEFAULT_NOTES);
  },

  async getShelves(): Promise<Shelf[]> {
    if (isTauri()) {
      try {
        return await invoke<Shelf[]>("get_shelves");
      } catch (err) {
      }
    }
    return readLocal<Shelf[]>(SHELVES_KEY, DEFAULT_SHELVES);
  },

  async getDefaultStoragePath(): Promise<string> {
    if (isTauri()) {
      try {
        return await invoke<string>("get_default_storage_path");
      } catch (err) {
      }
    }
    return "Documents/DoIT";
  },

  async getSettings(): Promise<AppSettings> {
    if (isTauri()) {
      try {
        return await invoke<AppSettings>("get_settings");
      } catch (err) {
      }
    }
    const stored = localStorage.getItem("doit.settings");
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
  },

  /**
   * Saves only the given fields; every other setting keeps its saved value. Never send a whole
   * settings object read earlier: another window may have changed a field since.
   */
  async patchSettings(changes: Partial<AppSettings>): Promise<AppSettings> {
    if (isTauri()) {
      try {
        return await invoke<AppSettings>("update_settings", { patch: changes });
      } catch (err) {
      }
    }
    const merged = { ...(await tauriApi.getSettings()), ...changes };
    localStorage.setItem("doit.settings", JSON.stringify(merged));
    return merged;
  },

  async selectStorageDirectory(): Promise<string | null> {
    if (isTauri()) {
      try {
        return await invoke<string | null>("select_storage_directory");
      } catch (err) {
      }
    }
    return null;
  },

  async saveNote(note: NoteItem): Promise<NoteItem> {
    if (isTauri()) {
      try {
        return await invoke<NoteItem>("save_note", { note });
      } catch (err) {
      }
    }
    const notes = readLocal<NoteItem[]>(NOTES_KEY, DEFAULT_NOTES);
    const idx = notes.findIndex((n) => n.id === note.id);
    if (idx >= 0) notes[idx] = note;
    else notes.unshift(note);
    writeLocal(NOTES_KEY, notes);
    return note;
  },

  async updateNoteCategory(id: string, category: string): Promise<NoteItem | null> {
    if (isTauri()) {
      try {
        return await invoke<NoteItem>("update_note_category", { id, category });
      } catch (err) {
      }
    }
    const notes = readLocal<NoteItem[]>(NOTES_KEY, DEFAULT_NOTES);
    const note = notes.find((n) => n.id === id);
    if (!note) return null;
    note.category = category;
    note.last_edited = Date.now();
    writeLocal(NOTES_KEY, notes);
    return note;
  },

  async deleteNote(id: string): Promise<void> {
    if (isTauri()) {
      try {
        await invoke<boolean>("delete_note", { id });
        return;
      } catch (err) {
      }
    }
    const notes = readLocal<NoteItem[]>(NOTES_KEY, DEFAULT_NOTES).filter((n) => n.id !== id);
    writeLocal(NOTES_KEY, notes);
  },

  async createShelf(name: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("create_shelf", { name });
    } catch (err) {
    }
  },

  /** Deletes a shelf; returns its notes, now on "Uncategorized". */
  async deleteShelf(name: string): Promise<NoteItem[]> {
    if (!isTauri()) return [];
    try {
      return await invoke<NoteItem[]>("delete_shelf", { name });
    } catch (err) {
      return [];
    }
  },

  /** Renames a shelf; returns its notes, moved along. Rejects with a message the user can read. */
  async renameShelf(name: string, newName: string): Promise<NoteItem[]> {
    if (!isTauri()) return [];
    return await invoke<NoteItem[]>("rename_shelf", { name, newName });
  },

  async reorderShelves(names: string[]): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("reorder_shelves", { names });
    } catch (err) {
    }
  },

  async setShelfIcon(name: string, icon: string | null): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("set_shelf_icon", { name, icon });
    } catch (err) {
    }
  },

  async setShelfCollapsed(name: string, collapsed: boolean): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("set_shelf_collapsed", { name, collapsed });
    } catch (err) {
    }
  },

  async minimize(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("toggle_window_minimize");
    } catch (err) {
    }
  },

  async toggleMaximize(): Promise<void> {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (err) {
    }
  },

  async close(): Promise<void> {
    if (!isTauri()) return;
    try {
      // Closes window, triggering CloseRequested event in Rust which honors dock_on_close
      await getCurrentWindow().close();
    } catch (err) {
    }
  },

  async openTrayMode(hasActiveNote?: boolean, noteId?: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("open_tray_mode", { hasActiveNote: hasActiveNote ?? false, noteId: noteId ?? null });
    } catch (err) {
    }
  },

  async openCanvasMode(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("open_canvas_mode");
    } catch (err) {
    }
  },

  async takeLaunchFile(): Promise<string | null> {
    if (!isTauri()) return null;
    try {
      return (await invoke<string | null>("take_launch_file")) ?? null;
    } catch {
      return null;
    }
  },

  async openExternalFile(path: string): Promise<NoteItem> {
    return await invoke<NoteItem>("open_external_file", { path });
  },

  async saveExternalFile(note: NoteItem): Promise<NoteItem> {
    return await invoke<NoteItem>("save_external_file", { note });
  },

  /** Tray page mounted: the backend shows the (pre-positioned) frame and returns the start mode. */
  /** The dock page mounted: the backend shows it and says which shape it is in and which note to open. */
  async trayReady(): Promise<{ shape: "panel" | "pill"; note: string | null }> {
    if (!isTauri()) return { shape: "panel", note: null };
    try {
      const ready = await invoke<{ shape: string; note: string | null }>("tray_ready");
      return { shape: ready.shape === "pill" ? "pill" : "panel", note: ready.note ?? null };
    } catch {
      return { shape: "panel", note: null };
    }
  },

  /** Stores an image next to the notes; returns its relative path, or null if it could not be saved. */
  async saveAttachment(bytes: ArrayBuffer, mime: string): Promise<string | null> {
    if (!isTauri()) return null;
    try {
      return await invoke<string>("save_attachment", new Uint8Array(bytes), { headers: { "x-mime": mime } });
    } catch {
      return null;
    }
  },

  async setPillLook(look: PillLook): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("set_pill_look", { look });
    } catch {
      /* the pill keeps its previous look */
    }
  },

  /** Mutates the single tray frame between the 380x480 panel and the 180x44 floating bar with dynamic quadrant detection. */
  async setTrayMode(mode: "panel" | "pill"): Promise<QuadrantInfo | null> {
    if (!isTauri()) return null;
    try {
      return await invoke<QuadrantInfo>("set_tray_mode", { mode });
    } catch {
      return null;
    }
  },

  /** Canvas page mounted after a (re)load: lets the backend reveal the window. */
  async canvasReady(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("canvas_ready");
    } catch {
      /* not running under Tauri */
    }
  },

  /** True while an external file has unsaved edits (the canvas is then never swapped for a blank page). */
  async setExternalDirty(dirty: boolean): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("set_external_dirty", { dirty });
    } catch {
      /* ignore */
    }
  },
  async beginDrag(): Promise<void> {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {
      /* ignore */
    }
  },

  /**
   * Drags the dock window (pill or panel), grabbed at (`grabX`, `grabY`) px from its top-left, and
   * resolves when the drag is over. Where the app runs the drag (Linux under X11) it follows the
   * cursor, never leaving the screen, until the button is released; elsewhere the OS move loop has
   * already finished when `begin_dock_drag` returns.
   */
  async dragDockWindow(grabX: number, grabY: number): Promise<void> {
    if (!isTauri()) return;
    // Listen before asking: a quick flick can release the button while the call is in flight.
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    const events = ["pointerup", "pointercancel", "blur"] as const;
    events.forEach((name) => window.addEventListener(name, release));
    try {
      if (await invoke<boolean>("begin_dock_drag", { grabX, grabY })) {
        await released;
        await invoke("end_dock_drag");
      }
    } catch {
      await this.beginDrag();
    } finally {
      events.forEach((name) => window.removeEventListener(name, release));
    }
  },

  async saveTrayPosition(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("save_tray_position");
    } catch {
      /* ignore */
    }
  },

  /**
   * Single File Ingestion Layer:
   * Opens file picker (or uses provided path), reads the Markdown file,
   * and imports it into the active Bento grid canvas. Any .md / .txt file is accepted.
   */
  async importSingleMarkdownFile(filePath?: string): Promise<NoteItem> {
    if (!isTauri()) {
      throw new Error("Tauri runtime not detected");
    }
    return await invoke<NoteItem>("import_single_markdown_file", { filePath });
  },

  /**
   * Automated Folder Scanning:
   * Scans the target or current directory and imports every .md / .txt file.
   */
  async scanMarkdownFolder(folderPath?: string): Promise<ScanSummary> {
    if (!isTauri()) {
      return { total_scanned: 0, imported_count: 0, skipped_count: 0, imported_notes: [] };
    }
    return await invoke<ScanSummary>("scan_markdown_folder", { folderPath });
  },

  /**
   * Native dialog picker to select and scan any folder across the drive.
   */
  async pickAndScanFolder(): Promise<ScanSummary> {
    if (!isTauri()) {
      return { total_scanned: 0, imported_count: 0, skipped_count: 0, imported_notes: [] };
    }
    return await invoke<ScanSummary>("pick_and_scan_folder");
  },

  /** Picks a folder and imports its notes as one shelf, named `shelf` or after the folder. */
  async importFolderAsShelf(shelf?: string): Promise<FolderImport> {
    return await invoke<FolderImport>("import_folder_as_shelf", { shelf: shelf ?? null });
  },

  async restartApp(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("restart_app");
    } catch {
      /* ignore */
    }
  },

  async quitApp(): Promise<void> {
    if (isTauri()) {
      try {
        await invoke("quit_app");
        return;
      } catch {
        /* ignore */
      }
    }
    window.close();
  },

  async showTrayContextMenu(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("show_tray_context_menu");
    } catch {
      /* ignore */
    }
  },

  async getSystemFonts(): Promise<string[]> {
    if (isTauri()) {
      try {
        const fonts = await invoke<string[]>("get_system_fonts");
        if (Array.isArray(fonts) && fonts.length > 0) {
          return fonts;
        }
      } catch (err) {
        console.warn("Failed to get system fonts from Tauri backend:", err);
      }
    }
    if ("queryLocalFonts" in window) {
      try {
        const local = await (window as any).queryLocalFonts();
        const names = Array.from(new Set(local.map((f: any) => f.family))).sort() as string[];
        if (names.length > 0) return names;
      } catch {
        /* ignore */
      }
    }
    return [];
  },
};
