import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { FolderPlus, MoreHorizontal, Settings, SquarePen } from "lucide-react";
import { Mark } from "../../components/Mark";
import { cleanText, cx } from "../../lib/text";
import { shelfIcon } from "./LinuxSpotlight";

interface LinuxSidebarProps {
  shelves: string[];
  counts: Record<string, number>;
  total: number;
  active: string | null;
  isSettings: boolean;
  /** Collapsed, it is an icon rail; the toggle lives in the title bar. */
  open: boolean;
  onSelect: (shelf: string | null) => void;
  onNewNote: () => void;
  onNewShelf: () => void;
  onOpenSettings: () => void;
  onShelfMenu: (event: React.MouseEvent, shelf: string) => void;
}

const isUncategorized = (shelf: string) => shelf.toLowerCase() === "uncategorized";

/** Linux's sidebar, laid out like T3 Code's: create on top, the shelves, then Settings. */
export function LinuxSidebar(props: LinuxSidebarProps) {
  const { shelves, counts, total, active, isSettings, open } = props;
  const [, setIconsVersion] = useState(0);

  useEffect(() => {
    const bump = () => setIconsVersion((v) => v + 1);
    window.addEventListener("category-icons-changed", bump);
    return () => window.removeEventListener("category-icons-changed", bump);
  }, []);

  const rows: Array<{ key: string | null; label: string; count: number }> = [
    { key: null, label: "All notes", count: total },
    ...shelves.map((shelf) => ({ key: shelf, label: cleanText(shelf), count: counts[shelf] ?? 0 })),
  ];

  return (
    <aside data-slot="sidebar" data-open={open} className="lx-sidebar">
      <div className="lx-sidebar-brand" data-tauri-drag-region>
        <Mark size={open ? 26 : 24} className="pointer-events-none shrink-0" />
        {open && <span className="pointer-events-none truncate text-[17px] font-semibold tracking-[-0.02em] text-ink-1">DoIT</span>}
      </div>

      <div className="lx-sidebar-header">
        <button type="button" className="lx-create" onClick={props.onNewNote} title="New note (Ctrl N)" aria-label="New note">
          <SquarePen size={16} />
          {open && <span>New note</span>}
        </button>
        <button type="button" className="lx-create" onClick={props.onNewShelf} title="New shelf" aria-label="New shelf">
          <FolderPlus size={16} />
          {open && <span>New shelf</span>}
        </button>
      </div>

      <nav className="lx-sidebar-list" aria-label="Shelves">
        {rows.map((row) => {
          const selected = !isSettings && active === row.key;
          const editable = row.key !== null && !isUncategorized(row.key);
          return (
            <div key={row.key ?? "__all__"} className="lx-row-wrap">
              <button
                type="button"
                className="lx-row"
                data-active={selected || undefined}
                onClick={() => props.onSelect(row.key)}
                onContextMenu={(e) => {
                  if (!editable) return;
                  e.preventDefault();
                  props.onShelfMenu(e, row.key!);
                }}
                title={open ? undefined : row.label}
              >
                {selected && (
                  <motion.span
                    layoutId="lx-selected-row"
                    className="lx-row-selected"
                    transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
                  />
                )}
                <span className="lx-row-icon">{shelfIcon(row.key)}</span>
                {open && <span className="lx-row-label">{row.label}</span>}
                {open && <span className="lx-row-count">{row.count}</span>}
              </button>
              {open && editable && (
                <button
                  type="button"
                  className="lx-row-more lx-icon-button size-6!"
                  aria-label={`${row.label} options`}
                  onClick={(e) => props.onShelfMenu(e, row.key!)}
                >
                  <MoreHorizontal size={14} />
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <div className="lx-sidebar-footer">
        <button
          type="button"
          className={cx("lx-row")}
          data-active={isSettings || undefined}
          onClick={props.onOpenSettings}
          title={open ? undefined : "Settings"}
        >
          <span className="lx-row-icon">
            <Settings size={16} />
          </span>
          {open && <span className="lx-row-label">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
