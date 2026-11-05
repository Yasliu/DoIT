import { useEffect, useState } from "react";
import { Check, ChevronsLeft, ChevronsRight, FileDown, FolderInput, FolderPlus, Palette, Plus, Settings, Trash2, X } from "lucide-react";
import { Mark } from "./Mark";
import { accentFor, cleanText, cx, initials } from "../lib/text";
import { CATEGORY_ICONS, getCategoryIconName } from "../lib/categoryIcons";

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
  onOpenIconPicker?: (shelf: string) => void;
  onImportFile?: () => void;
  onScanFolder?: () => void;
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
  onOpenIconPicker,
  onImportFile,
  onScanFolder,
}: SidebarProps) {
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [, setIconsVersion] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setIconsVersion((v) => v + 1);
    window.addEventListener("category-icons-changed", handleUpdate);
    return () => window.removeEventListener("category-icons-changed", handleUpdate);
  }, []);

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
        "relative flex shrink-0 flex-col overflow-hidden h-full border-r border-white/[0.07] bg-[#0e0f13] z-20 select-none",
        "transition-[width] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[width]",
      )}
      style={{
        width: open ? 246 : 66,
      }}
    >
      {/* Brand Header */}
      <div
        className={cx(
          "flex h-[58px] shrink-0 items-center overflow-hidden",
          open ? "px-4" : "justify-center px-0",
        )}
      >
        <Mark size={32} className="shrink-0" />
        {open && (
          <div className="flex flex-col min-w-0 overflow-hidden whitespace-nowrap ml-3 animate-fade-in">
            <div className="truncate text-[13px] font-semibold tracking-[-0.015em] text-ink-1">
              DoIT
            </div>
            <div className="truncate text-[10.5px] tracking-[0.01em] text-ink-4">
              Local workspace
            </div>
          </div>
        )}
      </div>

      {/* Primary Actions: Clean Vertically-Stacked Action Buttons */}
      <div className={cx("pt-1 space-y-1.5 shrink-0", open ? "px-3" : "px-0 flex flex-col items-center")}>
        {/* Row 1: New Note */}
        <div className={cx("flex items-center", open ? "gap-1.5 w-full" : "justify-center w-full")}>
          <button
            type="button"
            onClick={onNew}
            title="New note"
            className={cx(
              "rounded-[9px] bg-white/[0.06] text-ink-2 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer select-none transition-colors duration-150",
              open
                ? "flex-1 h-8.5 flex items-center px-2.5 font-medium text-[12px]"
                : "size-8.5 grid place-items-center",
            )}
          >
            <Plus size={15} strokeWidth={2} className="shrink-0" />
            {open && (
              <span className="truncate ml-2 whitespace-nowrap text-[12px] font-medium text-ink-2">
                New note
              </span>
            )}
          </button>
          {open && (
            <button
              type="button"
              onClick={() => setCreatingCategory(true)}
              title="New category / shelf"
              className="grid size-8.5 shrink-0 place-items-center rounded-[9px] bg-white/[0.06] text-ink-2 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer transition-colors"
            >
              <FolderPlus size={14} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Row 2: Import Note File */}
        <button
          type="button"
          onClick={onImportFile}
          title="Import single markdown or text file"
          className={cx(
            "rounded-[9px] bg-white/[0.035] text-ink-3 hover:bg-white/[0.07] hover:text-ink-1 cursor-pointer select-none transition-colors duration-150",
            open
              ? "w-full h-8 flex items-center px-2.5 font-medium text-[12px]"
              : "size-8.5 grid place-items-center",
          )}
        >
          <FileDown size={14} strokeWidth={1.8} className="shrink-0" />
          {open && (
            <span className="truncate ml-2 whitespace-nowrap text-[12px] font-medium text-ink-3">
              Import Note
            </span>
          )}
        </button>

        {/* Row 3: Scan Folder */}
        <button
          type="button"
          onClick={onScanFolder}
          title="Scan & import custom folder"
          className={cx(
            "rounded-[9px] bg-white/[0.035] text-ink-3 hover:bg-white/[0.07] hover:text-ink-1 cursor-pointer select-none transition-colors duration-150",
            open
              ? "w-full h-8 flex items-center px-2.5 font-medium text-[12px]"
              : "size-8.5 grid place-items-center",
          )}
        >
          <FolderInput size={14} strokeWidth={1.8} className="shrink-0" />
          {open && (
            <span className="truncate ml-2 whitespace-nowrap text-[12px] font-medium text-ink-3">
              Scan Folder
            </span>
          )}
        </button>
      </div>

      <div className={cx("my-2", open ? "px-4" : "px-3")}>
        <div className="h-px bg-white/[0.06] w-full" />
      </div>

      {/* Categories Navigation */}
      <nav className={cx("scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden", open ? "px-3" : "px-0 flex flex-col items-center")}>
        {/* Shelves Header (open only) */}
        {open && (
          <div className="h-5 mb-1 px-2 flex items-center justify-between whitespace-nowrap shrink-0">
            <span className="micro">Shelves</span>
            <button
              type="button"
              onClick={() => setCreatingCategory((v) => !v)}
              className="text-ink-4 hover:text-ink-1 transition-colors cursor-pointer"
              title="Add shelf"
            >
              <Plus size={12} strokeWidth={2} />
            </button>
          </div>
        )}

        {creatingCategory && open && (
          <div className="mb-2 flex items-center gap-1 rounded-[10px] bg-white/[0.06] p-1 border border-white/10 shadow-sm animate-fade-in">
            <input
              autoFocus
              value={categoryName}
              maxLength={24}
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
          const iconKey = item.key ? getCategoryIconName(item.key) : null;
          const CustomIcon = iconKey && iconKey !== "dot" ? CATEGORY_ICONS[iconKey] : null;
          const isDot = iconKey === "dot";

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
                "group/row relative mb-1 rounded-[8px] transition-colors duration-150 cursor-pointer select-none",
                open
                  ? "w-full h-8 flex items-center px-2"
                  : "size-8.5 grid place-items-center",
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
              ) : CustomIcon ? (
                <span
                  onClick={(e) => {
                    if (open && onOpenIconPicker && item.key && item.key.toLowerCase() !== "uncategorized") {
                      e.stopPropagation();
                      onOpenIconPicker(item.key);
                    }
                  }}
                  className={cx(
                    "shrink-0 flex items-center justify-center pointer-events-auto",
                    open && item.key && item.key.toLowerCase() !== "uncategorized" && "hover:scale-120 transition-transform cursor-pointer",
                  )}
                  title={open && item.key && item.key.toLowerCase() !== "uncategorized" ? "Click to change icon" : undefined}
                >
                  <CustomIcon
                    size={14}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ color: item.accent }}
                    className="shrink-0 transition-transform duration-150 pointer-events-none"
                  />
                </span>
              ) : isDot ? (
                <span
                  onClick={(e) => {
                    if (open && onOpenIconPicker && item.key && item.key.toLowerCase() !== "uncategorized") {
                      e.stopPropagation();
                      onOpenIconPicker(item.key);
                    }
                  }}
                  className={cx(
                    "shrink-0 flex items-center justify-center pointer-events-auto",
                    open && item.key && item.key.toLowerCase() !== "uncategorized" && "hover:scale-120 transition-transform cursor-pointer",
                  )}
                  title={open && item.key && item.key.toLowerCase() !== "uncategorized" ? "Click to choose icon" : undefined}
                >
                  <span
                    className="shrink-0 size-2 rounded-full transition-all duration-200 ease-out pointer-events-none"
                    style={{
                      backgroundColor: item.accent,
                      transform: isActive ? "scale(1.2)" : "scale(1)",
                      boxShadow: isActive ? `0 0 8px ${item.accent}80` : "none",
                    }}
                  />
                </span>
              ) : (
                <span
                  className="shrink-0 size-2 rounded-full pointer-events-none"
                  style={{ backgroundColor: item.accent }}
                />
              )}

              {/* Sliding and fading label + count (only in open mode) */}
              {open && (
                <div className="flex flex-1 items-center justify-between min-w-0 overflow-hidden whitespace-nowrap ml-2.5 animate-fade-in">
                  <span className="truncate text-[12.5px]">{item.label}</span>
                  <span
                    className={cx(
                      "font-mono text-[10px] tabular-nums text-ink-4 shrink-0 ml-1.5",
                      item.key && item.key.toLowerCase() !== "uncategorized" && (onDeleteCategory || onOpenIconPicker) && "group-hover/row:hidden",
                    )}
                  >
                    {item.count}
                  </span>

                  {item.key && item.key.toLowerCase() !== "uncategorized" && (
                    <div className="hidden items-center gap-0.5 group-hover/row:flex shrink-0 ml-1">
                      {onOpenIconPicker && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenIconPicker(item.key!);
                          }}
                          className="size-5 grid place-items-center rounded text-ink-4 hover:bg-white/10 hover:text-ink-1 cursor-pointer transition-colors"
                          title={`Change icon for ${item.label}`}
                        >
                          <Palette size={11.5} strokeWidth={1.8} />
                        </span>
                      )}
                      {onDeleteCategory && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCategory(item.key!);
                          }}
                          className="size-5 grid place-items-center rounded text-ink-4 hover:bg-red-500/10 hover:text-red-400 cursor-pointer transition-colors"
                          title={`Delete ${item.label} category`}
                        >
                          <Trash2 size={11} strokeWidth={1.8} />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className={cx("shrink-0 py-3", open ? "px-3" : "px-0 flex flex-col items-center")}>
        <div className={cx("rule mb-2.5", open ? "w-full" : "w-8.5")} />
        <div className={cx("space-y-1 w-full", !open && "flex flex-col items-center")}>
          <button
            type="button"
            onClick={onOpenSettings}
            className={cx(
              "rounded-[8px] text-[12px] transition-colors duration-150 cursor-pointer",
              open
                ? "w-full h-8 flex items-center px-2"
                : "size-8.5 grid place-items-center",
              isSettings
                ? "bg-white/[0.1] text-white font-medium"
                : "text-ink-3 hover:bg-white/[0.05] hover:text-ink-1",
            )}
            title="Settings"
          >
            <Settings size={14.5} strokeWidth={1.8} className="shrink-0" />
            {open && (
              <span className="text-left truncate whitespace-nowrap ml-2.5 text-[12px]">
                Settings
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggle}
            className={cx(
              "rounded-[8px] text-[12px] text-ink-4 hover:bg-white/[0.05] hover:text-ink-2 cursor-pointer transition-colors duration-150",
              open
                ? "w-full h-8 flex items-center px-2"
                : "size-8.5 grid place-items-center",
            )}
            title={open ? "Collapse sidebar" : "Expand sidebar"}
          >
            {open ? (
              <ChevronsLeft size={14.5} strokeWidth={1.6} className="shrink-0" />
            ) : (
              <ChevronsRight size={14.5} strokeWidth={1.6} className="shrink-0" />
            )}
            {open && (
              <span className="text-left truncate whitespace-nowrap ml-2.5 text-[12px]">
                Collapse
              </span>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
