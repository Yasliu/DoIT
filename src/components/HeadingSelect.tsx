import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { getHeadingLevel } from "../lib/format";
import { cx } from "../lib/text";

const OPTIONS = [
  { level: 0, label: "Normal Text", sample: "text-[12px] font-normal" },
  { level: 1, label: "Heading 1", sample: "text-[15px] font-bold" },
  { level: 2, label: "Heading 2", sample: "text-[13.5px] font-semibold" },
  { level: 3, label: "Heading 3", sample: "text-[12.5px] font-semibold" },
] as const;

interface HeadingSelectProps {
  editorRef: React.RefObject<HTMLElement | null>;
  onSelect: (level: number) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function HeadingSelect({ editorRef, onSelect, compact = false, disabled = false }: HeadingSelectProps) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const update = () => {
      const ed = editorRef.current;
      const sel = window.getSelection();
      if (!ed || !sel || !sel.anchorNode || !ed.contains(sel.anchorNode)) return;
      setLevel(getHeadingLevel(ed));
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [editorRef]);

  const current = OPTIONS.find((o) => o.level === level) ?? OPTIONS[0];

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="Text style"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cx(
          "flex items-center gap-1 rounded-md text-ink-3 transition-colors hover:bg-white/[0.08] hover:text-ink-1 disabled:opacity-30",
          compact ? "h-6 px-1.5 text-[10.5px]" : "h-7 px-2 text-[11.5px]",
          open && "bg-white/[0.08] text-ink-1",
        )}
      >
        <span className="whitespace-nowrap">{current.label}</span>
        <ChevronDown size={compact ? 9 : 10} strokeWidth={2} className={cx("transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
          />
          <div
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 w-[158px] rounded-xl border border-white/20 bg-[#14151a] p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)]"
          >
            {OPTIONS.map((opt) => (
              <button
                key={opt.level}
                type="button"
                role="option"
                aria-selected={opt.level === level}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(opt.level);
                  setLevel(opt.level);
                  setOpen(false);
                }}
                className={cx(
                  "flex h-7 w-full items-center justify-between rounded-md px-2 text-left text-ink-2 transition-colors hover:bg-white/10 hover:text-white",
                  opt.sample,
                  opt.level === level && "bg-white/[0.06] text-white",
                )}
              >
                <span className="whitespace-nowrap">{opt.label}</span>
                {opt.level === level && <Check size={10} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
