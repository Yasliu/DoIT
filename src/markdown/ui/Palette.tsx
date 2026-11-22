import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Frame } from "./Frame";
import { useLayer } from "./layers";

export interface PaletteItem {
  key: string;
  section?: string;
  /** One character before the label. */
  lead?: ReactNode;
  label: ReactNode;
  /** Muted text after the label (a snippet). */
  detail?: ReactNode;
  /** Right-aligned (a shelf, a time, keys). */
  meta?: ReactNode;
  run: () => void;
}

interface PaletteProps {
  title: string;
  placeholder: string;
  query: string;
  onQuery: (query: string) => void;
  items: PaletteItem[];
  /** Which item starts active when the list changes. */
  initialKey?: string;
  onClose: () => void;
  /** Extra keys while the input has focus; return true when handled. */
  onKey?: (event: React.KeyboardEvent<HTMLInputElement>, active: PaletteItem | undefined) => boolean;
  /** Extra content in the footer, at the right. */
  footer?: (active: PaletteItem | undefined) => ReactNode;
  empty?: ReactNode;
  prompt?: string;
}

/**
 * A command line over a list: type to filter, arrows move, Enter runs, Escape closes. The active
 * row is drawn inverted, like a terminal selection.
 */
export function Palette(props: PaletteProps) {
  const { items, query } = props;
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  useLayer(props.onClose);

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
    }
  };

  let lastSection: string | undefined;
  return createPortal(
    <>
      <div className="tm-scrim" style={{ animation: "tm-fade 140ms var(--ease) both" }} onMouseDown={props.onClose} />
      <div className="pointer-events-none fixed inset-x-0 top-[11vh] z-[125] flex justify-center px-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          className="pointer-events-auto w-full max-w-[640px]"
          style={{ animation: "tm-in 180ms var(--ease) both" }}
        >
          <Frame title={props.title} className="tm-layer pt-4" surface="var(--background)">
            <div className="tm-rule-b flex h-12 items-center gap-[1ch] px-[2ch]">
              <span className="text-graph-accent">{props.prompt ?? "›"}</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => props.onQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={props.placeholder}
                aria-label={props.title}
                aria-controls="tm-palette-list"
                aria-activedescendant={active ? `tm-palette-${active.key}` : undefined}
                role="combobox"
                aria-expanded
                spellCheck={false}
                className="h-full min-w-0 flex-1 text-[14px] caret-[var(--graph-accent)]"
              />
            </div>
            <div ref={listRef} id="tm-palette-list" role="listbox" className="max-h-[min(52vh,460px)] overflow-y-auto py-3">
              {items.length === 0 && <div className="px-[2ch] py-8 text-center text-graph-muted">{props.empty ?? "no results"}</div>}
              {items.map((item, i) => {
                const heading = item.section && item.section !== lastSection ? item.section : null;
                lastSection = item.section;
                return (
                  <div key={item.key}>
                    {heading && <div className="tm-section px-[2ch]">{heading}</div>}
                    <div
                      id={`tm-palette-${item.key}`}
                      role="option"
                      aria-selected={i === index}
                      data-index={i}
                      data-active={i === index || undefined}
                      onMouseMove={() => i !== index && setIndex(i)}
                      onClick={() => item.run()}
                      className="tm-list-item px-[2ch]"
                    >
                      <span className="tm-lead">{i === index ? "▸" : (item.lead ?? "")}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span>{item.label}</span>
                        {item.detail && <span className="ml-[2ch] opacity-60">{item.detail}</span>}
                      </span>
                      {item.meta != null && <span className="tm-meta">{item.meta}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {props.footer && <div className="tm-rule-t flex h-11 items-center justify-end px-[2ch]">{props.footer(active)}</div>}
          </Frame>
        </div>
      </div>
    </>,
    document.body,
  );
}
