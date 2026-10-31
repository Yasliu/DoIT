import { useEffect, useRef, useState } from "react";
import { Mark } from "./Mark";
import { tauriApi } from "../api/tauriBridge";

export function TrayPill() {
  const [shown, setShown] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || busy.current) return;
    const startX = e.screenX;
    const startY = e.screenY;
    let dragging = false;

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    const onMove = (ev: PointerEvent) => {
      if (dragging) return;
      if (Math.hypot(ev.screenX - startX, ev.screenY - startY) > 4) {
        dragging = true;
        cleanup();
        void tauriApi.beginDrag();
      }
    };
    const onUp = () => {
      cleanup();
      if (!dragging) {
        busy.current = true;
        void tauriApi.expandTrayFromPill().finally(() => {
          busy.current = false;
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent select-none" style={{ background: "transparent" }}>
      <div
        onPointerDown={onPointerDown}
        onContextMenu={(e) => {
          e.preventDefault();
          void tauriApi.showTrayContextMenu();
        }}
        title="Click to open Desk Tray · Hold and drag to move"
        className="box-border flex h-full w-full cursor-pointer items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-2xl border border-white/10 text-ink-1 transition-opacity duration-200 ease-out"
        style={{
          opacity: shown ? 1 : 0,
          backgroundColor: "var(--theme-tray-bg)",
          backdropFilter: "var(--theme-tray-blur)",
          WebkitBackdropFilter: "var(--theme-tray-blur)",
          boxShadow: "inset 0 0 0 1px var(--theme-tray-border)",
        }}
      >
        <Mark size={13} className="shrink-0 block pointer-events-none" />
        <span className="pointer-events-none text-[13px] font-semibold leading-none tracking-[0.02em] text-white/85 whitespace-nowrap">
          DoIT
        </span>
      </div>
    </div>
  );
}
