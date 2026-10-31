import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { comboFromEvent } from "../lib/shortcuts";

const ARROWS: Record<string, typeof ArrowRight> = { ArrowLeft, ArrowRight, ArrowUp, ArrowDown };

interface ShortcutFieldProps {
  value: string;
  def: string;
  onChange: (combo: string) => void;
}

/** Same look as the default shortcut boxes; arrows render as icons. Click, then press the new combination. */
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
      className="flex h-7 min-w-24 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-white/15 bg-black/40 px-2.5 font-mono text-[11.5px] text-white outline-none focus:border-white/40"
    >
      {listening ? (
        <span className="text-ink-4">Press keys...</span>
      ) : (
        parts.map((k, i) => {
          const Icon = ARROWS[k];
          return (
            <span key={`${k}-${i}`} className="inline-flex items-center">
              {i > 0 && <span>+</span>}
              {Icon ? <Icon size={12} strokeWidth={2.2} className="mx-px" /> : k}
            </span>
          );
        })
      )}
    </button>
  );
}