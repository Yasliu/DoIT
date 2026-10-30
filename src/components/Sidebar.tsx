import { useState } from "react";
import { Check, ChevronsLeft, ChevronsRight, FolderPlus, Plus, Settings, Trash2, X } from "lucide-react";
import { Mark } from "./Mark";
import { accentFor, cleanText, cx, initials } from "../lib/text";

interface SidebarProps {
  shelves: string[];
  counts: Record<string, number>;
  total: number;
  active: string | null;
  onSelect: (shelf: string | null) => void;
  onNew: () => void;
  onNewCategory?: (name: string) => void;
  open: boolean;
  onToggle: () => void;
  onOpenSettings?: () => void;
  isSettings?: boolean;
  onDeleteCategory?: (shelf: string) => void;
}

export function Sidebar({
  shelves,
  counts,
  total,
  active,
  onSelect,
  onNew,
  onNewCategory,
  open,
  onToggle,
  onOpenSettings,
  isSettings,
  onDeleteCategory,
}: SidebarProps) {
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  // Build the list of category items: index 0 is All Notes, 1..N are shelves
  const dockItems = [
    { key: null, label: "All notes", count: total, accent: "#ffffff", initial: "All" },
    ...shelves.map((shelf) => ({
      key: shelf,
      label: cleanText(shelf),
      count: counts[shelf] ?? 0,
      accent: accentFor(shelf, shelves),
      initial: initials(cleanText(shelf)),
    })),
  ];

  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-hidden h-full border-r border-white/[0.07] bg-white/[0.02] backdrop-blur-xl z-20 select-none"
      style={{
        width: open ? 246 : 66,
        transition: "width 280ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      {/* Brand Header */}
      <div
        className={cx(
          "flex h-[58px] shrink-0 items-center px-3",
          open ? "justify-start gap-2.5" : "justify-center",
        )}
      >
        <Mark size={32} className="shrink-0" />
        {open && (
          <div className="flex flex-col min-w-0 overflow-hidden whitespace-nowrap">
            <div className="truncate text-[13px] font-semibold tracking-[-0.015em] text-ink-1">
              DoIT
            </div>
            <div className="truncate text-[10.5px] tracking-[0.01em] text-ink-4">
              Local workspace
            </div>
          </div>
        )}
      </div>

      {/* New Note & New Category Action */}
      <div className="px-3 pt-1">
        {open ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onNew}
              title="New note  ⌘N"
              className="flex h-8 flex-1 items-center justify-between rounded-[10px] bg-white/[0.055] px-3 text-[12.5px] font-medium text-ink-2 transition-colors duration-150 hover:bg-white/[0.1] hover:text-ink-1 overflow-hidden"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Plus size={14} strokeWidth={2} className="shrink-0" />
                <span className="truncate">New note</span>
              </div>
              <span className="kbd shrink-0">⌘N</span>
            </button>
            <button
              type="button"
              onClick={() => setCreatingCategory(true)}
              title="New category / shelf"
              className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.055] text-ink-2 transition-colors duration-150 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer"
            >
              <FolderPlus size={14} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onNew}
              title="New note  ⌘N"
              className="grid size-8 mx-auto place-items-center rounded-[10px] bg-white/[0.055] text-ink-2 transition-colors duration-150 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer"
            >
              <Plus size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => {
                onToggle();
                setCreatingCategory(true);
              }}
              title="New category / shelf"
              className="grid size-8 mx-auto place-items-center rounded-[10px] bg-white/[0.055] text-ink-2 transition-colors duration-150 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer"
            >
              <FolderPlus size={14} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {/* Categories Navigation */}
      {open ? (
        <nav className="scroll mt-5 min-h-0 flex-1 overflow-y-auto px-3">
          <div className="micro mb-2 flex items-center justify-between px-2 whitespace-nowrap">
            <span>Shelves</span>
            <button
              type="button"
              onClick={() => setCreatingCategory((v) => !v)}
              className="text-ink-4 hover:text-ink-1 transition-colors"
              title="Add shelf"
            >
              <Plus size={12} strokeWidth={2} />
            </button>
          </div>

          {creatingCategory && (
            <div className="mb-2 flex items-center gap-1 rounded-[10px] bg-white/[0.06] p-1 border border-white/10 shadow-sm">
              <input
                autoFocus
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (categoryName.trim()) {
                      onNewCategory?.(categoryName.trim());
                      setCategoryName("");
                      setCreatingCategory(false);
                    }
                  } else if (e.key === "Escape") {
                    setCreatingCategory(false);
                    setCategoryName("");
                  }
                }}
                placeholder="Category name..."
                className="h-6 min-w-0 flex-1 bg-transparent px-1.5 text-[12px] text-ink-1 outline-none placeholder:text-ink-4"
              />
              <button
                type="button"
                onClick={() => {
                  if (categoryName.trim()) {
                    onNewCategory?.(categoryName.trim());
                    setCategoryName("");
                    setCreatingCategory(false);
                  }
                }}
                className="grid size-6 place-items-center rounded bg-white/10 text-ink-1 hover:bg-white/20"
                title="Create category"
              >
                <Check size={11} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingCategory(false);
                  setCategoryName("");
                }}
                className="grid size-6 place-items-center rounded text-ink-4 hover:text-ink-2"
                title="Cancel"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onSelect(null)}
            title="All notes"
            className={cx(
              "group/row relative mb-0.5 flex h-8 w-full items-center rounded-[8px] px-2 text-[12.5px] transition-colors duration-150",
              active === null
                ? "bg-white/[0.06] text-ink-1"
                : "text-ink-3 hover:bg-white/[0.035] hover:text-ink-1",
            )}
          >
            <span className="grid size-[14px] shrink-0 place-items-center">
              <span className="grid grid-cols-2 gap-[2px]">
                <span className="size-[4px] rounded-[1px] bg-current opacity-90" />
                <span className="size-[4px] rounded-[1px] bg-current opacity-50" />
                <span className="size-[4px] rounded-[1px] bg-current opacity-50" />
                <span className="size-[4px] rounded-[1px] bg-current opacity-30" />
              </span>
            </span>
            <div className="flex flex-1 items-center justify-between min-w-0 ml-2.5 overflow-hidden whitespace-nowrap">
              <span className="truncate">All notes</span>
              <span className="font-mono text-[10px] tabular-nums text-ink-4 shrink-0">
                {total}
              </span>
            </div>
          </button>

          {shelves.map((shelf) => {
            const isActive = active === shelf;
            const accent = accentFor(shelf, shelves);
            return (
              <button
                key={shelf}
                type="button"
                onClick={() => onSelect(shelf)}
                title={cleanText(shelf)}
                className={cx(
                  "group/row relative mb-0.5 flex h-8 w-full items-center rounded-[8px] px-2 text-[12.5px] transition-colors duration-150",
                  isActive
                    ? "bg-white/[0.06] text-ink-1"
                    : "text-ink-3 hover:bg-white/[0.035] hover:text-ink-1",
                )}
              >
                <span
                  className="size-[5px] shrink-0 rounded-full transition-opacity duration-200"
                  style={{ backgroundColor: accent, opacity: isActive ? 1 : 0.5 }}
                />
                <div className="flex flex-1 items-center justify-between min-w-0 ml-2.5 overflow-hidden whitespace-nowrap">
                  <span className="truncate">{cleanText(shelf)}</span>
                  <span
                    className={cx(
                      "font-mono text-[10px] tabular-nums text-ink-4 shrink-0",
                      shelf.toLowerCase() !== "uncategorized" && onDeleteCategory && "group-hover/row:hidden",
                    )}
                  >
                    {counts[shelf] ?? 0}
                  </span>
                  {shelf.toLowerCase() !== "uncategorized" && onDeleteCategory && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCategory(shelf);
                      }}
                      className="hidden size-5 place-items-center rounded text-ink-4 hover:text-red-400 group-hover/row:grid shrink-0"
                      title={`Delete ${shelf} category`}
                    >
                      <Trash2 size={11} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      ) : (
        /* Collapsed Clean Symmetrical Vertical Rail (No jarring wobble animations) */
        <nav className="relative mt-5 min-h-0 flex-1 overflow-y-auto px-3 flex flex-col items-center gap-1.5 scroll-none">
          {dockItems.map((item) => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key ?? "__all__"}
                type="button"
                onClick={() => onSelect(item.key)}
                title={`${item.label} (${item.count})`}
                className={cx(
                  "grid size-8 place-items-center rounded-[10px] text-[11px] font-mono transition-colors duration-150 cursor-pointer select-none",
                  isActive
                    ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] font-semibold"
                    : "text-ink-3 hover:bg-white/[0.05] hover:text-ink-1",
                )}
              >
                {item.key === null ? (
                  <span className="grid size-[14px] shrink-0 place-items-center pointer-events-none">
                    <span className="grid grid-cols-2 gap-[2px]">
                      <span className="size-[4px] rounded-[1px] bg-current opacity-90" />
                      <span className="size-[4px] rounded-[1px] bg-current opacity-50" />
                      <span className="size-[4px] rounded-[1px] bg-current opacity-50" />
                      <span className="size-[4px] rounded-[1px] bg-current opacity-30" />
                    </span>
                  </span>
                ) : (
                  <span
                    className="font-mono tracking-[0.04em] uppercase pointer-events-none"
                    style={{ color: isActive ? "#ffffff" : item.accent }}
                  >
                    {item.initial}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Bottom Actions */}
      <div className="shrink-0 p-3">
        <div className="rule mb-3" />
        {open ? (
          <>
            <button
              type="button"
              onClick={onOpenSettings}
              className={cx(
                "flex h-8 w-full items-center rounded-[8px] text-[12px] transition-colors duration-150 mb-0.5 px-2",
                isSettings
                  ? "bg-white/[0.1] text-white font-medium"
                  : "text-ink-3 hover:bg-white/[0.05] hover:text-ink-1",
              )}
              title="Open Settings"
            >
              <Settings size={14} strokeWidth={1.8} className="shrink-0" />
              <span className="ml-2.5 text-left truncate">Settings</span>
            </button>

            <button
              type="button"
              onClick={onToggle}
              className="mt-0.5 flex h-8 w-full items-center rounded-[8px] text-[12px] text-ink-4 transition-colors duration-150 hover:bg-white/[0.05] hover:text-ink-2 px-2"
              title="Collapse sidebar"
            >
              <ChevronsLeft size={14} strokeWidth={1.6} className="shrink-0" />
              <span className="ml-2.5 text-left truncate">Collapse</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={onOpenSettings}
              className={cx(
                "grid size-8 place-items-center rounded-[10px] text-ink-3 transition-colors duration-150 cursor-pointer",
                isSettings
                  ? "bg-white/[0.1] text-white font-medium"
                  : "hover:bg-white/[0.05] hover:text-ink-1",
              )}
              title="Open Settings"
            >
              <Settings size={14} strokeWidth={1.8} />
            </button>

            <button
              type="button"
              onClick={onToggle}
              className="grid size-8 place-items-center rounded-[10px] text-ink-4 transition-colors duration-150 hover:bg-white/[0.05] hover:text-ink-2 cursor-pointer"
              title="Expand sidebar"
            >
              <ChevronsRight size={14} strokeWidth={1.6} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
