import { useEffect, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import {
  CATEGORY_ICON_NAMES,
  CATEGORY_ICONS,
  getCategoryIconName,
  setCategoryIcon,
} from "../lib/categoryIcons";
import { cleanText, cx } from "../lib/text";

interface IconPickerModalProps {
  shelf: string;
  accent?: string;
  onClose: () => void;
}

export function IconPickerModal({ shelf, accent = "#ffffff", onClose }: IconPickerModalProps) {
  const [selected, setSelected] = useState<string | null>(() => getCategoryIconName(shelf));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSelect = (iconName: string | null) => {
    setSelected(iconName);
    setCategoryIcon(shelf, iconName);
  };

  const CurrentIconComp = selected && selected !== "dot" ? CATEGORY_ICONS[selected] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Modal Dialog */}
      <div className="pointer-events-none fixed inset-0 z-[125] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="icon-picker-title"
          onClick={(e) => e.stopPropagation()}
          style={{ animation: "bubblePop 180ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
          className="pointer-events-auto w-full max-w-[380px] rounded-[20px] border border-white/15 bg-[#131418]/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.95)] backdrop-blur-2xl select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="min-w-0 pr-2">
              <h2 id="icon-picker-title" className="text-[13.5px] font-semibold text-white tracking-[-0.01em]">
                Category Icon
              </h2>
              <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-4">
                <span>Shelf:</span>
                <span className="flex items-center gap-1 text-ink-2 truncate max-w-[180px]">
                  <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                  {cleanText(shelf)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid size-7 place-items-center rounded-lg text-ink-4 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              title="Close"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Live Preview Pill */}
          <div className="my-3 flex items-center justify-between px-3 py-2 rounded-[10px] bg-white/[0.04] border border-white/[0.06]">
            <span className="text-[11px] text-ink-4 font-mono uppercase tracking-[0.08em]">Current preview</span>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-[7px] bg-white/[0.06] border border-white/10">
              {CurrentIconComp ? (
                <CurrentIconComp size={14} strokeWidth={2} style={{ color: accent }} className="shrink-0" />
              ) : (
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
              )}
              <span className="text-[12px] font-medium text-ink-1 truncate max-w-[130px]">{cleanText(shelf)}</span>
            </div>
          </div>

          {/* Icon Grid */}
          <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-ink-4 mb-2">
            Choose an icon ({CATEGORY_ICON_NAMES.length} presets)
          </div>

          <div className="grid grid-cols-6 gap-2 max-h-[240px] overflow-y-auto scroll pr-1 p-0.5">
            {CATEGORY_ICON_NAMES.map((name) => {
              const IconComponent = CATEGORY_ICONS[name];
              const isSelected = selected === name;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelect(name)}
                  title={name}
                  className={cx(
                    "group relative grid size-11 place-items-center rounded-[12px] transition-all duration-150 cursor-pointer",
                    isSelected
                      ? "bg-white/[0.14] text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.35)] scale-[1.03]"
                      : "bg-white/[0.035] text-ink-3 hover:bg-white/[0.09] hover:text-white hover:scale-105",
                  )}
                >
                  <IconComponent
                    size={17}
                    strokeWidth={isSelected ? 2.2 : 1.8}
                    style={{ color: isSelected ? accent : undefined }}
                    className="transition-colors group-hover:!text-white"
                  />
                  {isSelected && (
                    <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-white text-black grid place-items-center shadow-sm">
                      <Check size={9} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="mt-4 pt-3 flex items-center justify-between border-t border-white/10 gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSelect("dot")}
                className={cx(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11px] font-medium transition-colors cursor-pointer",
                  selected === "dot"
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-ink-4 hover:bg-white/[0.06] hover:text-ink-2",
                )}
                title="Use a minimalist accent dot"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
                <span>Dot</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11px] font-medium text-ink-4 hover:bg-white/[0.06] hover:text-ink-2 transition-colors cursor-pointer"
                title="Reset to default theme icon"
              >
                <RotateCcw size={11} strokeWidth={2} />
                <span>Reset</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-[8px] bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-colors cursor-pointer shadow-sm shrink-0"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
