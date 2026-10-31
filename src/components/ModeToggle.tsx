import { Code, Eye } from "lucide-react";
import { cx } from "../lib/text";

interface ModeToggleProps {
  rawMode: boolean;
  onChange: (raw: boolean) => void;
  compact?: boolean;
}

/** Segmented control: MD Mode (rendered markdown, .md) <-> Text Mode (raw monospace source, .txt). */
export function ModeToggle({ rawMode, onChange, compact = false }: ModeToggleProps) {
  const base = cx(
    "flex items-center gap-1.5 rounded-[7px] font-mono uppercase tracking-[0.08em] transition-colors duration-150",
    compact ? "h-5 px-2 text-[9px]" : "h-6 px-2.5 text-[10px]",
  );
  return (
    <div
      role="group"
      aria-label="Editor mode"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-[9px] border border-white/[0.1] bg-white/[0.03] p-0.5"
    >
      <button
        type="button"
        aria-pressed={!rawMode}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(false)}
        title="MD Mode: render markdown (saved as .md)"
        className={cx(base, !rawMode ? "bg-white text-black" : "text-ink-3 hover:bg-white/[0.08] hover:text-ink-1")}
      >
        <Eye size={compact ? 10 : 11} strokeWidth={2} />
        <span className="whitespace-nowrap">MD{compact ? "" : " Mode"}</span>
      </button>
      <button
        type="button"
        aria-pressed={rawMode}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(true)}
        title="Text Mode: raw monospace source (saved as .txt)"
        className={cx(base, rawMode ? "bg-white text-black" : "text-ink-3 hover:bg-white/[0.08] hover:text-ink-1")}
      >
        <Code size={compact ? 10 : 11} strokeWidth={2} />
        <span className="whitespace-nowrap">Text{compact ? "" : " Mode"}</span>
      </button>
    </div>
  );
}
