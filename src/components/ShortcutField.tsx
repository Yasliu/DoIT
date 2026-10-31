import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { comboFromEvent } from "../lib/shortcuts";

const ARROWS: Record<string, typeof ArrowRight> = {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
};

function KeyCap({ k }: { k: string }) {
  const Icon = ARROWS[k];
  return (
    <kbd className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[6px] border border-white/15 bg-white/[0.07] px-1.5 font-mono text-[10.5px] leading-none text-white">
      {Icon ? <Icon size={11} strokeWidth={2.4} /> : k}
    </kbd>
  );
}

interface ShortcutFieldProps {
  value: string;
  def: string;
  onChange: (combo: string) => void;
}

/** Click, then press the new combination. Arrow keys show as theme-matched arrow icons. */
export function ShortcutField({ value, def, onChange }: ShortcutFieldProps) {
  const [listening, setListening] = useState(false);
  const parts = (value || def).split("+").filter(Boolean);

  return (
    <button
      type="button"
      onFocus={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={(e) => {
        if (e.key === "Tab") return;
        e.preventDefault();
        if (e.key === "Backspace" || e.key === "Delete") {
          onChange(def);
          return;
        }
        const combo = comboFromEvent(e);
        if (combo && combo.includes("+")) onChange(combo);
      }}
      title="Click, then press the new key combination (Backspace restores the default)"
      className="flex min-h-[28px] shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1 outline-none transition-colors hover:border-white/30 focus:border-white/50"
    >
      {listening ? (
        <span className="px-1 font-mono text-[10.5px] text-ink-4">Press keys...</span>
      ) : (
        parts.map((k, i) => <KeyCap key={`${k}-${i}`} k={k} />)
      )}
    </button>
  );
}
