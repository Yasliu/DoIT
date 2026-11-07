import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { cx } from "../../lib/text";

export interface PaletteItem {
  key: string;
  section?: string;
  icon: ReactNode;
  label: ReactNode;
  /** Muted text after the label (a snippet, a hint). */
  detail?: ReactNode;
  /** Right-aligned text (shelf, time, shortcut). */
  meta?: ReactNode;
  run: () => void;
}

interface LinuxPaletteProps {
  label: string;
  placeholder: string;
  query: string;
  onQuery: (query: string) => void;
  items: PaletteItem[];
  /** Which item starts active when the list changes. */
  initialKey?: string;
  onClose: () => void;
  /** Extra keys while the input has focus; return true when handled. */
  onKey?: (event: React.KeyboardEvent<HTMLInputElement>, active: PaletteItem | undefined) => boolean;
  footer?: (active: PaletteItem | undefined) => ReactNode;
  empty?: ReactNode;
  /** The field's icon (a magnifier by default) and what Enter does, for the hint. */
  icon?: ReactNode;
  enterLabel?: string;
  /** Centre on this element (the title-bar search field)... */
  anchorSelector?: string;
  /** ...and open with the top edge just above this one (the first shelf's divider). */
  topSelector?: string;
}

/** The title-bar search field and the first shelf's divider: dialogs line up with both. */
export const SEARCH_FIELD = ".lx-search-trigger";
export const FIRST_SHELF_LINE = '[data-slot="shelf-head"]';

const PALETTE_WIDTH = 620;

/**
 * Wrapper props for a dialog `width` wide, lined up with the search field like the palettes; centred
 * on the window when the field is not on screen.
 */
export function useDialogPlacement(width: number): { className: string; style?: React.CSSProperties } {
  const [style] = useState(() => placement(SEARCH_FIELD, FIRST_SHELF_LINE, width));
  return style
    ? { className: "pointer-events-none fixed z-[125]", style }
    : { className: "pointer-events-none fixed inset-x-0 top-[16vh] z-[125] flex justify-center px-4" };
}

/** Below the field, where the first shelf's divider sits on an unscrolled canvas. */
const DEFAULT_DROP = 128;


/**
 * Where a dialog `width` wide sits: centred on the anchor (the search field) and opening just above
 * the `below` line. Null when the anchor is not on screen; then the caller centres on the window.
 */
export function placement(anchor: string | undefined, below: string | undefined, width = PALETTE_WIDTH): React.CSSProperties | null {
  const rect = anchor ? document.querySelector(anchor)?.getBoundingClientRect() : null;
  if (!rect) return null;
  const half = Math.min(width, window.innerWidth - 32) / 2;
  const x = Math.min(Math.max(rect.left + rect.width / 2, half + 16), window.innerWidth - half - 16);
  const line = below ? document.querySelector(below)?.getBoundingClientRect() : null;
  // Just above the line while it is in view below the field; else the usual drop.
  const top = line && line.top > rect.bottom + 24 ? line.top - 12 : rect.bottom + DEFAULT_DROP;
  return { left: x, top: Math.min(top, window.innerHeight * 0.3), width: half * 2, transform: "translateX(-50%)" };
}

/**
 * A Raycast-style palette: a search field over a keyboard-driven list, centred near the top of the
 * window. Up and Down move, Enter runs the active item, Escape closes.
 */
export function LinuxPalette(props: LinuxPaletteProps) {
  const { items, query } = props;
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [anchored] = useState(() => placement(props.anchorSelector, props.topSelector));

  // A new list (typing) starts from the preferred item, or the top.
  useLayoutEffect(() => {
    const preferred = props.initialKey ? items.findIndex((item) => item.key === props.initialKey) : -1;
    setIndex(preferred >= 0 ? preferred : 0);
  }, [query, items.length, props.initialKey]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const active = items[index];

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.onKey?.(e, active)) return;
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault();
      setIndex((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault();
      setIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      active?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    }
  };

  let lastSection: string | undefined;
  return createPortal(
    <>
      <div className="lx-scrim" onMouseDown={props.onClose} />
      <div
        className={anchored ? "pointer-events-none fixed z-[125]" : "pointer-events-none fixed inset-x-0 top-[12vh] z-[125] flex justify-center px-4"}
        style={anchored ?? undefined}
      >
        <div role="dialog" aria-modal="true" aria-label={props.label} className="lx-palette">
          <div className="flex h-12 items-center gap-3 px-4">
            <span className="grid shrink-0 place-items-center text-ink-3">{props.icon ?? <Search size={17} />}</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => props.onQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={props.placeholder}
              aria-label={props.label}
              aria-controls="lx-palette-list"
              aria-activedescendant={active ? `lx-palette-${active.key}` : undefined}
              role="combobox"
              aria-expanded
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink-1 placeholder:text-[var(--l-placeholder)]"
            />
          </div>
          <div ref={listRef} id="lx-palette-list" role="listbox" className="lx-palette-list">
            {items.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-ink-3">{props.empty ?? "No results"}</div>}
            {items.map((item, i) => {
              const heading = item.section && item.section !== lastSection ? item.section : null;
              lastSection = item.section;
              return (
                <div key={item.key}>
                  {heading && <div className="lx-palette-section">{heading}</div>}
                  <div
                    id={`lx-palette-${item.key}`}
                    role="option"
                    aria-selected={i === index}
                    data-index={i}
                    onMouseMove={() => i !== index && setIndex(i)}
                    onClick={() => item.run()}
                    className={cx("lx-palette-item", i === index && "is-active")}
                  >
                    <span className="lx-palette-icon">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-ink-1">{item.label}</span>
                      {item.detail && <span className="ml-2 text-ink-3">{item.detail}</span>}
                    </span>
                    {item.meta && <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{item.meta}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="lx-palette-footer">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> to move
            </span>
            <span>
              <kbd>Enter</kbd> to {props.enterLabel ?? "open"}
            </span>
            <span>
              <kbd>Esc</kbd> to close
            </span>
            <span className="ml-auto flex items-center gap-2">{props.footer?.(active)}</span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
