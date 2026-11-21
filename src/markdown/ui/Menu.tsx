import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Frame } from "./Frame";
import { useLayer } from "./layers";

export interface MenuItem {
  key: string;
  label: ReactNode;
  /** One character before the label. */
  glyph?: ReactNode;
  /** Right-aligned: keys, a value, a check. */
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Draw a section label above this item. */
  section?: string;
  /** Keep the menu open after running (a toggle). */
  stay?: boolean;
  run: () => void;
}

interface MenuProps {
  /** A point (a right-click) or a rect to open under (a button). */
  at: { x: number; y: number } | DOMRect;
  items: MenuItem[];
  onClose: () => void;
  title?: ReactNode;
  width?: number;
  /** Rendered above the items (a search field). */
  header?: ReactNode;
  /** Rendered below the items. */
  footer?: ReactNode;
  className?: string;
  /** Which item starts active. */
  activeKey?: string;
}

/**
 * A framed list at a point or under a button. Arrow keys move, Enter runs, Escape or a click
 * outside closes. Items keep the editor's selection: they never take focus on press.
 */
export function Menu({ at, items, onClose, title, width = 230, header, footer, className, activeKey }: MenuProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(() => Math.max(0, activeKey ? items.findIndex((item) => item.key === activeKey) : 0));
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number }>({ left: -9999, top: -9999, maxHeight: 480 });
  const layer = useLayer(onClose);

  useLayoutEffect(() => {
    const height = box.current?.offsetHeight ?? 240;
    const w = Math.min(width, window.innerWidth - 16);
    const isRect = "width" in at;
    const x = isRect ? at.left : at.x;
    const below = isRect ? at.bottom + 6 : at.y;
    const above = isRect ? at.top - 6 - height : at.y - height;
    const fits = below + height <= window.innerHeight - 8;
    const top = fits ? below : Math.max(8, above);
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - w - 8)), top, maxHeight: window.innerHeight - 16 });
  }, [at, width, items.length]);

  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
  const run = (item: MenuItem | undefined) => {
    if (!item || item.disabled) return;
    if (!item.stay) onClose();
    item.run();
  };

  const latest = useRef({ items, index, run });
  latest.current = { items, index, run };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!layer.isTop()) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      // A field marked `data-own-keys` (a "new shelf" line) keeps its keys; a search field drives
      // the list, except Enter when nothing is listed.
      if (target?.closest("[data-own-keys]")) return;
      if (e.key === "Enter" && target?.tagName === "INPUT" && latest.current.items.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Enter") return latest.current.run(latest.current.items[latest.current.index]);
      if (enabled.length === 0) return;
      const at = enabled.indexOf(latest.current.index);
      const next = e.key === "ArrowDown" ? enabled[(at + 1) % enabled.length] : enabled[(at - 1 + enabled.length) % enabled.length];
      setIndex(next);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled.join(",")]);

  useEffect(() => {
    box.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[130]"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={box}
        role="menu"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="fixed z-[131]"
        style={{ left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 16), animation: "tm-in 140ms var(--ease) both" }}
      >
        <Frame title={title} variant="box" className={cn("tm-layer flex flex-col py-2", title && "pt-3.5", className)} surface="var(--background)">
          {header}
          <div className="min-h-0 overflow-y-auto" style={{ maxHeight: pos.maxHeight - 60 }}>
            {items.map((item, i) => (
              <div key={item.key}>
                {item.section && <div className="tm-section">{item.section}</div>}
                <button
                  type="button"
                  role="menuitem"
                  data-index={i}
                  data-active={i === index || undefined}
                  data-variant={item.danger ? "danger" : undefined}
                  disabled={item.disabled}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => i !== index && !item.disabled && setIndex(i)}
                  onClick={() => run(item)}
                  className="tm-list-item"
                >
                  <span className="tm-lead">{item.glyph ?? ""}</span>
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.hint != null && <span className="tm-meta">{item.hint}</span>}
                </button>
              </div>
            ))}
          </div>
          {footer}
        </Frame>
      </div>
    </>,
    document.body,
  );
}
