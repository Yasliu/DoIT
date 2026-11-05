import { useEffect, useState } from "react";
import { Check, ChevronsLeft, ChevronsRight, FileDown, FolderInput, FolderPlus, Palette, Plus, Settings, Trash2, X } from "lucide-react";
import { Mark } from "./Mark";
import { accentFor, cleanText, cx, initials } from "../lib/text";
import { CATEGORY_ICONS, getStoredCategoryIcons } from "../lib/categoryIcons";

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
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>(getStoredCategoryIcons);

  useEffect(() => {
    const handleUpdate = () => setCategoryIcons(getStoredCategoryIcons());
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
            "flex flex-col min-w-0 overflow-hidden whitespace-nowrap ml-3 transition-[opacity,transform] ease-out",
            open
              ? "opacity-100 translate-x-0 duration-200 delay-75"
              : "opacity-0 -translate-x-2 duration-150 pointer-events-none",
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

      {/* Primary Actions: Clean Vertically-Stacked Action Buttons */}
      <div className="px-3 pt-1 space-y-1.5 shrink-0">
        {/* Row 1: New Note */}
        <div className="flex items-center gap-1.5 w-full">
          <button
            type="button"
            onClick={onNew}
            title="New note"
            className={cx(
              "flex h-8.5 items-center rounded-[9px] bg-white/[0.06] font-medium text-[12px] text-ink-2 transition-all duration-200 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer select-none",
              open ? "flex-1 px-2.5" : "size-8.5 mx-auto justify-center px-0",
            )}
          >
            <Plus size={14} strokeWidth={2} className="shrink-0" />
            <span
              className={cx(
                "truncate ml-2 whitespace-nowrap transition-[opacity,transform] ease-out",
                open ? "opacity-100 translate-x-0 duration-200 delay-75" : "opacity-0 -translate-x-2 duration-150 pointer-events-none",
              )}
            >
              New note
            </span>
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
            "flex h-8 items-center rounded-[8px] bg-white/[0.035] font-medium text-[12px] text-ink-3 transition-all duration-200 hover:bg-white/[0.07] hover:text-ink-1 cursor-pointer select-none",
            open ? "w-full px-2.5" : "size-8 mx-auto justify-center px-0",
          )}
        >
          <FileDown size={14} strokeWidth={1.8} className="shrink-0" />
          <span
            className={cx(
              "truncate ml-2 whitespace-nowrap transition-[opacity,transform] ease-out",
              open ? "opacity-100 translate-x-0 duration-200 delay-75" : "opacity-0 -translate-x-2 duration-150 pointer-events-none",
            )}
          >
            Import Note
          </span>
        </button>

        {/* Row 3: Scan Folder */}
        <button
          type="button"
          onClick={onScanFolder}
          title="Scan & import custom folder"
          className={cx(
            "flex h-8 items-center rounded-[8px] bg-white/[0.035] font-medium text-[12px] text-ink-3 transition-all duration-200 hover:bg-white/[0.07] hover:text-ink-1 cursor-pointer select-none",
            open ? "w-full px-2.5" : "size-8 mx-auto justify-center px-0",
          )}
        >
          <FolderInput size={14} strokeWidth={1.8} className="shrink-0" />
          <span
            className={cx(
              "truncate ml-2 whitespace-nowrap transition-[opacity,transform] ease-out",
              open ? "opacity-100 translate-x-0 duration-200 delay-75" : "opacity-0 -translate-x-2 duration-150 pointer-events-none",
            )}
          >
            Scan Folder
          </span>
        </button>
      </div>

      <div className="px-4 my-2">
        <div className="h-px bg-white/[0.06] w-full" />
      </div>

      {/* Categories Navigation */}
      <nav className="scroll min-h-0 flex-1 overflow-y-auto px-3 overflow-x-hidden">
        {/* Shelves Header */}
        <div
          className={cx(
            "h-5 mb-1 px-2 flex items-center justify-between whitespace-nowrap shrink-0 transition-opacity duration-300 ease-out",
            open ? "opacity-100" : "opacity-0 pointer-events-none hidden",
          )}
        >
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
          const iconKey = item.key ? categoryIcons[item.key.toLowerCase()] : null;
          const CustomIcon = iconKey ? CATEGORY_ICONS[iconKey] : null;

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
                "group/row relative mb-1 flex h-8 items-center rounded-[8px] transition-all duration-200 ease-out cursor-pointer select-none",
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
                    open && item.key && item.key.toLowerCase() !== "uncategorized" && "hover:scale-125 transition-transform cursor-pointer",
                  )}
                  title={open && item.key && item.key.toLowerCase() !== "uncategorized" ? "Click to change icon" : undefined}
                >
                  <CustomIcon
                    size={14}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ color: item.accent }}
                    className="shrink-0 transition-transform duration-200 pointer-events-none"
                  />
                </span>
              ) : (
                <span
                  onClick={(e) => {
                    if (open && onOpenIconPicker && item.key && item.key.toLowerCase() !== "uncategorized") {
                      e.stopPropagation();
                      onOpenIconPicker(item.key);
                    }
                  }}
                  className={cx(
                    "shrink-0 flex items-center justify-center pointer-events-auto",
                    open && item.key && item.key.toLowerCase() !== "uncategorized" && "hover:scale-125 transition-transform cursor-pointer",
                  )}
                  title={open && item.key && item.key.toLowerCase() !== "uncategorized" ? "Click to choose icon" : undefined}
                >
                  <span
                    className="shrink-0 size-2 rounded-full transition-all duration-300 ease-out pointer-events-none"
                    style={{
                      backgroundColor: item.accent,
                      transform: isActive ? "scale(1.3)" : "scale(1)",
                      boxShadow: isActive ? `0 0 8px ${item.accent}80` : "none",
                    }}
                  />
                </span>
              )}

              {/* Sliding and fading label + count */}
              <div
                className={cx(
                  "flex flex-1 items-center justify-between min-w-0 overflow-hidden whitespace-nowrap ml-2.5 transition-[opacity,transform] ease-out",
                  open
                    ? "opacity-100 translate-x-0 duration-200 delay-75"
                    : "opacity-0 -translate-x-2 duration-150 pointer-events-none",
                )}
              >
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
                "text-left truncate whitespace-nowrap ml-2.5 transition-[opacity,transform] ease-out",
                open
                  ? "opacity-100 translate-x-0 duration-200 delay-75"
                  : "opacity-0 -translate-x-2 duration-150 pointer-events-none",
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
                "text-left truncate whitespace-nowrap ml-2.5 transition-[opacity,transform] ease-out",
                open
                  ? "opacity-100 translate-x-0 duration-200 delay-75"
                  : "opacity-0 -translate-x-2 duration-150 pointer-events-none",
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
