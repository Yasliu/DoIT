import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Plus, Search, X } from "lucide-react";
import type { NoteItem } from "../api/tauriBridge";
import { tauriApi } from "../api/tauriBridge";
import { Mark } from "./Mark";
import { springTo } from "../lib/spring";
import { accentFor, cx, relativeShort } from "../lib/text";

interface DeskWidgetProps {
  notes: NoteItem[];
  shelves: string[];
  onNewNote: () => void;
  onOpenNote: (note: NoteItem, rect: DOMRect) => void;
  onSelectShelf: (shelf: string) => void;
  onExpand: () => void;
  hidden?: boolean;
}

const POS_KEY = "doit.tray.pos";

function readPos(): { right: number; bottom: number } {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { right: number; bottom: number };
      if (Number.isFinite(parsed.right) && Number.isFinite(parsed.bottom)) {
        return {
          right: Math.max(10, Math.min(window.innerWidth - 70, parsed.right)),
          bottom: Math.max(10, Math.min(window.innerHeight - 60, parsed.bottom)),
        };
      }
    }
  } catch {
    /* fall through to default */
  }
  return { right: 22, bottom: 20 };
}

export function DeskWidget({
  notes,
  shelves,
  onNewNote,
  onOpenNote,
  onSelectShelf,
  onExpand,
  hidden = false,
}: DeskWidgetProps) {
  const [pos, setPos] = useState(readPos);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"menu" | "find">("menu");
  const [filter, setFilter] = useState("");

  const panel = useRef<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(
    null,
  );

  const show = () => {
    setMounted(true);
    setOpen(true);
  };

  const hide = () => {
    setOpen(false);
    setMode("menu");
    setFilter("");
  };

  useEffect(() => {
    const el = panel.current;
    if (!mounted || !el) return;

    const from = open ? 0 : 100;
    const to = open ? 100 : 0;
    el.style.transformOrigin = "bottom right";
    el.style.willChange = "transform, opacity";

    const cancel = springTo({
      from,
      to,
      tune: 64,
      onFrame: (value) => {
        const k = Math.max(0, Math.min(1.04, value / 100));
        el.style.transform = `translate3d(0, ${((1 - k) * 10).toFixed(2)}px, 0) scale(${(0.955 + 0.045 * k).toFixed(4)})`;
        el.style.opacity = `${Math.min(1, k * 1.18).toFixed(3)}`;
      },
      onDone: () => {
        if (!open) setMounted(false);
      },
    });

    return cancel;
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) hide();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    const onResize = () => {
      setPos((prev) => ({
        right: Math.max(10, Math.min(window.innerWidth - 70, prev.right)),
        bottom: Math.max(10, Math.min(window.innerHeight - 60, prev.bottom)),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const savePos = (next: { right: number; bottom: number }) => {
    setPos(next);
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const startDrag = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      right: pos.right,
      bottom: pos.bottom,
      moved: false,
    };

    const move = (pointer: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      const dx = pointer.clientX - state.x;
      const dy = pointer.clientY - state.y;
      if (!state.moved && Math.hypot(dx, dy) < 5) return;
      state.moved = true;
      document.body.style.cursor = "grabbing";
      savePos({
        right: Math.max(10, Math.min(window.innerWidth - 70, state.right - dx)),
        bottom: Math.max(10, Math.min(window.innerHeight - 60, state.bottom - dy)),
      });
    };

    const up = () => {
      const state = drag.current;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (state && !state.moved) {
        if (open) hide();
        else show();
      }
      drag.current = null;
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
  };

  const recent = [...notes].sort((a, b) => b.last_edited - a.last_edited).slice(0, 3);
  const matches = notes
    .filter((note) => {
      const q = filter.trim().toLowerCase();
      if (!q) return true;
      return (
        note.title.toLowerCase().includes(q) ||
        note.category.toLowerCase().includes(q) ||
        note.content.some((item) => item.text.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => b.last_edited - a.last_edited)
    .slice(0, 6);

  const openFromTray = (note: NoteItem) => {
    const rect = panel.current?.getBoundingClientRect();
    hide();
    if (rect) onOpenNote(note, rect);
  };

  return (
    <div
      ref={root}
      aria-hidden={hidden || undefined}
      className="fixed z-[70] flex flex-col items-end"
      style={{
        right: pos.right,
        bottom: pos.bottom,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        transition: "opacity 220ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {mounted && (
        <div
          ref={panel}
          className="glass absolute bottom-[58px] right-0 w-[352px] overflow-hidden rounded-[22px] p-2.5 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]"
          style={{ maxHeight: "min(470px, calc(100vh - 110px))" }}
        >
          <div className="flex items-center justify-between px-1.5 pb-2 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="size-[5px] rounded-full bg-white/80" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-ink-3">
                {mode === "menu" ? "Docking Mode" : "Find a note"}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onExpand}
                aria-label="Open the canvas"
                className="icon-btn !size-6"
              >
                <ArrowUpRight size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={hide}
                aria-label="Close tray"
                className="icon-btn !size-6"
              >
                <X size={12} strokeWidth={1.9} />
              </button>
            </div>
          </div>

          {mode === "menu" ? (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  hide();
                  onNewNote();
                }}
                className="flex h-11 w-full items-center gap-2.5 rounded-[12px] bg-white/[0.1] px-3 text-[12.5px] font-medium text-ink-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] transition-colors hover:bg-white/[0.15]"
              >
                <Plus size={14} strokeWidth={1.9} />
                <span>New note</span>
                <span className="kbd ml-auto">⌘N</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("find")}
                className="flex h-11 w-full items-center gap-2.5 rounded-[12px] px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink-1"
              >
                <Search size={14} strokeWidth={1.7} />
                <span>Pull up an old note</span>
                <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">
                  find
                </span>
              </button>

              <div className="px-1 pt-2 pb-1">
                <span className="micro">Recent</span>
              </div>

              {recent.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => openFromTray(note)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <span
                    className="h-6 w-[2px] shrink-0 rounded-full"
                    style={{ backgroundColor: accentFor(note.category, shelves), opacity: 0.8 }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-ink-2">
                      {note.title || "Untitled"}
                    </span>
                    <span className="block font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-4">
                      {note.category}
                    </span>
                  </span>
                  <span className="font-mono text-[9px] text-ink-4">
                    {relativeShort(note.last_edited)}
                  </span>
                </button>
              ))}

              <div className="my-1 h-px bg-white/[0.06]" />

              <button
                type="button"
                onClick={onExpand}
                className="flex h-8 w-full items-center px-2 text-[11px] text-ink-4 transition-colors hover:text-ink-2"
              >
                Back to the canvas
                <ArrowUpRight size={11} className="ml-auto" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex h-8 items-center gap-2 rounded-[9px] bg-white/[0.05] px-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]">
                <Search size={12} strokeWidth={1.8} className="text-ink-4" />
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter everything"
                  aria-label="Filter notes"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-ink-1 outline-none placeholder:text-ink-4"
                  autoFocus
                />
                {filter && (
                  <button
                    type="button"
                    onClick={() => setFilter("")}
                    aria-label="Clear filter"
                    className="text-ink-4 hover:text-ink-1"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              <div className="px-0.5 pt-1">
                <span className="micro">Shelves</span>
              </div>

              <div className="scroll -mx-0.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-0.5 pb-1">
                {shelves.map((shelf) => (
                  <button
                    key={shelf}
                    type="button"
                    onClick={() => {
                      hide();
                      onSelectShelf(shelf);
                    }}
                    className="group w-[112px] shrink-0 snap-start rounded-[12px] bg-white/[0.035] p-2.5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.055)] transition-colors hover:bg-white/[0.075]"
                  >
                    <span
                      className="mb-2 block h-[2px] w-6 rounded-full"
                      style={{ backgroundColor: accentFor(shelf, shelves) }}
                    />
                    <span className="block truncate text-[11.5px] text-ink-2">{shelf}</span>
                    <span className="mt-0.5 block font-mono text-[15px] tabular-nums leading-none text-ink-1">
                      {String(notes.filter((note) => note.category === shelf).length).padStart(2, "0")}
                    </span>
                  </button>
                ))}
              </div>

              <div className="scroll max-h-[176px] overflow-y-auto pt-1">
                {matches.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[11.5px] text-ink-4">
                    Nothing under that name.
                  </p>
                ) : (
                  matches.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => openFromTray(note)}
                      className="flex w-full items-center gap-2 rounded-[9px] px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-ink-2">
                          {note.title || "Untitled"}
                        </span>
                        <span className="block truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-4">
                          {note.category}
                        </span>
                      </span>
                      <span className="font-mono text-[9px] text-ink-4">
                        {relativeShort(note.last_edited)}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setMode("menu")}
                className="h-7 w-full text-left text-[11px] text-ink-4 transition-colors hover:text-ink-2"
              >
                Back
              </button>
            </div>
          )}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label="Docking Mode"
        onPointerDown={startDrag}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) hide();
            else show();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void tauriApi.showTrayContextMenu();
        }}
        className={cx(
          "glass flex h-10 select-none items-center gap-2.5 rounded-xl pl-3 pr-2",
          "cursor-grab active:cursor-grabbing",
        )}
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.09), 0 22px 40px -22px rgba(0,0,0,0.95)",
        }}
      >
        <Mark size={16} className="pointer-events-none shrink-0" />
        <span className="text-[11.5px] font-medium tracking-[0.005em] text-ink-2">Dock</span>
        <span className="grid size-6 place-items-center rounded-full text-ink-4 transition-colors hover:bg-white/10 hover:text-ink-1">
          {open ? <X size={11} strokeWidth={2} /> : <Plus size={12} strokeWidth={2} />}
        </span>
      </div>
    </div>
  );
}
