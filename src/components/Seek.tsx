import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { clamp, useSpring } from "../lib/spring";

interface SeekProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

const OPEN = 100;
const SHUT = 0;

/**
 * The field opens on a spring rather than a CSS transition, and refuses to
 * expand until the 90ms press beat has passed — the same intent buffer the
 * cards use.
 */
export function Seek({ value, onChange, compact = false }: SeekProps) {
  const [open, setOpen] = useState(false);
  const [beat, setBeat] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const beatTimer = useRef(0);

  const spring = useSpring(open ? OPEN : SHUT, 52);
  const progress = clamp(spring / 100, 0, 1);
  const min = compact ? 34 : 172;
  const max = compact ? 190 : 258;
  const width = min + (max - min) * progress;

  useEffect(() => () => window.clearTimeout(beatTimer.current), []);

  const openNow = () => {
    if (open) {
      input.current?.focus();
      return;
    }
    setBeat(true);
    window.clearTimeout(beatTimer.current);
    beatTimer.current = window.setTimeout(
      () => {
        setBeat(false);
        setOpen(true);
        requestAnimationFrame(() => input.current?.focus());
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 90,
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (document.querySelector('[aria-modal="true"]')) return;
        event.preventDefault();
        openNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    window.clearTimeout(beatTimer.current);
    setBeat(false);
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div
      className="relative flex h-8 shrink-0 items-center overflow-hidden rounded-[9px]"
      data-open={open}
      style={{
        width,
        backgroundColor: open ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.028)",
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,${open ? 0.13 : 0.06})`,
        transform: beat ? "scale(0.968)" : "scale(1)",
        transition: "background-color 200ms ease, box-shadow 200ms ease, transform 90ms linear",
      }}
    >
      <Search
        size={13.5}
        strokeWidth={1.7}
        className="pointer-events-none absolute left-2.5 text-ink-4"
        style={{ opacity: open ? 0.9 : 1 }}
      />

      <span
        className="pointer-events-none absolute left-[29px] whitespace-nowrap text-[12px] text-ink-4"
        style={{
          opacity: open ? 0 : clamp((progress - 0.35) / 0.4, 0, 1),
          transition: "opacity 120ms linear",
        }}
      >
        Search
      </span>

      <input
        ref={input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (!open) openNow();
        }}
        onBlur={() => {
          if (!value) close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onChange("");
            close();
          }
        }}
        placeholder="Search notes"
        aria-label="Search notes"
        tabIndex={open ? 0 : -1}
        className="h-full min-w-0 flex-1 bg-transparent pl-[29px] pr-1 text-[12.5px] text-ink-1 outline-none placeholder:text-ink-4"
        style={{
          opacity: open ? clamp((progress - 0.45) / 0.4, 0, 1) : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {value && open && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          aria-label="Clear search"
          className="mr-1.5 grid size-5 shrink-0 place-items-center rounded text-ink-4 hover:bg-white/10 hover:text-ink-1"
        >
          <X size={11} strokeWidth={2} />
        </button>
      )}

      {!open && (
        <span className="kbd pointer-events-none absolute right-2.5">⌘K</span>
      )}

      {!open && (
        <button
          type="button"
          onClick={openNow}
          aria-label="Search notes"
          className="absolute inset-0 z-10"
        />
      )}
    </div>
  );
}
