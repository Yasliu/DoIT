import { useCallback, useEffect, useRef, useState } from "react";
import { copyImageToClipboard, openExternalUrl } from "../../lib/format";
import { Btn, Glyph, useLayer } from "../ui";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

/**
 * High-fidelity image viewer with native-resolution rasterization.
 * Dynamically sizes the img element to eliminate low-res GPU layer caching,
 * ensuring razor-sharp clarity in compact companion windows and full screens.
 */
export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const s = useRef({
    zoom: 1,
    x: 0,
    y: 0,
    dragging: false,
    moved: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
    raf: 0,
    natW: 0,
    natH: 0,
    fitScale: 1,
  });
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyImageToClipboard(src);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const updateSize = useCallback(() => {
    const img = imgRef.current;
    const view = viewRef.current;
    if (!img || !view) return;
    const st = s.current;
    if (!st.natW || !st.natH) {
      st.natW = img.naturalWidth || 800;
      st.natH = img.naturalHeight || 600;
    }
    const viewW = view.clientWidth || window.innerWidth;
    const viewH = view.clientHeight || window.innerHeight;
    const availW = Math.max(120, viewW - 24);
    const availH = Math.max(120, viewH - 40);

    st.fitScale = Math.min(availW / st.natW, availH / st.natH, 1);
  }, []);

  const paint = useCallback((animate: boolean) => {
    const img = imgRef.current;
    if (!img) return;
    const st = s.current;

    const baseW = (st.natW || 800) * (st.fitScale || 1);
    const baseH = (st.natH || 600) * (st.fitScale || 1);
    const targetW = Math.round(baseW * st.zoom);
    const targetH = Math.round(baseH * st.zoom);

    img.style.transition = animate ? "transform 140ms ease-out, width 140ms ease-out, height 140ms ease-out" : "none";
    img.style.width = `${targetW}px`;
    img.style.height = `${targetH}px`;
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
    img.style.transform = `translate3d(${st.x}px, ${st.y}px, 0)`;

    if (labelRef.current) {
      const isNative = Math.abs(st.zoom * st.fitScale - 1) < 0.05;
      labelRef.current.textContent = isNative ? "1:1" : `${Math.round(st.zoom * 100)}%`;
    }
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

  const toggleNative = useCallback(() => {
    const st = s.current;
    if (st.fitScale && st.fitScale < 1) {
      const nativeZoom = 1 / st.fitScale;
      if (Math.abs(st.zoom - nativeZoom) < 0.1) {
        reset();
      } else {
        st.zoom = nativeZoom;
        st.x = 0;
        st.y = 0;
        paint(true);
      }
    } else {
      if (st.zoom === 1) zoomAt(2, null, null, true);
      else reset();
    }
  }, [paint, reset, zoomAt]);

  const handleImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    s.current.natW = img.naturalWidth;
    s.current.natH = img.naturalHeight;
    updateSize();
    paint(false);
  };

  useEffect(() => {
    updateSize();
    paint(false);
  }, [updateSize, paint]);

  // Non-passive wheel listener (React's onWheel is passive and cannot prevent page scroll)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY, false);
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => view.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Escape closes only the viewer.
  useLayer(onClose);

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
    const r = imgRef.current?.getBoundingClientRect();
    const onImage = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!onImage) {
      onClose();
      return;
    }
    if (st.zoom === 1) zoomAt(2, e.clientX, e.clientY, true);
    else reset();
  };

  return (
    <div className="tm-shell fixed inset-0 z-[100] flex select-none flex-col items-center justify-center bg-background/95 p-3" style={{ animation: "tm-fade 140ms var(--ease) both" }}>
      <div className="tm-layer graph-frame z-20 mb-3 flex items-center gap-[1ch] px-[1ch] py-1" onPointerDown={(e) => e.stopPropagation()}>
        <Glyph label="Zoom out" size="sm" onClick={() => zoomAt(1 / 1.25, null, null, true)}>
          −
        </Glyph>
        <span ref={labelRef} className="w-[6ch] text-center text-[11px] tabular-nums">
          100%
        </span>
        <Glyph label="Zoom in" size="sm" onClick={() => zoomAt(1.25, null, null, true)}>
          +
        </Glyph>
        <Btn onClick={toggleNative} title="Original pixels, or fit" className="h-6 text-[11px]">
          1:1
        </Btn>
        <Btn onClick={handleCopy} title="Copy the full-resolution image" className="h-6 text-[11px]">
          {copied ? "copied" : "copy"}
        </Btn>
        <Btn onClick={() => openExternalUrl(src)} title="Open in the system viewer" className="h-6 text-[11px]">
          open ↗
        </Btn>
        <span className="text-graph-frame">│</span>
        <Glyph label="Close preview (Esc)" size="sm" onClick={onClose}>
          ×
        </Glyph>
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
          onLoad={handleImgLoad}
          className="object-contain outline outline-1 outline-offset-4 outline-[var(--graph-frame)]"
          style={{ imageRendering: "-webkit-optimize-contrast", transformOrigin: "center center" }}
          title="Drag to pan · click to zoom 2x · scroll to zoom"
        />
      </div>
    </div>
  );
}
