import { tauriApi } from "../../api/tauriBridge";
import type { AppUpdate } from "../../hooks/useAppUpdate";
import { Btn, Glyph, Kbd } from "../ui";
import { UpdateStatus } from "./UpdateStatus";

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onDock: () => void;
  update: AppUpdate;
}

/** The window's title bar: the search line, the update status and the window's own controls. */
export function TopBar({ sidebarOpen, onToggleSidebar, onOpenSearch, onDock, update }: TopBarProps) {
  return (
    <header
      data-tauri-drag-region
      onDoubleClick={() => void tauriApi.toggleMaximize()}
      className="tm-rule-b relative z-40 flex h-12 shrink-0 select-none items-center gap-[2ch] pl-[1.5ch] pr-[1ch]"
    >
      <Glyph label={sidebarOpen ? "Hide the shelves" : "Show the shelves"} onClick={onToggleSidebar} on={!sidebarOpen}>
        ≡
      </Glyph>
      <span data-tauri-drag-region className="pointer-events-none font-semibold tracking-[0.14em]">
        DOIT
      </span>

      <div data-tauri-drag-region className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search notes (Ctrl K)"
          className="graph-frame flex h-8 w-full max-w-[440px] items-center gap-[1ch] px-[1.5ch] text-graph-muted transition-colors hover:bg-hover hover:text-foreground"
        >
          <span className="text-graph-accent">/</span>
          <span className="flex-1 truncate text-left">search</span>
          <Kbd keys="Ctrl+K" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-[1ch]">
        <UpdateStatus update={update} />
        <Btn onClick={onDock} title="Shrink to the dock (Ctrl+J)">
          dock
        </Btn>
        <span className="mx-[0.5ch] text-graph-frame">│</span>
        <Glyph label="Minimise window" onClick={() => void tauriApi.minimize()}>
          _
        </Glyph>
        <Glyph label="Maximise window" onClick={() => void tauriApi.toggleMaximize()}>
          □
        </Glyph>
        <Glyph label="Close window" variant="danger" onClick={() => void tauriApi.close()}>
          ×
        </Glyph>
      </div>
    </header>
  );
}
