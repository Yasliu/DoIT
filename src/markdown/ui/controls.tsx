import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "danger" | "ghost";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** A glyph before the label, inside the brackets. */
  lead?: ReactNode;
  /** Keys after the label. */
  keys?: string;
}

/** `[ label ]`: brackets in the frame colour that light up on hover. */
export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = "default", lead, keys, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} data-variant={variant === "default" ? undefined : variant} className={cn("tm-btn", className)} {...rest}>
      <span className="tm-br">[</span>
      {lead != null && <span aria-hidden="true">{lead}</span>}
      <span>{children}</span>
      {keys && <Kbd keys={keys} className="ml-[0.5ch]" />}
      <span className="tm-br">]</span>
    </button>
  );
});

interface GlyphProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** What it does, for screen readers and the tooltip. */
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "danger";
  on?: boolean;
}

/** One character in a square cell that inverts on hover: `×`, `+`, `⤢`. */
export const Glyph = forwardRef<HTMLButtonElement, GlyphProps>(function Glyph(
  { label, size = "md", variant = "default", on, className, children, type = "button", title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      data-size={size === "md" ? undefined : size}
      data-variant={variant === "default" ? undefined : variant}
      data-on={on || undefined}
      className={cn("tm-glyph", className)}
      {...rest}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
});

/** Splits "Ctrl+Shift++" into ["Ctrl", "Shift", "+"]. */
export function splitKeys(keys: string): string[] {
  const parts: string[] = [];
  for (const token of keys.split("+")) {
    if (token === "") {
      if (parts[parts.length - 1] !== "+") parts.push("+");
    } else parts.push(token.trim());
  }
  return parts.filter(Boolean);
}

const KEY_NAMES: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", " ": "space", Escape: "esc", Enter: "⏎" };

/** `[ctrl][k]`, the way the figures draw keys. */
export function Kbd({ keys, className }: { keys: string; className?: string }) {
  return (
    <kbd className={cn("tm-kbd", className)} aria-label={keys}>
      {splitKeys(keys).map((key, i) => (
        <span key={`${key}-${i}`}>
          <i>[</i>
          {KEY_NAMES[key] ?? key.toLowerCase()}
          <i>]</i>
        </span>
      ))}
    </kbd>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  prompt?: ReactNode;
  invalid?: boolean;
  /** Extra content at the end of the line (a clear button, a count). */
  end?: ReactNode;
  wrapClassName?: string;
}

/** A one-line input: `› value` on a dashed rule that goes solid while focused. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ prompt = "›", invalid, end, wrapClassName, className, ...rest }, ref) {
  return (
    <label className={cn("tm-field", wrapClassName)} data-invalid={invalid || undefined}>
      {prompt != null && <span className="tm-prompt" aria-hidden="true">{prompt}</span>}
      <input ref={ref} spellCheck={false} aria-invalid={invalid || undefined} className={className} {...rest} />
      {end}
    </label>
  );
});

interface ChoicesProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: ReactNode; lead?: ReactNode }>;
  onChange: (value: T) => void;
  className?: string;
}

/** A radio group drawn as `(•) dark  ( ) light`. */
export function Choices<T extends string>({ label, value, options, onChange, className }: ChoicesProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap items-center", className)}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(option.value)} className="tm-choice">
            <span className="tm-mark">{on ? "(•)" : "( )"}</span>
            {option.lead}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A switch drawn as `[x] on` or `[ ] off`. */
export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="tm-choice">
      <span className="tm-mark">{on ? "[x]" : "[ ]"}</span>
      <span>{on ? "on" : "off"}</span>
    </button>
  );
}

/** Progress as text: `██████░░░░`. */
export function Bar({ value, cells = 10, className }: { value: number; cells?: number; className?: string }) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * cells);
  return (
    <span className={cn("tm-bar", className)} aria-hidden="true">
      <span className="tm-fill">{"█".repeat(filled)}</span>
      <span className="tm-rest">{"░".repeat(cells - filled)}</span>
    </span>
  );
}

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** A braille spinner for work in progress. */
export function Spin({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setFrame((f) => (f + 1) % SPIN.length), 80);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span aria-hidden="true" className={cn("inline-block w-[1ch] text-graph-accent", className)}>
      {SPIN[frame]}
    </span>
  );
}

/** A labelled settings line: label (and hint) on the left, the control on the right. */
export function Row({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("tm-row", className)}>
      <div className="tm-row-label">
        <div className="truncate">{label}</div>
        {hint && <div className="tm-row-hint">{hint}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-[1ch]">{children}</div>}
    </div>
  );
}
