import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Edit3, Maximize2, Trash2, Check } from "lucide-react";
import { copyImageToClipboard } from "../lib/format";

interface ImageContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  imgElement: HTMLImageElement | null;
  onClose: () => void;
  onEdit: () => void;
  onZoom: () => void;
  onDelete: () => void;
}

export function ImageContextMenu({
  isOpen,
  x,
  y,
  imgElement,
  onClose,
  onEdit,
  onZoom,
  onDelete,
}: ImageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        onClose();
        return;
      }
      if (e instanceof MouseEvent && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleDown);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !imgElement) return null;

  const handleCopy = async () => {
    const src = imgElement.src;
    const ok = await copyImageToClipboard(src);
    if (ok) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 700);
    }
  };

  // Keep menu on screen
  const menuWidth = 190;
  const menuHeight = 160;
  const clampedX = Math.max(10, Math.min(x, window.innerWidth - menuWidth - 10));
  const clampedY = Math.max(10, Math.min(y, window.innerHeight - menuHeight - 10));

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: clampedX, top: clampedY }}
      className="fixed z-[99999] w-[184px] rounded-xl border border-white/15 bg-[#14151a]/95 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-xl text-white select-none animate-in fade-in-0 zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleCopy}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
      >
        {copied ? (
          <Check size={13} className="text-emerald-400 shrink-0" />
        ) : (
          <Copy size={13} className="text-white/60 shrink-0" />
        )}
        <span>{copied ? "Copied!" : "Copy Image"}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onClose();
          onZoom();
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
      >
        <Maximize2 size={13} className="text-white/60 shrink-0" />
        <span>Zoom Image</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onClose();
          onEdit();
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
      >
        <Edit3 size={13} className="text-white/60 shrink-0" />
        <span>Edit Alt Text</span>
      </button>

      <div className="my-1 h-px bg-white/10" />

      <button
        type="button"
        onClick={() => {
          onClose();
          onDelete();
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-colors cursor-pointer"
      >
        <Trash2 size={13} className="shrink-0" />
        <span>Delete Image</span>
      </button>
    </div>,
    document.body
  );
}
