import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NoteItem, ScanSummary, Shelf, tauriApi } from "../api/tauriBridge";
import { initCategoryIcons } from "../lib/categoryIcons";
import { uid } from "../lib/text";

export type LoadState = "loading" | "ready" | "error";

/**
 * Owns the note graph. Every mutation is applied to the view immediately and
 * written through the bridge on a short debounce, so typing never waits on IPC.
 *
 * Deletes are the exception: the note is removed from disk at once and the undo
 * path re-creates it from the in-memory snapshot. Deferring the IPC delete would
 * resurrect the note if the app closed inside the undo window.
 */
export function useWorkspace() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  /** Every shelf in display order, as the backend keeps it (with icon and collapsed state). */
  const [shelfList, setShelfList] = useState<Shelf[]>([]);
  const reloadShelves = useCallback(() => void tauriApi.getShelves().then(setShelfList), []);

  // The icon helpers read a cache; keep it in step with the shelves.
  useEffect(() => {
    const icons: Record<string, string> = {};
    shelfList.forEach((shelf) => {
      if (shelf.icon) icons[shelf.name.toLowerCase()] = shelf.icon;
    });
    if (shelfList.length) initCategoryIcons(icons);
  }, [shelfList]);

  /** Puts `order` first (others keep their place after it); the backend keeps "Uncategorized" last. */
  const reorderShelves = useCallback((order: string[]) => {
    setShelfList((prev) => {
      const rank = new Map(order.map((name, i) => [name.toLowerCase(), i]));
      const place = (shelf: Shelf, i: number) =>
        shelf.name.toLowerCase() === "uncategorized" ? Number.MAX_SAFE_INTEGER : (rank.get(shelf.name.toLowerCase()) ?? order.length + i);
      return prev.map((shelf, i) => ({ shelf, at: place(shelf, i) })).sort((a, b) => a.at - b.at).map(({ shelf }) => shelf);
    });
    void tauriApi.reorderShelves(order);
  }, []);

  const collapsed = useMemo(() => Object.fromEntries(shelfList.map((s) => [s.name, s.collapsed])), [shelfList]);
  const toggleCollapsed = useCallback((name: string) => {
    setShelfList((prev) => {
      const shelf = prev.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (shelf) void tauriApi.setShelfCollapsed(shelf.name, !shelf.collapsed);
      return prev.map((s) => (s === shelf ? { ...s, collapsed: !s.collapsed } : s));
    });
  }, []);

  const [state, setState] = useState<LoadState>("loading");

  const saveTimers = useRef(new Map<string, number>());
  const pending = useRef(new Map<string, NoteItem>());
  /**
   * Notes deleted here or in the other window. An editor that still has one open saves its draft
   * as it closes, and that save must not bring the note back. A note the backend hands over again
   * (undo, an import, a reload) is no longer deleted.
   */
  const removed = useRef(new Set<string>());
  /** Replaces the view with the backend's notes. */
  const showAll = useCallback((all: NoteItem[]) => {
    removed.current.clear();
    setNotes(all);
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [loadedNotes, loadedShelves] = await Promise.all([tauriApi.getNotes(), tauriApi.getShelves()]);
      showAll(loadedNotes);
      setShelfList(loadedShelves);
      migrateCollapsedShelves(loadedShelves);
      setState("ready");
    } catch (err) {
      console.error("workspace load failed", err);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Drops a deleted note from the view, along with any save of it still waiting. */
  const forget = useCallback((id: string) => {
    removed.current.add(id);
    window.clearTimeout(saveTimers.current.get(id));
    saveTimers.current.delete(id);
    pending.current.delete(id);
    setNotes((prev) => prev.filter((note) => note.id !== id));
  }, []);

  // Real-time synchronization across main window and desk tray window
  useEffect(() => {
    let unlistenSaved: (() => void) | null = null;
    let unlistenDeleted: (() => void) | null = null;
    let unlistenCats: (() => void) | null = null;

    getCurrentWindow()
      .listen<NoteItem>("note-saved", (event) => {
        const incoming = event.payload;
        // Saved again somewhere (an undone delete, perhaps in the other window): it is back.
        removed.current.delete(incoming.id);
        if (pending.current.has(incoming.id)) return;
        setNotes((prev) => {
          const idx = prev.findIndex((n) => n.id === incoming.id);
          if (idx >= 0) {
            const copy = [...prev];
            const local = prev[idx];
            // Backend trims titles on write; never let that echo eat spaces the user is still typing.
            copy[idx] =
              local.title !== incoming.title && local.title.trim() === incoming.title
                ? { ...incoming, title: local.title }
                : incoming;
            return copy;
          }
          return [incoming, ...prev];
        });
      })
      .then((unlisten) => {
        unlistenSaved = unlisten;
      });

    getCurrentWindow()
      .listen<void>("shelves-changed", reloadShelves)
      .then((unlisten) => {
        unlistenCats = unlisten;
      });

    getCurrentWindow()
      .listen<string>("note-deleted", (event) => {
        forget(event.payload);
      })
      .then((unlisten) => {
        unlistenDeleted = unlisten;
      });

    return () => {
      if (unlistenSaved) unlistenSaved();
      if (unlistenDeleted) unlistenDeleted();
      if (unlistenCats) unlistenCats();
    };
  }, []);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const persist = useCallback((note: NoteItem, immediate = false) => {
    if (removed.current.has(note.id)) return;
    const timers = saveTimers.current;
    const existing = timers.get(note.id);
    if (existing) window.clearTimeout(existing);

    pending.current.set(note.id, note);

    const write = () => {
      timers.delete(note.id);
      pending.current.delete(note.id);
      void tauriApi.saveNote(note);
    };

    if (immediate) {
      write();
      return;
    }

    const timer = window.setTimeout(write, 320);
    timers.set(note.id, timer);
  }, []);

  const patch = useCallback(
    (next: NoteItem, immediate = false) => {
      setNotes((prev) => prev.map((note) => (note.id === next.id ? next : note)));
      persist(next, immediate);
    },
    [persist],
  );

  const create = useCallback(
    (category?: string, isTodo = false) => {
      const createdAt = Date.now();
      const note: NoteItem = {
        id: uid("note"),
        title: "",
        content: [{ id: uid("line"), text: "", is_todo: isTodo, completed: false }],
        category: category && category.trim().length > 0 ? category.trim() : "Uncategorized",
        last_edited: createdAt,
        grid_coordinates: { x: 0, y: 0, w: 0, h: 0 },
        font_family: "Instrument Sans",
        is_bold: false,
        is_italic: false,
      };

      setNotes((prev) => [note, ...prev]);
      persist(note, true);
      return note;
    },
    [persist],
  );

  const remove = useCallback((id: string) => {
    forget(id);
    void tauriApi.deleteNote(id);
  }, [forget]);

  const restore = useCallback(
    (note: NoteItem) => {
      removed.current.delete(note.id);
      setNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [note, ...prev]));
      persist(note, true);
    },
    [persist],
  );

  const moveCategory = useCallback(
    async (id: string, category: string) => {
      setNotes((prev) =>
        prev.map((note) =>
          note.id === id ? { ...note, category, last_edited: Date.now() } : note,
        ),
      );

      try {
        const saved = await tauriApi.updateNoteCategory(id, category);
        if (saved) {
          setNotes((prev) => prev.map((note) => (note.id === id ? saved : note)));
        }
      } catch (err) {
        console.error("category move failed, resyncing", err);
        void load();
      }
    },
    [load],
  );

  const deleteCategory = useCallback(async (category: string) => {
    if (category.toLowerCase() === "uncategorized") return;
    const lower = category.toLowerCase();
    setNotes((prev) =>
      prev.map((n) => (n.category.toLowerCase() === lower ? { ...n, category: "Uncategorized", last_edited: Date.now() } : n)),
    );
    setShelfList((prev) => prev.filter((s) => s.name.toLowerCase() !== lower));
    const moved = await tauriApi.deleteShelf(category);
    setNotes((prev) => prev.map((n) => moved.find((m) => m.id === n.id) ?? n));
    reloadShelves();
  }, [reloadShelves]);

  const renameCategory = useCallback(async (category: string, rawName: string): Promise<string | null> => {
    const newName = rawName.trim().slice(0, 24);
    // flush unsaved edits first so a late save cannot resurrect the old shelf name
    pending.current.forEach((n) => persist(n, true));
    try {
      const moved = await tauriApi.renameShelf(category, newName);
      setNotes((prev) => prev.map((n) => moved.find((m) => m.id === n.id) ?? n));
      reloadShelves();
      return null;
    } catch (err) {
      return typeof err === "string" ? err : "Could not rename the shelf.";
    }
  }, [persist, reloadShelves]);

  const createCategory = useCallback(async (category: string) => {
    const trimmed = category.trim().slice(0, 24);
    if (!trimmed) return;
    setShelfList((prev) => {
      if (prev.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const at = prev.findIndex((s) => s.name.toLowerCase() === "uncategorized");
      const next = [...prev];
      next.splice(at < 0 ? next.length : at, 0, { name: trimmed, collapsed: false });
      return next;
    });
    await tauriApi.createShelf(trimmed);
    reloadShelves();
  }, [reloadShelves]);

  /** A copy of `note` on `shelf`, saved as a note of its own. */
  const copyNote = useCallback(
    (note: NoteItem, shelf: string): NoteItem => {
      const copy: NoteItem = {
        ...note,
        id: uid("note"),
        category: shelf,
        last_edited: Date.now(),
        grid_coordinates: { x: 0, y: 0, w: 0, h: 0 },
        source_path: undefined,
        external_header: undefined,
      };
      setNotes((prev) => [copy, ...prev]);
      persist(copy, true);
      return copy;
    },
    [persist],
  );

  const reorderNote = useCallback(
    (shelf: string, activeId: string, overId: string) => {
      if (activeId === overId) return;

      const byOrder = (a: NoteItem, b: NoteItem) => {
        const ax = a.grid_coordinates?.x;
        const bx = b.grid_coordinates?.x;
        if (typeof ax === "number" && typeof bx === "number") {
          if (ax !== bx) return ax - bx;
        } else if (typeof ax === "number") {
          return -1;
        } else if (typeof bx === "number") {
          return 1;
        }
        return b.last_edited - a.last_edited;
      };

      setNotes((prev) => {
        const shelfNotes = prev
          .filter(
            (n) => (n.category || "Uncategorized").toLowerCase() === shelf.toLowerCase(),
          )
          .sort(byOrder);
        const activeIdx = shelfNotes.findIndex((n) => n.id === activeId);
        const overIdx = shelfNotes.findIndex((n) => n.id === overId);
        if (activeIdx === -1 || overIdx === -1) return prev;

        const updatedShelf = [...shelfNotes];
        const [moved] = updatedShelf.splice(activeIdx, 1);
        updatedShelf.splice(overIdx, 0, moved);

        const orderMap = new Map<string, number>();
        updatedShelf.forEach((n, idx) => {
          orderMap.set(n.id, idx + 1);
        });

        const next = prev.map((n) => {
          if (orderMap.has(n.id)) {
            const nextNote = {
              ...n,
              grid_coordinates: { ...n.grid_coordinates, x: orderMap.get(n.id)! },
            };
            persist(nextNote);
            return nextNote;
          }
          return n;
        });

        return next;
      });
    },
    [persist],
  );

  /** Shelf names in display order, plus any a note is on that the backend has not reported yet. */
  const shelfNames = useMemo(() => {
    const names = shelfList.map((s) => s.name);
    const known = new Set(names.map((n) => n.toLowerCase()));
    const extra = notes
      .map((note) => (note.category || "Uncategorized").trim())
      .filter((name) => name && !known.has(name.toLowerCase()) && known.add(name.toLowerCase()));
    const at = names.findIndex((n) => n.toLowerCase() === "uncategorized");
    if (at < 0) return [...names, ...extra, "Uncategorized"];
    return [...names.slice(0, at), ...extra, ...names.slice(at)];
  }, [shelfList, notes]);
  // Typing in a note changes `notes` on every key; the same names must stay the same array, or
  // every card (they all take it) would render again with each one.
  const lastShelves = useRef(shelfNames);
  if (lastShelves.current.length !== shelfNames.length || lastShelves.current.some((name, i) => name !== shelfNames[i])) {
    lastShelves.current = shelfNames;
  }
  const shelves = lastShelves.current;

  useEffect(() => {
    const flush = () => {
      saveTimers.current.forEach((timer) => window.clearTimeout(timer));
      saveTimers.current.clear();
      const saves = [...pending.current.values()].map((note) => tauriApi.saveNote(note));
      pending.current.clear();
      return Promise.allSettled(saves);
    };
    const flushAndAnswer = () => void flush().then(() => tauriApi.flushDone());
    window.addEventListener("beforeunload", flush);
    let unlisten: (() => void) | null = null;
    let disposed = false;
    getCurrentWindow()
      .listen("flush-pending", flushAndAnswer)
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  const importNoteFile = useCallback(async (filePath?: string): Promise<NoteItem> => {
    const imported = await tauriApi.importSingleMarkdownFile(filePath);
    removed.current.delete(imported.id);
    setNotes((prev) => {
      const idx = prev.findIndex((n) => n.id === imported.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = imported;
        return copy;
      }
      return [imported, ...prev];
    });
    reloadShelves();
    return imported;
  }, []);

  const scanFolder = useCallback(async (folderPath?: string): Promise<ScanSummary> => {
    const summary = await tauriApi.scanMarkdownFolder(folderPath);
    if (summary.imported_notes.length > 0) {
      showAll(summary.imported_notes);
      reloadShelves();
    }
    return summary;
  }, []);

  const pickAndScan = useCallback(async (): Promise<ScanSummary> => {
    const summary = await tauriApi.pickAndScanFolder();
    if (summary.imported_notes.length > 0) {
      showAll(summary.imported_notes);
      reloadShelves();
    }
    return summary;
  }, []);

  const importFolderAsShelf = useCallback(async (shelf?: string) => {
    const result = await tauriApi.importFolderAsShelf(shelf);
    showAll(result.notes);
    reloadShelves();
    return result;
  }, []);

  return {
    notes,
    shelves,
    collapsed,
    toggleCollapsed,
    state,
    reload: load,
    create,
    patch,
    remove,
    restore,
    moveCategory,
    deleteCategory,
    createCategory,
    renameCategory,
    reorderNote,
    importNoteFile,
    scanFolder,
    pickAndScan,
    importFolderAsShelf,
    reorderShelves,
    copyNote,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;

/** Collapsed shelves used to live in this window's storage; hand them to the backend once. */
function migrateCollapsedShelves(shelves: Shelf[]): void {
  const KEY = "doit.collapsed";
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, boolean>;
    shelves.forEach((shelf) => {
      if (saved[shelf.name] && !shelf.collapsed) void tauriApi.setShelfCollapsed(shelf.name, true);
    });
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to migrate */
  }
}
