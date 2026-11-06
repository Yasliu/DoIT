import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Image as ImageIcon, Check } from "lucide-react";

interface EditImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  alt: string;
  src: string;
  refKey?: string;
  onSave: (newAlt: string) => void;
}

export function EditImageModal({
  isOpen,
  onClose,
  alt: initialAlt,
  src,
  refKey,
  onSave,
}: EditImageModalProps) {
  const [alt, setAlt] = useState(initialAlt);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAlt(initialAlt);
    }
  }, [isOpen, initialAlt]);

  // Handle outside click & escape
  useEffect(() => {
    if (!isOpen) return;
    const handleDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        onClose();
        return;
      }
      if (e instanceof MouseEvent && cardRef.current && !cardRef.current.contains(e.target as Node)) {
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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(alt.trim() || "Image");
    onClose();
  };

  return createPortal(
    <div
      ref={cardRef}
      className="fixed bottom-6 right-6 z-[99999] w-[340px] rounded-2xl border border-white/20 bg-[#121317]/95 p-4 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl text-white select-none animate-in fade-in-0 slide-in-from-bottom-5 slide-in-from-right-3 duration-200 ease-out"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <ImageIcon size={15} className="text-white/70" />
          <h3 className="text-[13px] font-medium tracking-tight">Edit Alt Text</h3>
          {refKey && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9.5px] text-white/60">
              [{refKey}]
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {src && (
            <div className="size-12 shrink-0 rounded-lg border border-white/10 bg-black/50 p-1 flex items-center justify-center overflow-hidden">
              <img
                src={src}
                alt={alt}
                className="size-full object-cover rounded"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
              Alt Text / Label
            </label>
            <input
              type="text"
              autoFocus
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="e.g. Workflow Diagram"
              className="w-full h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[12px] text-white placeholder:text-white/25 focus:border-white/30 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/[0.07]">
          <button
            type="button"
            onClick={onClose}
            className="h-7 rounded-lg px-3 text-[11.5px] font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 h-7 rounded-lg bg-white px-3 text-[11.5px] font-medium text-black hover:bg-white/90 transition-all cursor-pointer shadow-sm"
          >
            <Check size={12} strokeWidth={2.5} />
            <span>Save</span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
