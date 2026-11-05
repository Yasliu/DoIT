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
        "transition-[width] duration-320 ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
      style={{
        width: open ? 246 : 64,
        contain: "paint layout",
      }}
    >
      {/* Pinned Inner Track: 246px fixed layout so the screen border and icons NEVER shift */}
      <div className="w-[246px] h-full flex flex-col shrink-0">
        {/* Brand Header */}
        <div className="flex h-[58px] shrink-0 items-center px-4 overflow-hidden">
          <Mark size={32} className="shrink-0" />
          <div
            className={cx(
              "flex flex-col min-w-0 overflow-hidden whitespace-nowrap ml-3 transition-opacity duration-200 ease-out",
              open ? "opacity-100" : "opacity-0 pointer-events-none",
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

        {/* Primary Actions: Clean Left-Anchored Non-Snapping Buttons */}
        <div className="px-3.5 pt-1 space-y-1.5 shrink-0">
          {/* Row 1: New Note */}
          <div className="flex items-center gap-1.5 w-full">
            <button
              type="button"
              onClick={onNew}
              title="New note"
              style={{
                width: open ? "100%" : 36,
                transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms",
              }}
              className={cx(
                "h-8.5 rounded-[9px] bg-white/[0.06] text-ink-2 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer select-none flex items-center overflow-hidden shrink-0",
                open ? "flex-1" : "w-9",
              )}
            >
              <div className="size-9 grid place-items-center shrink-0">
                <Plus size={15} strokeWidth={2} />
              </div>
              <span
                className={cx(
                  "truncate ml-1 whitespace-nowrap text-[12px] font-medium text-ink-2 transition-opacity duration-150 ease-out",
                  open ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
              >
                New note
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCreatingCategory(true)}
              title="New category / shelf"
              className={cx(
                "grid size-8.5 shrink-0 place-items-center rounded-[9px] bg-white/[0.06] text-ink-2 hover:bg-white/[0.1] hover:text-ink-1 cursor-pointer transition-all duration-200 ease-out",
                open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none w-0 -mr-1.5 overflow-hidden",
              )}
            >
              <FolderPlus size={14} strokeWidth={2} />
            </button>
          </div>

          {/* Row 2: Import Note File */}
          <button
            type="button"
            onClick={onImportFile}
            title="Import single markdown or text file"
            style={{
              width: open ? "100%" : 36,
              transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms",
            }}
            className="h-8 rounded-[9px] bg-white/[0.035] text-ink-3 hover:bg-white/[0.07] hover:text-ink-1 cursor-pointer select-none flex items-center overflow-hidden shrink-0"
          >
            <div className="size-9 grid place-items-center shrink-0">
              <FileDown size={14} strokeWidth={1.8} />
            </div>
            <span
              className={cx(
                "truncate ml-1 whitespace-nowrap text-[12px] font-medium text-ink-3 transition-opacity duration-150 ease-out",
                open ? "opacity-100" : "opacity-0 pointer-events-none",
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
            style={{
              width: open ? "100%" : 36,
              transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms",
            }}
            className="h-8 rounded-[9px] bg-white/[0.035] text-ink-3 hover:bg-white/[0.07] hover:text-ink-1 cursor-pointer select-none flex items-center overflow-hidden shrink-0"
          >
            <div className="size-9 grid place-items-center shrink-0">
              <FolderInput size={14} strokeWidth={1.8} />
            </div>
            <span
              className={cx(
                "truncate ml-1 whitespace-nowrap text-[12px] font-medium text-ink-3 transition-opacity duration-150 ease-out",
                open ? "opacity-100" : "opacity-0 pointer-events-none",
              )}
            >
              Scan Folder
            </span>
          </button>
        </div>

        <div className="my-2 px-3.5">
          <div
            style={{
              width: open ? "100%" : 36,
              transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            className="h-px bg-white/[0.06]"
          />
        </div>

        {/* Categories Navigation */}
        <nav className="scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5">
          {/* Shelves Header (open only) */}
          <div
            className={cx(
              "h-5 mb-1 px-1 flex items-center justify-between whitespace-nowrap shrink-0 transition-opacity duration-200",
              open ? "opacity-100" : "opacity-0 pointer-events-none h-0 overflow-hidden mb-0",
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
                style={{
                  width: open ? "100%" : 36,
                  transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms",
                }}
                className={cx(
                  "group/row relative mb-1 h-8 rounded-[8px] transition-colors duration-150 cursor-pointer select-none flex items-center overflow-hidden shrink-0",
                  isActive
                    ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] font-medium"
                    : "text-ink-3 hover:bg-white/[0.04] hover:text-ink-1",
                )}
              >
                {item.key === null ? (
                  <div className="size-9 grid place-items-center shrink-0 pointer-events-none">
                    <span className="grid grid-cols-2 gap-[2px]">
                      <span className="size-[4px] rounded-[1px] bg-current opacity-90" />
                      <span className="size-[4px] rounded-[1px] bg-current opacity-50" />
                      <span className="size-[4px] rounded-[1px] bg-current opacity-50" />
                      <span className="size-[4px] rounded-[1px] bg-current opacity-30" />
                    </span>
                  </div>
                ) : CustomIcon ? (
                  <div
                    onClick={(e) => {
                      if (onOpenIconPicker && item.key && item.key.toLowerCase() !== "uncategorized") {
                        e.stopPropagation();
                        onOpenIconPicker(item.key);
                      }
                    }}
                    className={cx(
                      "size-9 grid place-items-center shrink-0 pointer-events-auto",
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
                  </div>
                ) : isDot ? (
                  <div
                    onClick={(e) => {
                      if (onOpenIconPicker && item.key && item.key.toLowerCase() !== "uncategorized") {
                        e.stopPropagation();
                        onOpenIconPicker(item.key);
                      }
                    }}
                    className={cx(
                      "size-9 grid place-items-center shrink-0 pointer-events-auto",
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
                  </div>
                ) : (
                  <div className="size-9 grid place-items-center shrink-0 pointer-events-none">
                    <span
                      className="shrink-0 size-2 rounded-full"
                      style={{ backgroundColor: item.accent }}
                    />
                  </div>
                )}

                {/* Sliding label + count */}
                <div
                  className={cx(
                    "flex flex-1 items-center justify-between min-w-0 overflow-hidden whitespace-nowrap ml-1 transition-opacity duration-150 ease-out",
                    open ? "opacity-100" : "opacity-0 pointer-events-none",
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
                          title={`Edit ${item.label} category & icon`}
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
        <div className="shrink-0 py-3 px-3.5">
          <div
            style={{
              width: open ? "100%" : 36,
              transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            className="h-px bg-white/[0.06] mb-2.5"
          />
          <div className="space-y-1 w-full">
            <button
              type="button"
              onClick={onOpenSettings}
              style={{
                width: open ? "100%" : 36,
                transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms",
              }}
              className={cx(
                "h-8 rounded-[8px] text-[12px] transition-colors duration-150 cursor-pointer flex items-center overflow-hidden shrink-0",
                isSettings
                  ? "bg-white/[0.1] text-white font-medium"
                  : "text-ink-3 hover:bg-white/[0.05] hover:text-ink-1",
              )}
              title="Settings"
            >
              <div className="size-9 grid place-items-center shrink-0">
                <Settings size={14.5} strokeWidth={1.8} />
              </div>
              <span
                className={cx(
                  "text-left truncate whitespace-nowrap ml-1 text-[12px] transition-opacity duration-150 ease-out",
                  open ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
              >
                Settings
              </span>
            </button>

            <button
              type="button"
              onClick={onToggle}
              style={{
                width: open ? "100%" : 36,
                transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms",
              }}
              className="h-8 rounded-[8px] text-[12px] text-ink-4 hover:bg-white/[0.05] hover:text-ink-2 cursor-pointer transition-colors duration-150 flex items-center overflow-hidden shrink-0"
              title={open ? "Collapse sidebar" : "Expand sidebar"}
            >
              <div className="size-9 grid place-items-center shrink-0">
                {open ? (
                  <ChevronsLeft size={14.5} strokeWidth={1.6} />
                ) : (
                  <ChevronsRight size={14.5} strokeWidth={1.6} />
                )}
              </div>
              <span
                className={cx(
                  "text-left truncate whitespace-nowrap ml-1 text-[12px] transition-opacity duration-150 ease-out",
                  open ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
              >
                Collapse
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
