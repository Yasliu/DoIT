import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

/**
 * Full-screen image viewer. Pan / zoom state lives in refs and is written straight to the image's
 * transform inside requestAnimationFrame, so dragging and wheel-zooming never re-render React
 * (the parent editor tree is heavy, which made the old state-driven viewer lag).
 */
export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const s = useRef({ zoom: 1, x: 0, y: 0, dragging: false, moved: false, sx: 0, sy: 0, px: 0, py: 0, raf: 0 });

  const paint = useCallback((animate: boolean) => {
    const img = imgRef.current;
    if (!img) return;
    const st = s.current;
    img.style.transition = animate ? "transform 150ms ease-out" : "none";
    img.style.transform = `translate3d(${st.x}px, ${st.y}px, 0) scale(${st.zoom})`;
    if (labelRef.current) labelRef.current.textContent = `${Math.round(st.zoom * 100)}%`;
  }, []);

  const schedulePaint = useCallback(() => {
    const st = s.current;
    if (st.raf) return;
    st.raf = requestAnimationFrame(() => {
      st.raf = 0;
      paint(false);
    });
  }, [paint]);

  // Zoom keeping the point under (cx, cy) fixed
  const zoomAt = useCallback(
    (factor: number, cx: number | null, cy: number | null, animate: boolean) => {
      const st = s.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, st.zoom * factor));
      if (next === st.zoom) return;
      const view = viewRef.current;
      if (view && cx !== null && cy !== null) {
        const r = view.getBoundingClientRect();
        const dx = cx - (r.left + r.width / 2);
        const dy = cy - (r.top + r.height / 2);
        const ratio = next / st.zoom;
        st.x = dx - (dx - st.x) * ratio;
        st.y = dy - (dy - st.y) * ratio;
      }
      st.zoom = next;
      if (next <= 1) {
        st.x = 0;
        st.y = 0;
      }
      if (animate) paint(true);
      else schedulePaint();
    },
    [paint, schedulePaint],
  );

  const reset = useCallback(() => {
    const st = s.current;
    st.zoom = 1;
    st.x = 0;
    st.y = 0;
    paint(true);
  }, [paint]);

  // Non-passive wheel listener (React's onWheel is passive and cannot prevent page scroll)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY, false);
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => view.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Escape closes only the viewer (captured before the editor's own Escape handling)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const st = s.current;
    st.dragging = true;
    st.moved = false;
    st.sx = e.clientX;
    st.sy = e.clientY;
    st.px = st.x;
    st.py = st.y;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = s.current;
    if (!st.dragging) return;
    const dx = e.clientX - st.sx;
    const dy = e.clientY - st.sy;
    if (!st.moved && Math.hypot(dx, dy) > 3) st.moved = true;
    if (!st.moved) return;
    st.x = st.px + dx;
    st.y = st.py + dy;
    schedulePaint();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = s.current;
    if (!st.dragging) return;
    st.dragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (st.moved) return;
    // plain click: outside the picture closes, on the picture toggles 1x <-> 2x
    const r = imgRef.current?.getBoundingClientRect();
    const onImage = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!onImage) {
      onClose();
      return;
    }
    if (st.zoom === 1) zoomAt(2, e.clientX, e.clientY, true);
    else reset();
  };

  const btn =
    "grid size-6 place-items-center rounded text-[14px] font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white cursor-pointer";

  return (
    <div className="fixed inset-0 z-[100] flex select-none flex-col items-center justify-center bg-black/90 p-3">
      <div
        className="z-20 mb-2 flex items-center gap-2 rounded-full border border-white/20 bg-black/80 px-3.5 py-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" className={btn} title="Zoom out" onClick={() => zoomAt(1 / 1.25, null, null, true)}>
          -
        </button>
        <span ref={labelRef} className="min-w-[38px] text-center font-mono text-[10px] font-semibold text-white/90">
          100%
        </span>
        <button type="button" className={btn} title="Zoom in" onClick={() => zoomAt(1.25, null, null, true)}>
          +
        </button>
        <button
          type="button"
          onClick={reset}
          title="Reset zoom (100%)"
          className="ml-1 cursor-pointer rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-white/90 hover:bg-white/20"
        >
          1:1
        </button>
        <span className="mx-0.5 h-3 w-px bg-white/20" />
        <button type="button" className={btn} title="Close preview" onClick={onClose}>
          <X size={13} strokeWidth={2.4} />
        </button>
      </div>

      <div
        ref={viewRef}
        className="relative flex w-full flex-1 cursor-grab items-center justify-center overflow-hidden p-2 active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt="Preview"
          draggable={false}
          decoding="async"
          className="max-h-[78vh] max-w-[90vw] rounded-xl border border-white/20 object-contain"
          style={{ willChange: "transform", transformOrigin: "center center" }}
          title="Drag to move | click to toggle 2x | scroll to zoom"
        />
      </div>
    </div>
  );
}
