import { useState } from "react";
import { comboFromEvent } from "../../lib/shortcuts";
import { Kbd } from "../ui";

interface ShortcutFieldProps {
  value: string;
  def: string;
  onChange: (combo: string) => void;
}

/** Keys as `[ctrl][b]`. Focus it, then press the new combination; Backspace restores the default. */
export function ShortcutField({ value, def, onChange }: ShortcutFieldProps) {
  const [listening, setListening] = useState(false);
  const keys = value || def;

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
      title="Focus, then press the new keys (Backspace restores the default)"
      className="flex h-7 min-w-[14ch] shrink-0 items-center justify-end whitespace-nowrap px-[1ch] text-[12px] hover:bg-hover focus:bg-invert focus:text-background focus:outline-none"
    >
      {listening ? <span className="tm-caret">press keys</span> : keys ? <Kbd keys={keys} className="text-inherit" /> : <span className="text-graph-muted">set keys</span>}
    </button>
  );
}
