import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Glyph } from "./controls";
import { Frame } from "./Frame";
import { useLayer } from "./layers";

interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** `top` opens near the top like a command palette; `center` sits mid-window. */
  placement?: "top" | "center";
  role?: "dialog" | "alertdialog";
  /** Shown on the bottom edge at the right. */
  foot?: ReactNode;
  className?: string;
  /** Leave out the × on the top edge. */
  bare?: boolean;
}

const FOCUSABLE = "input, textarea, button:not(:disabled), [tabindex]:not([tabindex='-1'])";

/**
 * A modal figure: the figure frame over a dimmed window. Escape and a click outside close it, Tab stays
 * inside, and focus returns to where it was.
 */
export function Dialog({ title, onClose, children, width = 440, placement = "center", role = "dialog", foot, className, bare }: DialogProps) {
  const box = useRef<HTMLDivElement | null>(null);
  useLayer(onClose);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = box.current;
    const first = root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
    e.preventDefault();
    items[next].focus();
  };

  return createPortal(
    <>
      <div className="tm-scrim" style={{ animation: "tm-fade 160ms var(--ease) both" }} onMouseDown={onClose} />
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[125] flex justify-center px-4",
          placement === "top" ? "items-start pt-[13vh]" : "items-center",
        )}
      >
        <div
          ref={box}
          role={role}
          aria-modal="true"
          onKeyDown={trapTab}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto w-full"
          style={{ maxWidth: width, animation: "tm-in 200ms var(--ease) both" }}
        >
          <Frame title={title} foot={foot} className={cn("tm-layer px-[3ch] pb-6 pt-7", className)} surface="var(--background)">
            {!bare && (
              <span className="absolute right-[1.5ch] top-0 z-20 -translate-y-1/2 bg-background px-[0.5ch]">
                <Glyph label="Close" size="sm" onClick={onClose}>
                  ×
                </Glyph>
              </span>
            )}
            {children}
          </Frame>
        </div>
      </div>
    </>,
    document.body,
  );
}
