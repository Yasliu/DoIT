import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Image as ImageIcon, Check } from "lucide-react";

interface EditImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  alt: string;
  src: string;
  refKey?: string;
  onSave: (newAlt: string, newSrc: string) => void;
}

export function EditImageModal({
  isOpen,
  onClose,
  alt: initialAlt,
  src: initialSrc,
  refKey,
  onSave,
}: EditImageModalProps) {
  const [alt, setAlt] = useState(initialAlt);
  const [src, setSrc] = useState(initialSrc);

  useEffect(() => {
    if (isOpen) {
      setAlt(initialAlt);
      setSrc(initialSrc);
    }
  }, [isOpen, initialAlt, initialSrc]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(alt.trim() || "Image", src.trim());
    onClose();
  };

  const isBase64 = src.startsWith("data:");

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl border border-white/15 bg-[#121317]/95 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl text-white select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-white/70" />
            <h3 className="text-[14px] font-medium tracking-tight">Edit Image</h3>
            {refKey && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/60">
                [{refKey}]
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3.5">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1.5">
              Alt Text
            </label>
            <input
              type="text"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Descriptive image label"
              className="w-full h-8.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[12.5px] text-white placeholder:text-white/25 focus:border-white/30 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1.5">
              Source URL / Data
            </label>
            {isBase64 ? (
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white/60 font-mono">
                <span>Embedded Image ({refKey || "Base64"})</span>
                <span className="text-emerald-400 font-semibold text-[10px]">Inline Reference</span>
              </div>
            ) : (
              <input
                type="text"
                value={src}
                onChange={(e) => setSrc(e.target.value)}
                placeholder="https://... or image path"
                className="w-full h-8.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[12px] font-mono text-white placeholder:text-white/25 focus:border-white/30 outline-none transition-colors"
              />
            )}
          </div>

          {/* Thumbnail preview */}
          {src && (
            <div className="rounded-xl border border-white/10 bg-black/40 p-2 flex items-center justify-center max-h-[160px] overflow-hidden">
              <img
                src={src}
                alt={alt}
                className="max-h-[144px] max-w-full rounded object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg px-3.5 text-[12px] font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 h-8 rounded-lg bg-white px-3.5 text-[12px] font-medium text-black hover:bg-white/90 transition-all cursor-pointer shadow-sm"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
