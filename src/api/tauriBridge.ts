import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

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

export interface CategoryInfo {
  name: string;
  collapsed: boolean;
  color_accent?: string;
}

export interface ScanSummary {
  total_scanned: number;
  imported_count: number;
  skipped_count: number;
  imported_notes: NoteItem[];
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
  theme_mode?: "glass" | "monochrome";
  dock_on_close?: boolean;
  last_seen_version?: string;
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

export const NOTE_FONTS: Array<{ name: string; label: string; stack: string }> = [
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
const CATS_KEY = "doit.categories.v2";

const DEFAULT_NOTES: NoteItem[] = [];

const DEFAULT_CATEGORIES: CategoryInfo[] = [
  { name: "Uncategorized", collapsed: false },
];

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

  async getCategories(): Promise<CategoryInfo[]> {
    if (isTauri()) {
      try {
        return await invoke<CategoryInfo[]>("get_categories");
      } catch (err) {
      }
    }
    return readLocal<CategoryInfo[]>(CATS_KEY, DEFAULT_CATEGORIES);
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

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    if (isTauri()) {
      try {
        return await invoke<AppSettings>("update_settings", { settings });
      } catch (err) {
      }
    }
    localStorage.setItem("doit.settings", JSON.stringify(settings));
    return settings;
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

  async addCategory(category: string): Promise<boolean> {
    if (isTauri()) {
      try {
        return await invoke<boolean>("add_category", { category });
      } catch (err) {
      }
    }
    return true;
  },

  async deleteCategory(category: string): Promise<boolean> {
    if (isTauri()) {
      try {
        return await invoke<boolean>("delete_category", { category });
      } catch (err) {
      }
    }
    return true;
  },

  async renameCategory(category: string, newName: string): Promise<NoteItem[]> {
    if (!isTauri()) return [];
    return await invoke<NoteItem[]>("rename_category", { category, newName });
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

  async setMiniMode(mini: boolean): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("set_mini_window_mode", { mini });
    } catch (err) {
    }
  },

  async openTrayMode(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("open_tray_mode");
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
  async trayReady(): Promise<"panel" | "pill"> {
    if (!isTauri()) return "panel";
    try {
      return (await invoke<string>("tray_ready")) === "pill" ? "pill" : "panel";
    } catch {
      return "panel";
    }
  },

  /** Mutates the single tray frame between the 380x480 panel and the 180x44 floating bar. */
  async setTrayMode(mode: "panel" | "pill"): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("set_tray_mode", { mode });
    } catch {
      /* frame already gone */
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
      await invoke("start_drag");
    } catch {
      try {
        await getCurrentWindow().startDragging();
      } catch {
        /* ignore */
      }
    }
  },

  async startDrag(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("start_drag");
    } catch {
      try {
        await getCurrentWindow().startDragging();
      } catch {
        /* ignore */
      }
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
