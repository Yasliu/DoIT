import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NoteItem } from "../../api/tauriBridge";
import { tauriApi } from "../../api/tauriBridge";
import { useWorkspace } from "../../hooks/useWorkspace";
import { dismissBootScreen } from "../../lib/bootScreen";
import { contentToMarkdown, setMarkdownBaseDir } from "../../lib/format";
import { applyShortcutSettings, canvasShortcut } from "../../lib/shortcuts";
import { cleanText } from "../../lib/text";
import { APP_VERSION } from "../../lib/version";
import { applyThemeSettings, isLinux } from "../../platform";
import { cn } from "@/lib/utils";
import { Btn, Menu, Toast, type MenuItem } from "../ui";
import { NoteGrid } from "./NoteGrid";
import { noteMenuItems } from "./noteMenu";
import { NoteSheet } from "./NoteSheet";
import { Overview } from "./Overview";
import { ReleaseLog } from "./ReleaseLog";
import { Settings } from "./Settings";
import { EditShelfDialog, NewShelfDialog } from "./ShelfDialogs";
import { ShelfIndex, type CanvasView } from "./ShelfIndex";
import { ShelfPicker } from "./ShelfPicker";
import { Spotlight } from "./Spotlight";
import { TopBar } from "./TopBar";
import { UpdateCard, type UpdateInfo } from "./UpdateCard";

interface Toasted {
  id: number;
  message: string;
  undo?: () => void;
}

/** The settled view shows every note whatever the shelves' collapsed state. */
const NOTHING_COLLAPSED: Record<string, boolean> = {};
const VERSION_TRACKER_KEY = "doit.release_notes_version";

function isVersionLower(current: string | null, target: string): boolean {
  if (!current) return true;
  const c = current.replace(/^v/, "").split(".").map(Number);
  const t = target.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(c.length, t.length, 4); i++) {
    if ((c[i] || 0) < (t[i] || 0)) return true;
    if ((c[i] || 0) > (t[i] || 0)) return false;
  }
  return false;
}

/** 360px on compact screens, 420px on larger ones. */
function minDrawerWidth(): number {
  return window.innerWidth <= 1280 ? 360 : 420;
}

function storedDrawerWidth(): number {
  const minW = minDrawerWidth();
  const maxW = Math.max(minW, window.innerWidth - 64 - 480);
  try {
    const parsed = parseInt(localStorage.getItem("doit.drawer_width") ?? "", 10);
    if (parsed >= 300) return Math.max(minW, Math.min(maxW, parsed));
  } catch {
    /* ignore */
  }
  return Math.max(minW, Math.min(660, Math.round(window.innerWidth * 0.42)));
}

const errorText = (err: any) => (typeof err === "string" ? err : err?.message || "");

/** The canvas window: the shelf index, the grid of notes, the editor drawer, and the bars around them. */
export default function Canvas() {
  const workspace = useWorkspace();
  const { notes, shelves, state, create, patch, remove, restore, moveCategory, deleteCategory, createCategory, renameCategory, reorderNote } = workspace;

  const deletedRef = useRef<NoteItem[]>([]);
  const [view, setView] = useState<CanvasView>({ kind: "shelf", shelf: null });
  const [dialog, setDialog] = useState<null | "search" | "new-note" | "new-shelf">(null);
  const [shelfAction, setShelfAction] = useState<{ kind: "move" | "copy"; note: NoteItem } | null>(null);
  const [openNote, setOpenNote] = useState<NoteItem | null>(null);
  const [isNoteMaximized, setIsNoteMaximized] = useState(false);
  const [isVerticalScreen, setIsVerticalScreen] = useState(() => window.innerHeight > window.innerWidth);
  const [isResizingSheet, setIsResizingSheet] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState<number>(storedDrawerWidth);
  const [noteMenu, setNoteMenu] = useState<{ x: number; y: number; note: NoteItem } | null>(null);
  const [shelfMenu, setShelfMenu] = useState<{ x: number; y: number; shelf: string } | null>(null);
  const [editShelf, setEditShelf] = useState<string | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const wasSheetOpen = useRef(false);
  const [railOpen, setRailOpen] = useState(true);
  const [toast, setToast] = useState<Toasted | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [showReleaseLog, setShowReleaseLog] = useState(false);
  const toastTimer = useRef(0);
  const deepLinkUsed = useRef(false);

  const active = view.kind === "shelf" ? view.shelf : null;
  const showShelf = (shelf: string | null) => setView({ kind: "shelf", shelf });

  // The page can mount before GTK has given the window its real size: re-fit the default drawer
  // width as the window sizes (a width the user dragged stays).
  useEffect(() => {
    if (!isLinux) return;
    const fit = () => setDrawerWidth(storedDrawerWidth());
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Background update check. GitHub's release CDN sometimes needs 10s+ for the TLS handshake, so
  // retry with growing patience.
  const checkForUpdate = useCallback(async (timeoutMs: number): Promise<"found" | "none" | "unsupported" | "error" | "store"> => {
    if (await tauriApi.isMsStorePackage()) return "store";
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
          // Installed by the backend, which can install an rpm the way Fedora's RPM accepts it.
          onInstall: async (onProgress) => {
            onProgress(0);
            await tauriApi.installUpdate(update.rid, onProgress);
            await tauriApi.restartApp();
          },
          onDismiss: () => setAvailableUpdate(null),
        });
        return "found";
      }
      return "none";
    } catch (err) {
      // A newer release exists but ships no package for this OS yet: retrying fails the same way.
      if (/platforms?` object/.test(String(err))) return "unsupported";
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
    // Long sessions (the dock) re-check every 6 hours.
    const interval = window.setInterval(() => void checkForUpdate(30000), 6 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(interval);
    };
  }, [checkForUpdate]);

  const closeReleaseLog = useCallback(() => {
    setShowReleaseLog(false);
    try {
      sessionStorage.setItem("doit.release_notes_seen", APP_VERSION);
      localStorage.setItem(VERSION_TRACKER_KEY, APP_VERSION);
      void tauriApi.patchSettings({ last_seen_version: APP_VERSION });
    } catch {
      /* ignore */
    }
  }, []);

  // The release log shows once after an upgrade; a fresh install only records the version.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("doit.release_notes_seen") === APP_VERSION) return;
    } catch {
      /* ignore storage errors */
    }
    void tauriApi.getSettings().then((s) => {
      try {
        const localSeen = localStorage.getItem(VERSION_TRACKER_KEY);
        const diskSeen = s.last_seen_version;
        const record = () => {
          localStorage.setItem(VERSION_TRACKER_KEY, APP_VERSION);
          sessionStorage.setItem("doit.release_notes_seen", APP_VERSION);
          void tauriApi.patchSettings({ last_seen_version: APP_VERSION });
        };
        if (!diskSeen && !localSeen) return record();
        const previous = diskSeen || localSeen;
        if (previous && isVersionLower(previous, APP_VERSION)) {
          setShowReleaseLog(true);
          record();
        } else {
          sessionStorage.setItem("doit.release_notes_seen", APP_VERSION);
          if (!diskSeen) void tauriApi.patchSettings({ last_seen_version: APP_VERSION });
        }
      } catch {
        /* ignore storage errors */
      }
    });
  }, []);

  useEffect(() => {
    void tauriApi.getSettings().then((s) => {
      setMarkdownBaseDir(s.storage_path);
      applyShortcutSettings(s);
      applyThemeSettings(s);
    });
  }, []);

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    deletedRef.current = [];
    setToast(null);
  }, []);

  const notify = useCallback((message: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = window.setTimeout(() => {
      deletedRef.current = [];
      setToast(null);
    }, 6200);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const open = useCallback((note: NoteItem, maximize = false) => {
    setIsNoteMaximized(maximize);
    setSheetClosing(false);
    setOpenNote(note);
  }, []);

  // Deep link: ?note=<id> opens a note straight away (handy for previews).
  useEffect(() => {
    if (deepLinkUsed.current || !notes.length || openNote) return;
    deepLinkUsed.current = true;
    const wanted = new URLSearchParams(window.location.search).get("note");
    const match = wanted ? notes.find((note) => note.id === wanted) : undefined;
    if (match) setOpenNote(match);
  }, [notes, openNote]);

  useEffect(() => {
    wasSheetOpen.current = !!openNote;
  }, [openNote]);

  useEffect(() => {
    if (state !== "loading") dismissBootScreen();
  }, [state]);

  // The canvas can be swapped for a blank page in the dock: confirm each (re)load so it is revealed.
  useEffect(() => {
    void tauriApi.canvasReady();
  }, []);

  useEffect(() => {
    const onManualCheck = async () => {
      const result = await checkForUpdate(30000);
      if (result === "store") notify("Updates are managed by the Microsoft Store.");
      else if (result === "none") notify("You are on the latest version.");
      else if (result === "unsupported") notify("A newer DoIT is out, but there is no package for this system yet.");
      else if (result === "error") notify("Could not reach the update server. Try again in a moment.");
    };
    const onShowReleaseLog = () => setShowReleaseLog(true);
    window.addEventListener("doit:check-updates", onManualCheck);
    window.addEventListener("doit:show-release-log", onShowReleaseLog);
    return () => {
      window.removeEventListener("doit:check-updates", onManualCheck);
      window.removeEventListener("doit:show-release-log", onShowReleaseLog);
    };
  }, [checkForUpdate, notify]);

  // Files opened from the file manager ("Open with DoIT") are edited in place, never copied.
  const openExternal = useCallback(
    async (path: string) => {
      try {
        const note = await tauriApi.openExternalFile(path);
        if (view.kind === "settings") showShelf(null);
        open(note);
      } catch (err: any) {
        notify(errorText(err) || "Could not open that file.");
      }
    },
    [notify, open, view.kind],
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<string>("open-external-file", (event) => void openExternal(event.payload)).then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        }),
      )
      .catch(() => undefined);
    // Taking the path consumes it, so open it even if this effect was already cleaned up.
    void tauriApi.takeLaunchFile().then((path) => {
      if (path) void openExternal(path);
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [openExternal]);

  useEffect(() => {
    const onResize = () => setIsVerticalScreen(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const newNote = useCallback(
    (shelf?: string) => {
      const target = shelf ?? active ?? shelves.find((s) => s.toLowerCase() !== "uncategorized") ?? shelves[0] ?? "Uncategorized";
      const created = create(target);
      open(created);
      if (shelf) showShelf(shelf);
    },
    [active, create, shelves, open],
  );

  /** Without a shelf, ask which one; a given shelf creates the note straight away. */
  const requestNewNote = useCallback(
    (shelf?: string) => {
      if (view.kind !== "shelf") showShelf(active);
      if (!shelf) setDialog("new-note");
      else newNote(shelf);
    },
    [newNote, view.kind, active],
  );

  const closeSheet = useCallback(() => {
    setIsNoteMaximized(false);
    const id = openNote?.id;
    setSheetClosing(false);
    setOpenNote(null);
    if (!id) return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-note-id="${id}"]`)?.focus({ preventScroll: true }));
  }, [openNote]);

  const commitSheet = useCallback(
    (next: NoteItem) => {
      // Files opened in place are written only by the Save button, never by autosave.
      if (!next.source_path) patch(next);
      setOpenNote((prev) => (prev && prev.id === next.id ? next : prev));
    },
    [patch],
  );

  const deleteNote = useCallback(
    (note: NoteItem) => {
      remove(note.id);
      setIsNoteMaximized(false);
      setSheetClosing(false);
      setOpenNote(null);
      deletedRef.current = [...deletedRef.current, note];
      const count = deletedRef.current.length;
      notify(count > 1 ? `${count} notes deleted.` : "Note deleted.", () => {
        deletedRef.current.forEach((entry) => restore(entry));
        deletedRef.current = [];
      });
    },
    [remove, restore, notify],
  );

  /** Saves a note that was just settled or brought back, with a way to change your mind. */
  const applySettled = useCallback(
    (next: NoteItem) => {
      patch(next, true);
      notify(next.is_settled ? "Settled. Search still finds it." : "Back on its shelf.", () => patch({ ...next, is_settled: !next.is_settled }, true));
    },
    [patch, notify],
  );
  const toggleSettled = useCallback((note: NoteItem) => applySettled({ ...note, is_settled: !note.is_settled }), [applySettled]);

  const toggleItem = useCallback(
    (note: NoteItem, itemId: string) =>
      patch({ ...note, content: note.content.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item)), last_edited: Date.now() }),
    [patch],
  );

  const { collapsed, toggleCollapsed } = workspace;

  const toDock = useCallback(() => void tauriApi.openTrayMode(Boolean(openNote), openNote?.id), [openNote]);

  const importNote = useCallback(async () => {
    try {
      const imported = await workspace.importNoteFile();
      notify(`Imported: ${imported.title || "Untitled"}`);
      open(imported);
    } catch (err: any) {
      const msg = errorText(err);
      if (msg && !msg.toLowerCase().includes("cancelled")) notify(msg);
    }
  }, [workspace, notify, open]);

  /** Imports one file onto `shelf` (made first when `created`), then opens it. */
  const importFileInto = useCallback(
    async (shelf: string, created: boolean) => {
      setDialog(null);
      try {
        const imported = await workspace.importNoteFile();
        if (created) await createCategory(shelf);
        if (imported.category !== shelf) await moveCategory(imported.id, shelf);
        notify(`Imported “${imported.title || "Untitled"}” into ${shelf}.`);
        showShelf(active);
        open({ ...imported, category: shelf });
      } catch (err: any) {
        const msg = errorText(err);
        if (msg && !msg.toLowerCase().includes("cancelled")) notify(msg);
      }
    },
    [workspace, createCategory, moveCategory, notify, open, active],
  );

  /** Imports a folder as a shelf, named `name` or after the folder. */
  const importFolderShelf = useCallback(
    async (name: string, mark: string | null) => {
      setDialog(null);
      try {
        // Unpicked, the mark stays a suggestion from the name and nothing is saved.
        const result = await workspace.importFolderAsShelf(name || undefined, mark);
        showShelf(result.shelf);
        const n = result.imported_count;
        notify(`Imported ${n} note${n === 1 ? "" : "s"} into ${result.shelf}.`);
      } catch (err: any) {
        const msg = errorText(err);
        if (msg && !msg.toLowerCase().includes("cancelled")) notify(msg);
      }
    },
    [workspace, notify],
  );

  const deskNotes = useMemo(() => notes.filter((note) => !note.is_settled), [notes]);
  const settledNotes = useMemo(() => notes.filter((note) => note.is_settled), [notes]);
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    deskNotes.forEach((note) => {
      const key = note.category || "Uncategorized";
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [deskNotes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = canvasShortcut(event);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "new-note") {
        if (!openNote) requestNewNote();
      } else if (shortcut === "search") {
        setDialog((d) => (d === "search" ? null : "search"));
      } else if (shortcut === "import-file") {
        void importNote();
      } else if (shortcut === "dock") {
        toDock();
      } else {
        setView((v) => (v.kind === "settings" ? { kind: "shelf", shelf: null } : { kind: "settings" }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestNewNote, openNote, toDock, importNote]);

  const openFresh = openNote ? (notes.find((note) => note.id === openNote.id) ?? openNote) : null;
  const isVertical = isVerticalScreen || window.innerWidth < 640;
  const isMaxClosing = sheetClosing && isNoteMaximized;
  const drawerOpen = !!openFresh && !sheetClosing;


  const shelfMenuItems = (shelf: string): MenuItem[] => [
    { key: "open", glyph: "→", label: "open", run: () => showShelf(shelf) },
    { key: "new", glyph: "+", label: "new note here", run: () => newNote(shelf) },
    { key: "edit", glyph: "✎", label: "edit shelf…", run: () => setEditShelf(shelf) },
    { key: "collapse", glyph: collapsed[shelf] ? "▾" : "▸", label: collapsed[shelf] ? "expand" : "collapse", run: () => toggleCollapsed(shelf) },
    {
      key: "delete",
      glyph: "⌫",
      label: "delete shelf",
      danger: true,
      section: " ",
      run: () => {
        if (active === shelf) showShelf(null);
        void deleteCategory(shelf);
      },
    },
  ];

  const openShelfMenu = (event: React.MouseEvent, shelf: string) => {
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setShelfMenu({ x: event.clientX || r.left, y: event.clientY || r.bottom, shelf });
  };

  return (
    <div className="tm-shell flex h-full w-full flex-col overflow-hidden">
      <TopBar sidebarOpen={railOpen} onToggleSidebar={() => setRailOpen((v) => !v)} onOpenSearch={() => setDialog("search")} onDock={toDock} />

      <div className="flex min-h-0 flex-1">
        <ShelfIndex
          shelves={shelves}
          counts={counts}
          total={deskNotes.length}
          settledCount={settledNotes.length}
          view={view}
          open={railOpen}
          onView={setView}
          onNewShelf={() => setDialog("new-shelf")}
          onShelfMenu={openShelfMenu}
          onReorderShelves={workspace.reorderShelves}
        />

        <div className={cn("relative min-h-0 min-w-0 flex-1", isVertical ? "flex flex-col" : "flex")}>
          <main
            style={{
              contain: "layout paint",
              flex: isNoteMaximized && !isMaxClosing ? "0 0 0px" : "1 1 0%",
              opacity: isNoteMaximized && !isMaxClosing ? 0 : 1,
              pointerEvents: isNoteMaximized && !isMaxClosing ? "none" : "auto",
              transition: "opacity 200ms ease-out",
            }}
            className="relative h-full min-h-0 w-full min-w-0 overflow-hidden"
          >
            {view.kind === "settings" ? (
              <Settings onStoragePathChanged={() => void workspace.reload()} />
            ) : view.kind === "overview" ? (
              <Overview notes={notes} shelves={shelves} />
            ) : state === "error" ? (
              <div className="flex h-full flex-col items-start justify-center px-[6ch]">
                <p className="text-[18px] font-semibold">The workspace did not open.</p>
                <p className="mt-2 max-w-[60ch] text-graph-muted">The local store could not be read. Nothing has been written over it.</p>
                <Btn onClick={() => void workspace.reload()} className="mt-5">
                  try again
                </Btn>
              </div>
            ) : (
              <NoteGrid
                notes={view.kind === "settled" ? settledNotes : deskNotes}
                shelves={shelves}
                active={active}
                settledView={view.kind === "settled"}
                onToggleSettled={toggleSettled}
                loading={state === "loading"}
                collapsed={view.kind === "settled" ? NOTHING_COLLAPSED : collapsed}
                onToggleCollapse={toggleCollapsed}
                onOpen={(note, _rect, maximize) => open(note, maximize)}
                onNewNote={requestNewNote}
                onToggleItem={toggleItem}
                onMoveCategory={(id, shelf) => void moveCategory(id, shelf)}
                onCopyToShelf={(note, shelf) => {
                  workspace.copyNote(note, shelf);
                  notify(`Copied to ${shelf}.`);
                }}
                onShelfMenu={openShelfMenu}
                onReorderNotes={(shelf, activeId, overId) => reorderNote(shelf, activeId, overId)}
                onContextMenu={(event, note) => setNoteMenu({ x: event.clientX, y: event.clientY, note })}
              />
            )}
          </main>

          {/* The editor drawer reserves its space, so the canvas stays visible and usable beside it. */}
          <aside
            className={cn(
              "min-h-0 min-w-0 shrink-0 overflow-hidden",
              isMaxClosing ? "pointer-events-none absolute inset-0 z-30" : isNoteMaximized ? "relative h-full w-full flex-1" : "relative",
            )}
            style={{
              width: isMaxClosing ? undefined : isNoteMaximized || isVertical ? "100%" : drawerOpen ? drawerWidth : 0,
              height: isMaxClosing ? undefined : isNoteMaximized ? "100%" : isVertical ? (drawerOpen ? "54vh" : 0) : "100%",
              padding: drawerOpen || isMaxClosing ? 12 : 0,
              paddingLeft: !isVertical && !isNoteMaximized && drawerOpen ? 4 : undefined,
              transition: isResizingSheet || isMaxClosing ? "none" : `${isVertical ? "height" : "width"} ${sheetClosing ? 240 : 300}ms var(--ease), padding 200ms var(--ease)`,
            }}
          >
            {openFresh && (
              <NoteSheet
                key={openFresh.id}
                note={openFresh}
                shelves={shelves}
                instant={wasSheetOpen.current}
                width={isNoteMaximized || isVertical ? undefined : drawerWidth}
                onResizeWidth={setDrawerWidth}
                onResizeStateChange={setIsResizingSheet}
                isMaximized={isNoteMaximized}
                onToggleMaximize={() => setIsNoteMaximized((v) => !v)}
                isBottomMode={isVertical}
                onClosing={() => setSheetClosing(true)}
                onCommit={commitSheet}
                onClose={closeSheet}
                onDelete={deleteNote}
                onSettledChange={applySettled}
              />
            )}
          </aside>
        </div>
      </div>

      {noteMenu && (
        <Menu
          at={{ x: noteMenu.x, y: noteMenu.y }}
          onClose={() => setNoteMenu(null)}
          items={noteMenuItems({
            settled: !!noteMenu.note.is_settled,
            onOpen: () => open(noteMenu.note),
            onOpenFull: () => open(noteMenu.note, true),
            onToggleSettled: noteMenu.note.source_path ? undefined : () => toggleSettled(noteMenu.note),
            onMove: () => setShelfAction({ kind: "move", note: noteMenu.note }),
            onCopy: () => setShelfAction({ kind: "copy", note: noteMenu.note }),
            onCopyText: () =>
              navigator.clipboard.writeText(contentToMarkdown(noteMenu.note.content)).then(
                () => notify("Copied the note's text."),
                () => notify("Could not copy that note."),
              ),
            onDelete: () => deleteNote(noteMenu.note),
          })}
        />
      )}

      {shelfMenu && <Menu at={{ x: shelfMenu.x, y: shelfMenu.y }} onClose={() => setShelfMenu(null)} items={shelfMenuItems(shelfMenu.shelf)} />}

      {shelfAction && (
        <ShelfPicker
          title={shelfAction.kind === "move" ? "move note" : "copy note"}
          placeholder={`${shelfAction.kind === "move" ? "move" : "copy"} “${cleanText(shelfAction.note.title) || "untitled"}” to…`}
          shelves={shelves}
          current={active}
          exclude={shelfAction.kind === "move" ? shelfAction.note.category || "Uncategorized" : undefined}
          onClose={() => setShelfAction(null)}
          onPick={({ shelf, created }) => {
            const { kind, note } = shelfAction;
            setShelfAction(null);
            void (async () => {
              if (created) await createCategory(shelf);
              if (kind === "move") {
                await moveCategory(note.id, shelf);
                notify(`Moved to ${shelf}.`);
              } else {
                workspace.copyNote(note, shelf);
                notify(`Copied to ${shelf}.`);
              }
            })();
          }}
        />
      )}

      {editShelf && (
        <EditShelfDialog
          shelf={editShelf}
          onClose={() => setEditShelf(null)}
          onRename={async (shelf, next) => {
            const err = await renameCategory(shelf, next);
            if (!err && active === shelf) showShelf(next);
            return err;
          }}
          onDelete={(shelf) => {
            setEditShelf(null);
            if (active === shelf) showShelf(null);
            void deleteCategory(shelf);
          }}
        />
      )}

      {toast && <Toast key={toast.id} message={toast.message} undo={toast.undo} onDismiss={dismissToast} />}

      {dialog === "search" && (
        <Spotlight
          notes={notes}
          shelves={shelves}
          onClose={() => setDialog(null)}
          onOpenNote={(note) => {
            if (view.kind === "settings" || view.kind === "overview") showShelf(null);
            open(note);
          }}
          onOpenShelf={showShelf}
          onNewNote={() => setDialog("new-note")}
          onNewShelf={() => setDialog("new-shelf")}
          onOverview={() => setView({ kind: "overview" })}
          onSettings={() => setView({ kind: "settings" })}
          onDock={toDock}
        />
      )}
      {dialog === "new-note" && (
        <ShelfPicker
          title="new note"
          placeholder="new note in…"
          shelves={shelves}
          current={active}
          onClose={() => setDialog(null)}
          onPick={({ shelf, created }) => {
            setDialog(null);
            void (async () => {
              if (created) await createCategory(shelf);
              newNote(shelf);
            })();
          }}
          secondary={{ label: "import a file here", key: "o", run: ({ shelf, created }) => void importFileInto(shelf, created) }}
        />
      )}
      {dialog === "new-shelf" && (
        <NewShelfDialog
          shelves={shelves}
          onClose={() => setDialog(null)}
          onCreate={(name, mark) => {
            setDialog(null);
            void createCategory(name, mark);
            showShelf(name);
          }}
          onImportFolder={(name, mark) => void importFolderShelf(name, mark)}
        />
      )}

      {availableUpdate && <UpdateCard info={availableUpdate} />}
      {showReleaseLog && <ReleaseLog onClose={closeReleaseLog} />}
    </div>
  );
}
