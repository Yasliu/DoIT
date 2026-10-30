import { Minus, Settings, Square, X } from "lucide-react";
import { Seek } from "./Seek";
import { tauriApi } from "../api/tauriBridge";

interface TitleBarProps {
  view?: string;
  query: string;
  onQuery: (value: string) => void;
  mini: boolean;
  onToggleMini: () => void;
  onOpenSettings?: () => void;
  isSettings?: boolean;
}

export function TitleBar({
  query,
  onQuery,
  mini,
  onToggleMini,
  onOpenSettings,
  isSettings,
}: TitleBarProps) {
  return (
    <header
      data-tauri-drag-region
      onDoubleClick={() => void tauriApi.toggleMaximize()}
      className="relative z-40 flex h-12 shrink-0 select-none items-center px-3.5"
    >
      <div className="flex-1" data-tauri-drag-region />

      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden sm:block">
          <Seek value={query} onChange={onQuery} />
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="ghost !h-7 !px-2"
          title="Settings (Ctrl+,)"
          aria-pressed={isSettings}
        >
          <Settings size={13} strokeWidth={1.8} className={isSettings ? "text-white" : "text-ink-3"} />
        </button>

        <button
          type="button"
          onClick={onToggleMini}
          className="ghost !h-7 !px-2.5"
          title={mini ? "Return to the canvas" : "Shrink to a desk tray"}
          aria-pressed={mini}
        >
          <span className="text-[11px] font-medium tracking-[0.01em]">
            {mini ? "Canvas" : "Tray"}
          </span>
          <span className="kbd">⌘J</span>
        </button>

        <span className="mx-1.5 h-4 w-px bg-white/[0.08]" />

        <button
          type="button"
          onClick={() => void tauriApi.minimize()}
          aria-label="Minimise window"
          className="grid h-7 w-9 place-items-center rounded-[6px] text-ink-4 transition-colors duration-150 hover:bg-white/[0.07] hover:text-ink-1"
        >
          <Minus size={12} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          onClick={() => void tauriApi.toggleMaximize()}
          aria-label="Maximise window"
          className="grid h-7 w-9 place-items-center rounded-[6px] text-ink-4 transition-colors duration-150 hover:bg-white/[0.07] hover:text-ink-1"
        >
          <Square size={10.5} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          onClick={() => void tauriApi.close()}
          aria-label="Close window"
          className="grid h-7 w-9 place-items-center rounded-[6px] text-ink-4 transition-colors duration-150 hover:bg-white/[0.14] hover:text-ink-1"
        >
          <X size={12.5} strokeWidth={1.6} />
        </button>
      </div>
    </header>
  );
}
