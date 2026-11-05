import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Mark } from "./Mark";
import { tauriApi } from "../api/tauriBridge";

export function TrayPill({ onOpen }: { onOpen: () => void }) {
  const [shown, setShown] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const busy = useRef(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const reset = () => {
      setHovered(false);
      setPressed(false);
    };
    window.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("pointerup", reset);
    return () => {
      window.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener("pointerup", reset);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || busy.current) return;
    setPressed(true);
    const startX = e.screenX;
    const startY = e.screenY;

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    const onMove = (ev: PointerEvent) => {
      if (isDraggingRef.current) return;
      if (Math.hypot(ev.screenX - startX, ev.screenY - startY) > 4) {
        isDraggingRef.current = true;
        cleanup();
        setPressed(false);
        setHovered(false);
        void tauriApi.beginDrag().finally(() => {
          isDraggingRef.current = false;
          setPressed(false);
          setHovered(false);
        });
      }
    };
    const onUp = () => {
      cleanup();
      setPressed(false);
      if (!isDraggingRef.current) {
        busy.current = true;
        onOpen();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-transparent select-none p-1.5 overflow-hidden"
      style={{ background: "transparent" }}
    >
      <motion.div
        onPointerDown={onPointerDown}
        onPointerEnter={() => {
          if (!isDraggingRef.current) setHovered(true);
        }}
        onPointerLeave={() => {
          setHovered(false);
          setPressed(false);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          void tauriApi.showTrayContextMenu();
        }}
        animate={{
          scale: pressed ? 0.96 : hovered ? 1.055 : 1,
        }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
        title="Click to open Docking Mode · Hold and drag to move"
        className="box-border flex h-[38px] w-[172px] cursor-pointer items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-2xl border border-white/10 text-ink-1"
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
      </motion.div>
    </div>
  );
}
