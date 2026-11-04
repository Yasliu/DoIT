import { Code, Eye } from "lucide-react";
import { cx } from "../lib/text";

interface ModeToggleProps {
  rawMode: boolean;
  onChange: (raw: boolean) => void;
  compact?: boolean;
  large?: boolean;
}

/** Segmented control: MD Mode (rendered markdown, .md) <-> Text Mode (raw monospace source, .txt). */
export function ModeToggle({ rawMode, onChange, compact = false, large = false }: ModeToggleProps) {
  const base = cx(
    "flex items-center rounded-[7px] font-mono uppercase tracking-[0.08em] transition-all duration-200 ease-out cursor-pointer",
    large ? "h-7.5 px-3 text-[11px] gap-2" : (compact ? "h-5 px-1.5 text-[9px] gap-1" : "h-6 px-2.5 text-[10px] gap-1.5"),
  );
  return (
    <div
      role="group"
      aria-label="Editor mode"
      className={cx(
        "inline-flex shrink-0 items-center gap-0.5 rounded-[9px] border border-white/[0.1] bg-white/[0.03] transition-all duration-200 ease-out",
        large ? "p-1" : "p-0.5",
      )}
    >
      <button
        type="button"
        aria-pressed={!rawMode}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(false)}
        title="MD Mode: render markdown (saved as .md)"
        className={cx(base, !rawMode ? "bg-white text-black" : "text-ink-3 hover:bg-white/[0.08] hover:text-ink-1")}
      >
        <Eye size={large ? 13 : (compact ? 10 : 11)} strokeWidth={2} className="shrink-0 transition-transform duration-200" />
        <span className="whitespace-nowrap inline-flex items-center">
          MD
          <span
            className={cx(
              "inline-block overflow-hidden transition-all duration-200 ease-out",
              compact ? "max-w-0 opacity-0" : "max-w-[40px] opacity-100",
            )}
          >
            &nbsp;Mode
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-pressed={rawMode}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(true)}
        title="Text Mode: raw monospace source (saved as .txt)"
        className={cx(base, rawMode ? "bg-white text-black" : "text-ink-3 hover:bg-white/[0.08] hover:text-ink-1")}
      >
        <Code size={large ? 13 : (compact ? 10 : 11)} strokeWidth={2} className="shrink-0 transition-transform duration-200" />
        <span className="whitespace-nowrap inline-flex items-center">
          Text
          <span
            className={cx(
              "inline-block overflow-hidden transition-all duration-200 ease-out",
              compact ? "max-w-0 opacity-0" : "max-w-[40px] opacity-100",
            )}
          >
            &nbsp;Mode
          </span>
        </span>
      </button>
    </div>
  );
}
