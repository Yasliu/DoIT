import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CategoryInfo, NoteItem, ScanSummary, tauriApi } from "../api/tauriBridge";
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
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  const saveTimers = useRef(new Map<string, number>());
  const pending = useRef(new Map<string, NoteItem>());

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [loadedNotes, loadedCategories] = await Promise.all([
        tauriApi.getNotes(),
        tauriApi.getCategories(),
      ]);
      setNotes(loadedNotes);
      setCategories(loadedCategories);
      setState("ready");
    } catch (err) {
      console.error("workspace load failed", err);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time synchronization across main window and desk tray window
  useEffect(() => {
    let unlistenSaved: (() => void) | null = null;
    let unlistenDeleted: (() => void) | null = null;

    getCurrentWindow()
      .listen<NoteItem>("note-saved", (event) => {
        const incoming = event.payload;
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
      .listen<string>("note-deleted", (event) => {
        const deletedId = event.payload;
        setNotes((prev) => prev.filter((n) => n.id !== deletedId));
      })
      .then((unlisten) => {
        unlistenDeleted = unlisten;
      });

    return () => {
      if (unlistenSaved) unlistenSaved();
      if (unlistenDeleted) unlistenDeleted();
    };
  }, []);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const persist = useCallback((note: NoteItem, immediate = false) => {
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
    const timer = saveTimers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      saveTimers.current.delete(id);
    }
    pending.current.delete(id);

    setNotes((prev) => prev.filter((note) => note.id !== id));
    void tauriApi.deleteNote(id);
  }, []);

  const restore = useCallback(
    (note: NoteItem) => {
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

  const deleteCategory = useCallback(
    async (category: string) => {
      if (category.toLowerCase() === "uncategorized") return;
      setNotes((prev) =>
        prev.map((n) =>
          n.category.toLowerCase() === category.toLowerCase()
            ? { ...n, category: "Uncategorized", last_edited: Date.now() }
            : n,
        ),
      );
      setCategories((prev) =>
        prev.filter((c) => c.name.toLowerCase() !== category.toLowerCase()),
      );
      try {
        await tauriApi.deleteCategory(category);
      } catch (err) {
        console.error("delete category failed", err);
      }
      void load();
    },
    [load],
  );

  const createCategory = useCallback(
    async (category: string) => {
      const trimmed = category.trim();
      if (!trimmed) return;
      setCategories((prev) => {
        if (prev.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return prev;
        return [...prev, { name: trimmed, collapsed: false, color_accent: "#ffffff" }];
      });
      try {
        await tauriApi.addCategory(trimmed);
      } catch (err) {
        console.warn("add category failed", err);
      }
    },
    [],
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

  const shelves = useMemo(() => {
    const names = new Set<string>();
    names.add("Uncategorized");
    categories.forEach((category) => {
      if (category.name.trim()) names.add(category.name.trim());
    });
    notes.forEach((note) => {
      const name = (note.category || "Uncategorized").trim();
      if (name) names.add(name);
    });
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [categories, notes]);

  useEffect(() => {
    const flush = () => {
      pending.current.forEach((note) => {
        void tauriApi.saveNote(note);
      });
      pending.current.clear();
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  const importNoteFile = useCallback(async (filePath?: string): Promise<NoteItem> => {
    const imported = await tauriApi.importSingleMarkdownFile(filePath);
    setNotes((prev) => {
      const idx = prev.findIndex((n) => n.id === imported.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = imported;
        return copy;
      }
      return [imported, ...prev];
    });
    void tauriApi.getCategories().then(setCategories);
    return imported;
  }, []);

  const scanFolder = useCallback(async (folderPath?: string): Promise<ScanSummary> => {
    const summary = await tauriApi.scanMarkdownFolder(folderPath);
    if (summary.imported_notes.length > 0) {
      setNotes(summary.imported_notes);
      void tauriApi.getCategories().then(setCategories);
    }
    return summary;
  }, []);

  const pickAndScan = useCallback(async (): Promise<ScanSummary> => {
    const summary = await tauriApi.pickAndScanFolder();
    if (summary.imported_notes.length > 0) {
      setNotes(summary.imported_notes);
      void tauriApi.getCategories().then(setCategories);
    }
    return summary;
  }, []);

  return {
    notes,
    categories,
    shelves,
    state,
    reload: load,
    create,
    patch,
    remove,
    restore,
    moveCategory,
    deleteCategory,
    createCategory,
    reorderNote,
    importNoteFile,
    scanFolder,
    pickAndScan,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
