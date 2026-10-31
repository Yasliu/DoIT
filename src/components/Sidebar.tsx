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
  onCategoryContextMenu?: (event: React.MouseEvent, shelf: string) => void;
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
  onCategoryContextMenu,
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
      className={cx(
        "relative flex shrink-0 flex-col overflow-hidden h-full border-r border-white/[0.07] bg-white/[0.02] backdrop-blur-xl z-20 select-none",
        "transition-[width,opacity] duration-300 ease-out will-change-[width,opacity]",
      )}
      style={{
        width: open ? 246 : 66,
      }}
    >
      {/* Brand Header */}
      <div className="flex h-[58px] shrink-0 items-center px-4 overflow-hidden">
        <Mark size={32} className="shrink-0" />
        <div
          className={cx(
            "flex flex-col min-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
            open
              ? "max-w-[180px] opacity-100 translate-x-0 ml-3"
              : "max-w-0 opacity-0 -translate-x-3 ml-0 overflow-hidden pointer-events-none",
          )}
        >
          <div className="truncate text-[13px] font-semibold tracking-[-0.015em] text-ink-1">
            DoIT
          </div>
          <div className="truncate text-[10.5px] tracking-[0.01em] text-ink-4">
            Local workspace
          </div>
        </div>
      </div>

      {/* New Note & New Category Action */}
      <div className="px-3 pt-1 relative h-8 overflow-hidden shrink-0">
        {/* Expanded Action Bar */}
        <div
          className={cx(
            "flex items-center gap-1.5 w-full transition-all duration-300 ease-out",
            open
              ? "max-w-[200px] opacity-100 translate-x-0 pointer-events-auto"
              : "max-w-0 opacity-0 -translate-x-3 overflow-hidden pointer-events-none",
          )}
        >
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

        {/* Collapsed Compact Action Bar */}
        <div
          className={cx(
            "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out",
            open ? "opacity-0 pointer-events-none scale-90" : "opacity-100 pointer-events-auto scale-100",
          )}
        >
          <button
            type="button"
            onClick={onNew}
            title="New note  ⌘N"
            className="grid size-8 place-items-center rounded-[10px] bg-white/[0.055] text-ink-2 transition-colors duration-150 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Categories Navigation */}
      <nav className="scroll mt-5 min-h-0 flex-1 overflow-y-auto px-3 overflow-x-hidden">
        {/* Shelves Header */}
        <div
          className={cx(
            "micro mb-2 flex items-center justify-between whitespace-nowrap transition-all duration-300 ease-out",
            open
              ? "max-w-[200px] opacity-100 max-h-6 px-2"
              : "max-w-0 opacity-0 max-h-0 px-0 overflow-hidden pointer-events-none",
          )}
        >
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

        {creatingCategory && open && (
          <div className="mb-2 flex items-center gap-1 rounded-[10px] bg-white/[0.06] p-1 border border-white/10 shadow-sm animate-fade-in">
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

        {/* Shelf rows */}
        {dockItems.map((item) => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key ?? "__all__"}
              type="button"
              onClick={() => onSelect(item.key)}
              onContextMenu={(e) => {
                if (!item.key || item.key.toLowerCase() === "uncategorized" || !onCategoryContextMenu) return;
                e.preventDefault();
                onCategoryContextMenu(e, item.key);
              }}
              title={`${item.label} (${item.count})`}
              className={cx(
                "group/row relative mb-1 flex h-8 items-center rounded-[8px] transition-all duration-300 ease-out cursor-pointer select-none",
                open ? "w-full px-2" : "w-8 mx-auto justify-center px-0",
                isActive
                  ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] font-medium"
                  : "text-ink-3 hover:bg-white/[0.04] hover:text-ink-1",
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
                  className="shrink-0 size-2 rounded-full transition-all duration-300 ease-out pointer-events-none"
                  style={{
                    backgroundColor: item.accent,
                    transform: isActive ? "scale(1.3)" : "scale(1)",
                    boxShadow: isActive ? `0 0 8px ${item.accent}80` : "none",
                  }}
                />
              )}

              {/* Sliding and fading label + count */}
              <div
                className={cx(
                  "flex flex-1 items-center justify-between min-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
                  open
                    ? "max-w-[180px] opacity-100 translate-x-0 ml-2.5"
                    : "max-w-0 opacity-0 -translate-x-3 ml-0 overflow-hidden pointer-events-none",
                )}
              >
                <span className="truncate text-[12.5px]">{item.label}</span>
                <span
                  className={cx(
                    "font-mono text-[10px] tabular-nums text-ink-4 shrink-0 ml-1.5",
                    item.key && item.key.toLowerCase() !== "uncategorized" && onDeleteCategory && "group-hover/row:hidden",
                  )}
                >
                  {item.count}
                </span>
                {item.key && item.key.toLowerCase() !== "uncategorized" && onDeleteCategory && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCategory(item.key!);
                    }}
                    className="hidden size-5 place-items-center rounded text-ink-4 hover:text-red-400 group-hover/row:grid shrink-0 ml-1"
                    title={`Delete ${item.label} category`}
                  >
                    <Trash2 size={11} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="shrink-0 p-3">
        <div className="rule mb-3" />
        <div className="space-y-1">
          <button
            type="button"
            onClick={onOpenSettings}
            className={cx(
              "flex h-8 items-center rounded-[8px] text-[12px] transition-all duration-300 ease-out cursor-pointer",
              open ? "w-full px-2" : "w-8 mx-auto justify-center px-0",
              isSettings
                ? "bg-white/[0.1] text-white font-medium"
                : "text-ink-3 hover:bg-white/[0.05] hover:text-ink-1",
            )}
            title="Settings"
          >
            <Settings size={14} strokeWidth={1.8} className="shrink-0" />
            <span
              className={cx(
                "text-left truncate transition-all duration-300 ease-out",
                open
                  ? "max-w-[150px] opacity-100 translate-x-0 ml-2.5"
                  : "max-w-0 opacity-0 -translate-x-3 ml-0 overflow-hidden pointer-events-none",
              )}
            >
              Settings
            </span>
          </button>

          <button
            type="button"
            onClick={onToggle}
            className={cx(
              "flex h-8 items-center rounded-[8px] text-[12px] text-ink-4 transition-all duration-300 ease-out hover:bg-white/[0.05] hover:text-ink-2 cursor-pointer",
              open ? "w-full px-2" : "w-8 mx-auto justify-center px-0",
            )}
            title={open ? "Collapse sidebar" : "Expand sidebar"}
          >
            {open ? (
              <ChevronsLeft size={14} strokeWidth={1.6} className="shrink-0" />
            ) : (
              <ChevronsRight size={14} strokeWidth={1.6} className="shrink-0" />
            )}
            <span
              className={cx(
                "text-left truncate transition-all duration-300 ease-out",
                open
                  ? "max-w-[150px] opacity-100 translate-x-0 ml-2.5"
                  : "max-w-0 opacity-0 -translate-x-3 ml-0 overflow-hidden pointer-events-none",
              )}
            >
              Collapse
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
