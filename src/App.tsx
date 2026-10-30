import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { NoteItem } from "./api/tauriBridge";
import { tauriApi } from "./api/tauriBridge";
import { BentoCanvas } from "./components/BentoCanvas";
import { ContextMenu } from "./components/ContextMenu";
import { NoteSheet } from "./components/NoteSheet";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { UpdateInfo, UpdateModal } from "./components/UpdateModal";
import { useWorkspace } from "./hooks/useWorkspace";

interface OpenNote {
  note: NoteItem;
  origin: DOMRect;
}

interface Toast {
  id: number;
  message: string;
  undo?: NoteItem;
}

const COLLAPSE_KEY = "doit.collapsed";

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const workspace = useWorkspace();
  const { notes, shelves, state, create, patch, remove, restore, moveCategory, deleteCategory, createCategory, reorderNote } = workspace;

  const canvasRef = useRef<HTMLElement | null>(null);
  const deletedRef = useRef<NoteItem[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<OpenNote | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: NoteItem } | null>(null);
  const [isSettings, setIsSettings] = useState(false);
  const [mini] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);
  const [toast, setToast] = useState<Toast | null>(null);
  const [themeMode, setThemeMode] = useState<"glass" | "monochrome">("glass");
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const toastTimer = useRef(0);
  const deepLinkUsed = useRef(false);

  // Asynchronous non-blocking update check on boot
  useEffect(() => {
    let cancelled = false;
    const checkUpdate = async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update && update.available && !cancelled) {
          setAvailableUpdate({
            version: update.version,
            currentVersion: update.currentVersion,
            notes: update.body,
            date: update.date,
            onInstall: async () => {
              await update.downloadAndInstall();
              await tauriApi.restartApp();
            },
            onDismiss: () => setAvailableUpdate(null),
          });
        }
      } catch (err) {
        console.info("Update check completed:", err);
      }
    };

    const timer = window.setTimeout(() => {
      void checkUpdate();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    void tauriApi.getSettings().then((s) => {
      if (s.theme_mode) {
        setThemeMode(s.theme_mode as "glass" | "monochrome");
        document.documentElement.dataset.theme = s.theme_mode;
      }
    });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    deletedRef.current = [];
    setToast(null);
  }, []);

  const notify = useCallback(
    (message: string, undo?: NoteItem) => {
      window.clearTimeout(toastTimer.current);
      setToast({ id: Date.now(), message, undo });
      toastTimer.current = window.setTimeout(() => {
        deletedRef.current = [];
        setToast(null);
      }, 6200);
    },
    [],
  );

  const originFromCanvas = useCallback((): DOMRect => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const width = 320;
    const height = 176;
    const left = (bounds?.left ?? 0) + ((bounds?.width ?? window.innerWidth) - width) / 2;
    const top = (bounds?.top ?? 0) + 96;
    return new DOMRect(left, top, width, height);
  }, []);

  // Deep link: ?note=<id> opens a note straight away (handy for previews).
  useEffect(() => {
    if (deepLinkUsed.current || !notes.length || openNote) return;
    const wanted = new URLSearchParams(window.location.search).get("note");
    if (!wanted) {
      deepLinkUsed.current = true;
      return;
    }
    const match = notes.find((note) => note.id === wanted);
    deepLinkUsed.current = true;
    if (match) setOpenNote({ note: match, origin: originFromCanvas() });
  }, [notes, openNote, originFromCanvas]);

  const openTile = useCallback((note: NoteItem, rect: DOMRect) => {
    setOpenNote({ note, origin: rect });
  }, []);

  const newNote = useCallback(
    (shelf?: string) => {
      const target = shelf ?? active ?? (shelves.includes("Architecture") ? "Architecture" : shelves[0] ?? "Architecture");
      const created = create(target);
      setOpenNote({ note: created, origin: originFromCanvas() });
      if (shelf) setActive(shelf);
    },
    [active, create, shelves, originFromCanvas],
  );

  const closeSheet = useCallback(() => {
    const id = openNote?.note.id;
    setOpenNote(null);
    if (!id) return;
    requestAnimationFrame(() => {
      const tile = document.querySelector<HTMLElement>(`[data-note-id="${id}"]`);
      tile?.focus({ preventScroll: true });
    });
  }, [openNote]);

  const commitSheet = useCallback(
    (next: NoteItem) => {
      patch(next);
      setOpenNote((prev) => (prev && prev.note.id === next.id ? { ...prev, note: next } : prev));
    },
    [patch],
  );

  const deleteNote = useCallback(
    (note: NoteItem) => {
      remove(note.id);
      setOpenNote(null);
      deletedRef.current = [...deletedRef.current, note];
      const count = deletedRef.current.length;
      notify(count > 1 ? `${count} notes deleted.` : "Note deleted.", note);
    },
    [remove, notify],
  );

  const toggleItem = useCallback(
    (note: NoteItem, itemId: string) => {
      patch({
        ...note,
        content: note.content.map((item) =>
          item.id === itemId ? { ...item, completed: !item.completed } : item,
        ),
        last_edited: Date.now(),
      });
    },
    [patch],
  );

  const toggleCollapse = useCallback((shelf: string) => {
    setCollapsed((prev) => ({ ...prev, [shelf]: !prev[shelf] }));
  }, []);

  const toggleMini = useCallback(() => {
    void tauriApi.openTrayMode();
  }, []);

  const handleImportNote = useCallback(async () => {
    try {
      const imported = await workspace.importNoteFile();
      notify(`Imported: ${imported.title || "Untitled"}`);
      setOpenNote({ note: imported, origin: originFromCanvas() });
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "";
      if (msg && !msg.toLowerCase().includes("cancelled")) {
        notify(msg);
      }
    }
  }, [workspace, notify, originFromCanvas]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    notes.forEach((note) => {
      const key = note.category || "Uncategorized";
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [notes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (isSettings) setIsSettings(false);
        if (!openNote) newNote();
      }
      if (meta && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void handleImportNote();
      }
      if (meta && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleMini();
      }
      if (meta && (event.key === "," || (event.key.toLowerCase() === "s" && event.shiftKey))) {
        event.preventDefault();
        setIsSettings((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNote, openNote, toggleMini, isSettings, handleImportNote]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const openFresh = openNote ? notes.find((note) => note.id === openNote.note.id) ?? openNote.note : null;

  return (
    <div data-theme={themeMode} className="chassis flex h-full w-full overflow-hidden">
      {!mini && (
        <Sidebar
          shelves={shelves}
          counts={counts}
          total={notes.length}
          active={isSettings ? "SETTINGS" : active}
          onSelect={(shelf) => {
            setIsSettings(false);
            setActive(shelf);
          }}
          onNew={() => {
            setIsSettings(false);
            newNote();
          }}
          onNewCategory={(name) => {
            void createCategory(name);
            setActive(name);
          }}
          open={railOpen}
          onToggle={() => setRailOpen((prev) => !prev)}
          onOpenSettings={() => setIsSettings((v) => !v)}
          isSettings={isSettings}
          onDeleteCategory={(cat) => void deleteCategory(cat)}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        <TitleBar
          query={query}
          onQuery={setQuery}
          mini={mini}
          onToggleMini={toggleMini}
          onOpenSettings={() => setIsSettings((v) => !v)}
          isSettings={isSettings}
        />

        <div className="flex min-h-0 flex-1 px-3 pb-3">
          <main ref={canvasRef} className="relative min-w-0 flex-1 overflow-hidden">
            <div aria-hidden="true" className="lightscape" />
            <div className="relative z-10 h-full">
            {isSettings ? (
              <div className="scroll relative h-full overflow-y-scroll" style={{ scrollbarGutter: "stable" }}>
                <SettingsPanel
                  onBack={() => setIsSettings(false)}
                  onStoragePathChanged={() => void workspace.reload()}
                  onThemeChanged={(mode) => setThemeMode(mode)}
                />
              </div>
            ) : state === "error" ? (
              <div className="flex h-full flex-col items-start justify-center px-10">
                <p className="text-[20px] tracking-[-0.02em] text-ink-2">The workspace did not open.</p>
                <p className="mt-2 max-w-[46ch] text-[12.5px] leading-relaxed text-ink-4">
                  The local store could not be read. Nothing has been written over it.
                </p>
                <button type="button" onClick={() => void workspace.reload()} className="btn mt-5">
                  Try again
                </button>
              </div>
            ) : (
              <BentoCanvas
                notes={notes}
                shelves={shelves}
                active={active}
                query={query}
                loading={state === "loading"}
                locked={!!openNote}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
                onOpen={openTile}
                onNewNote={newNote}
                onToggleItem={toggleItem}
                onMoveCategory={(id, shelf) => void moveCategory(id, shelf)}
                onDeleteCategory={(cat) => void deleteCategory(cat)}
                onReorderNotes={(shelf, activeId, overId) => reorderNote(shelf, activeId, overId)}
                onContextMenu={(event, note) => setContextMenu({ x: event.clientX, y: event.clientY, note })}
              />
            )}
            </div>
          </main>
        </div>
      </div>

      {openFresh && openNote && (
        <NoteSheet
          key={openFresh.id}
          note={openFresh}
          origin={openNote.origin}
          canvas={canvasRef.current}
          shelves={shelves}
          onCommit={commitSheet}
          onClose={closeSheet}
          onDelete={deleteNote}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          note={contextMenu.note}
          shelves={shelves}
          onClose={() => setContextMenu(null)}
          onDelete={(id) => {
            setContextMenu(null);
            remove(id);
            setToast({
              id: Date.now(),
              message: "Note deleted.",
              undo: contextMenu.note,
            });
          }}
          onMoveCategory={(id, shelf) => {
            setContextMenu(null);
            void moveCategory(id, shelf);
          }}
        />
      )}

      {toast && (
        <div
          key={toast.id}
          className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex justify-center"
        >
          <div className="glass pointer-events-auto relative flex h-11 items-center gap-3 overflow-hidden rounded-full pl-4 pr-1.5">
            <span className="text-[12px] text-ink-2">{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  deletedRef.current.forEach((entry) => restore(entry));
                  deletedRef.current = [];
                  dismissToast();
                }}
                className="h-7 rounded-full bg-white/[0.1] px-2.5 text-[11.5px] font-medium text-ink-1 transition-colors hover:bg-white/[0.16]"
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss"
              className="icon-btn !size-7"
            >
              <X size={12} />
            </button>
            <span
              className="absolute bottom-0 left-0 h-[1.5px] w-full origin-left bg-white/35"
              style={{ animation: "toast-life 6.2s linear forwards" }}
            />
          </div>
        </div>
      )}

      {availableUpdate && <UpdateModal info={availableUpdate} />}
    </div>
  );
}
