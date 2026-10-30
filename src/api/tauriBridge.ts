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
  theme_mode?: "glass" | "monochrome";
}

export const DEFAULT_SETTINGS: AppSettings = {
  storage_path: "",
  hotkey_new_note: "Ctrl+N",
  hotkey_toggle_tray: "Ctrl+J",
  hotkey_search: "Ctrl+F",
  hotkey_settings: "Ctrl+,",
  hotkey_open_file: "Ctrl+O",
  theme_mode: "glass",
};

export const NOTE_FONTS: Array<{ name: string; label: string; stack: string }> = [
  { name: "Instrument Sans", label: "Instrument Sans", stack: '"Instrument Sans", sans-serif' },
  { name: "Instrument Serif", label: "Instrument Serif", stack: '"Instrument Serif", Georgia, serif' },
  { name: "Newsreader", label: "Newsreader", stack: '"Newsreader", "Instrument Serif", Georgia, serif' },
  { name: "JetBrains Mono", label: "JetBrains Mono", stack: '"JetBrains Mono", monospace' },
  { name: "Bricolage Grotesque", label: "Bricolage Grotesque", stack: '"Bricolage Grotesque", sans-serif' },
];

export function fontStack(name?: string): string {
  const found = NOTE_FONTS.find((font) => font.name === name);
  return found ? found.stack : '"Instrument Sans", sans-serif';
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
        console.warn("get_notes failed, using local cache", err);
      }
    }
    return readLocal<NoteItem[]>(NOTES_KEY, DEFAULT_NOTES);
  },

  async getCategories(): Promise<CategoryInfo[]> {
    if (isTauri()) {
      try {
        return await invoke<CategoryInfo[]>("get_categories");
      } catch (err) {
        console.warn("get_categories failed, using local cache", err);
      }
    }
    return readLocal<CategoryInfo[]>(CATS_KEY, DEFAULT_CATEGORIES);
  },

  async getSettings(): Promise<AppSettings> {
    if (isTauri()) {
      try {
        return await invoke<AppSettings>("get_settings");
      } catch (err) {
        console.warn("get_settings failed", err);
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
        console.warn("update_settings failed", err);
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
        console.warn("select_storage_directory failed", err);
      }
    }
    return null;
  },

  async saveNote(note: NoteItem): Promise<NoteItem> {
    if (isTauri()) {
      try {
        return await invoke<NoteItem>("save_note", { note });
      } catch (err) {
        console.warn("save_note failed, keeping local copy", err);
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
        console.warn("update_note_category failed", err);
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
        console.warn("delete_note failed", err);
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
        console.warn("add_category failed", err);
      }
    }
    return true;
  },

  async deleteCategory(category: string): Promise<boolean> {
    if (isTauri()) {
      try {
        return await invoke<boolean>("delete_category", { category });
      } catch (err) {
        console.warn("delete_category failed", err);
      }
    }
    return true;
  },

  async minimize(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("toggle_window_minimize");
    } catch (err) {
      console.warn("minimize failed", err);
    }
  },

  async toggleMaximize(): Promise<void> {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (err) {
      console.warn("maximize failed", err);
    }
  },

  async close(): Promise<void> {
    if (!isTauri()) return;
    try {
      // Cross button hides to background Desk Tray so app remains active companion
      await invoke("open_tray_mode");
    } catch (err) {
      console.warn("close to tray failed", err);
    }
  },

  async resizeTrayWindow(expanded: boolean): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("resize_tray_window", { expanded });
    } catch (err) {
      console.warn("resize_tray_window failed", err);
    }
  },

  async setMiniMode(mini: boolean): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("set_mini_window_mode", { mini });
    } catch (err) {
      console.warn("set_mini_window_mode failed", err);
    }
  },

  async openTrayMode(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("open_tray_mode");
    } catch (err) {
      console.warn("open_tray_mode failed", err);
    }
  },

  async openCanvasMode(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("open_canvas_mode");
    } catch (err) {
      console.warn("open_canvas_mode failed", err);
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
   * strictly verifies app: "DoIT" header signature, and imports into active Bento grid canvas.
   */
  async importSingleMarkdownFile(filePath?: string): Promise<NoteItem> {
    if (!isTauri()) {
      throw new Error("Tauri runtime not detected");
    }
    return await invoke<NoteItem>("import_single_markdown_file", { filePath });
  },

  /**
   * Automated Folder Scanning:
   * Scans target or current directory for valid DoIT notes,
   * isolating frontmatter and filtering out non-DoIT files.
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
};
