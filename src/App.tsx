import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { NoteItem } from "./api/tauriBridge";
import { tauriApi } from "./api/tauriBridge";
import { BentoCanvas } from "./components/BentoCanvas";
import { ContextMenu } from "./components/ContextMenu";
import { CategoryMenu } from "./components/CategoryMenu";
import { setMarkdownBaseDir } from "./lib/format";
import { applyShortcutSettings } from "./lib/shortcuts";
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

export function getAdaptiveMinDrawerWidth(): number {
  // Screen-Adaptive Minimum Threshold: 360px on compact screens, 420px on standard/high-res displays
  return window.innerWidth <= 1280 ? 360 : 420;
}

function getStoredDrawerWidth(): number {
  const minW = getAdaptiveMinDrawerWidth();
  const maxW = Math.max(minW, window.innerWidth - 100);
  try {
    const raw = localStorage.getItem("doit.drawer_width");
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 300) {
        return Math.max(minW, Math.min(maxW, parsed));
      }
    }
  } catch {
    /* ignore */
  }
  return Math.max(minW, Math.min(640, Math.round(window.innerWidth * 0.42)));
}

export default function App() {
  const workspace = useWorkspace();
  const { notes, shelves, state, create, patch, remove, restore, moveCategory, deleteCategory, createCategory, renameCategory, reorderNote } = workspace;

  const canvasRef = useRef<HTMLElement | null>(null);
  const deletedRef = useRef<NoteItem[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<OpenNote | null>(null);
  const [drawerWidth, setDrawerWidth] = useState<number>(getStoredDrawerWidth);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: NoteItem } | null>(null);
  const [categoryMenu, setCategoryMenu] = useState<{ x: number; y: number; shelf: string } | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [sheetReserve, setSheetReserve] = useState(false);
  const wasSheetOpen = useRef(false);
  const [isSettings, setIsSettings] = useState(false);
  const [mini] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);
  const [toast, setToast] = useState<Toast | null>(null);
  const [themeMode, setThemeMode] = useState<"glass" | "monochrome">("glass");
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const toastTimer = useRef(0);
  const deepLinkUsed = useRef(false);

  // Background update check. It never blocks the UI, but GitHub's release CDN sometimes needs 10s+ for the
  // TLS handshake: one 3s attempt silently missed updates for 6 hours. So retry with growing patience.
  const checkForUpdate = useCallback(async (timeoutMs: number): Promise<"found" | "none" | "error"> => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "error";
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check({ timeout: timeoutMs });
      if (update && update.available) {
        setAvailableUpdate({
          version: update.version,
          currentVersion: update.currentVersion,
          notes: update.body,
          date: update.date,
          onInstall: async (onProgress) => {
            let total = 0;
            let done = 0;
            await update.downloadAndInstall((event) => {
              if (event.event === "Started") {
                total = event.data.contentLength ?? 0;
                onProgress(total ? 0 : null);
              } else if (event.event === "Progress") {
                done += event.data.chunkLength;
                onProgress(total ? Math.min(100, Math.round((done / total) * 100)) : null);
              } else if (event.event === "Finished") {
                onProgress(100);
              }
            });
            await tauriApi.restartApp();
          },
          onDismiss: () => setAvailableUpdate(null),
        });
        return "found";
      }
      return "none";
    } catch {
      return "error";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const attempts = [
      { delay: 1200, timeout: 15000 },
      { delay: 25000, timeout: 30000 },
      { delay: 120000, timeout: 30000 },
      { delay: 600000, timeout: 30000 },
    ];
    const run = (i: number) => {
      if (cancelled || i >= attempts.length) return;
      timers.push(
        window.setTimeout(async () => {
          if (cancelled) return;
          if ((await checkForUpdate(attempts[i].timeout)) === "error") run(i + 1);
        }, attempts[i].delay),
      );
    };
    run(0);
    // long-running sessions (tray mode) also re-check every 6 hours
    const interval = window.setInterval(() => {
      void checkForUpdate(30000);
    }, 6 * 60 * 60 * 1000);

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(interval);
    };
  }, [checkForUpdate]);

  useEffect(() => {
    void tauriApi.getSettings().then((s) => {
      setMarkdownBaseDir(s.storage_path);
      applyShortcutSettings(s);
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

  useEffect(() => {
    wasSheetOpen.current = !!openNote;
    if (!openNote) setSheetReserve(false);
  }, [openNote]);

  // The canvas can be swapped for a blank page while in tray mode: confirm each (re)load so it is revealed
  useEffect(() => {
    void tauriApi.canvasReady();
  }, []);

  useEffect(() => {
    const onManualCheck = async () => {
      const result = await checkForUpdate(30000);
      if (result === "none") notify("You are on the latest version.");
      else if (result === "error") notify("Could not reach the update server. Try again in a moment.");
    };
    window.addEventListener("doit:check-updates", onManualCheck);
    return () => window.removeEventListener("doit:check-updates", onManualCheck);
  }, [checkForUpdate, notify]);

  // ---- External files (double-click in Explorer / "Open with DoIT"): opened in place, never copied ----
  const openExternal = useCallback(
    async (path: string) => {
      try {
        const note = await tauriApi.openExternalFile(path);
        setIsSettings(false);
        setSheetClosing(false);
        setOpenNote({ note, origin: originFromCanvas() });
      } catch (err: any) {
        notify(typeof err === "string" ? err : err?.message || "Could not open that file.");
      }
    },
    [notify, originFromCanvas],
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("open-external-file", (event) => {
        void openExternal(event.payload);
      }).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      }),
    ).catch(() => undefined);
    void tauriApi.takeLaunchFile().then((path) => {
      if (path && !cancelled) void openExternal(path);
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [openExternal]);

  const openTile = useCallback((note: NoteItem, rect: DOMRect) => {
    setSheetClosing(false);
    setOpenNote({ note, origin: rect });
  }, []);

  const newNote = useCallback(
    (shelf?: string) => {
      const target = shelf ?? active ?? shelves[0] ?? "Uncategorized";
      const created = create(target);
      setSheetClosing(false);
      setOpenNote({ note: created, origin: originFromCanvas() });
      if (shelf) setActive(shelf);
    },
    [active, create, shelves, originFromCanvas],
  );

  const closeSheet = useCallback(() => {
    const id = openNote?.note.id;
    setSheetClosing(false);
    setOpenNote(null);
    if (!id) return;
    requestAnimationFrame(() => {
      const tile = document.querySelector<HTMLElement>(`[data-note-id="${id}"]`);
      tile?.focus({ preventScroll: true });
    });
  }, [openNote]);

  const commitSheet = useCallback(
    (next: NoteItem) => {
      // External files are written only by the explicit Save button, never by autosave
      if (next.source_path) {
        setOpenNote((prev) => (prev && prev.note.id === next.id ? { ...prev, note: next } : prev));
        return;
      }
      patch(next);
      setOpenNote((prev) => (prev && prev.note.id === next.id ? { ...prev, note: next } : prev));
    },
    [patch],
  );

  const deleteNote = useCallback(
    (note: NoteItem) => {
      remove(note.id);
      setSheetClosing(false);
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
      setSheetClosing(false);
      setOpenNote({ note: imported, origin: originFromCanvas() });
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "";
      if (msg && !msg.toLowerCase().includes("cancelled")) {
        notify(msg);
      }
    }
  }, [workspace, notify, originFromCanvas]);

  const handleScanFolder = useCallback(async () => {
    try {
      const summary = await workspace.pickAndScan();
      notify(`Imported ${summary.imported_count} notes (${summary.total_scanned} scanned)`);
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "";
      if (msg && !msg.toLowerCase().includes("cancelled")) {
        notify(msg);
      }
    }
  }, [workspace, notify]);

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
          onCategoryContextMenu={(event, shelf) => setCategoryMenu({ x: event.clientX, y: event.clientY, shelf })}
          onImportFile={handleImportNote}
          onScanFolder={handleScanFolder}
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
                locked={false}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
                onOpen={openTile}
                onNewNote={newNote}
                onNewCategory={(name) => {
                  void createCategory(name);
                  setActive(name);
                }}
                onToggleItem={toggleItem}
                onMoveCategory={(id, shelf) => void moveCategory(id, shelf)}
                onDeleteCategory={(cat) => void deleteCategory(cat)}
                onCategoryContextMenu={(event, shelf) => setCategoryMenu({ x: event.clientX, y: event.clientY, shelf })}
                onReorderNotes={(shelf, activeId, overId) => reorderNote(shelf, activeId, overId)}
                onContextMenu={(event, note) => setContextMenu({ x: event.clientX, y: event.clientY, note })}
              />
            )}
            </div>
          </main>

          {/* Right-side sliding editor drawer: reserves space so the dashboard stays visible + interactive */}
          <aside
            className="relative shrink-0 overflow-visible"
            style={{
              width: openFresh && openNote && sheetReserve && !sheetClosing ? drawerWidth : 0,
              marginLeft: openFresh && openNote && sheetReserve && !sheetClosing ? 12 : 0,
              transition: sheetClosing
                ? "width 300ms ease-out, margin-left 300ms ease-out"
                : "width 460ms cubic-bezier(0.32, 0.72, 0, 1), margin-left 460ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {openFresh && openNote && (
              <NoteSheet
                key={openFresh.id}
                note={openFresh}
                origin={openNote.origin}
                canvas={canvasRef.current}
                shelves={shelves}
                instant={wasSheetOpen.current}
                width={drawerWidth}
                onResizeWidth={setDrawerWidth}
                onClosing={() => setSheetClosing(true)}
                onOpening={() => setSheetReserve(true)}
                onCommit={commitSheet}
                onClose={closeSheet}
                onDelete={deleteNote}
              />
            )}
          </aside>
        </div>
      </div>

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

      {categoryMenu && (
        <CategoryMenu
          x={categoryMenu.x}
          y={categoryMenu.y}
          shelf={categoryMenu.shelf}
          onClose={() => setCategoryMenu(null)}
          onDelete={(shelf) => {
            setCategoryMenu(null);
            void deleteCategory(shelf);
          }}
          onRename={async (shelf, newName) => {
            const err = await renameCategory(shelf, newName);
            if (!err) {
              setActive((cur) => (cur === shelf ? newName : cur));
              setCollapsed((prev) => {
                if (!(shelf in prev)) return prev;
                const { [shelf]: was, ...rest } = prev;
                return { ...rest, [newName]: was };
              });
            }
            return err;
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
