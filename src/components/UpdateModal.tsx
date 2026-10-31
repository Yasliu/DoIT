import { useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
  /** downloads + installs; `onProgress` receives 0-100 (or null when the size is unknown) */
  onInstall: (onProgress: (percent: number | null) => void) => Promise<void>;
  onDismiss: () => void;
}

/** Non-blocking update card (bottom-right): never interrupts typing, shows real download progress. */
export function UpdateModal({ info }: { info: UpdateInfo }) {
  const [phase, setPhase] = useState<"idle" | "downloading" | "installing">("idle");
  const [percent, setPercent] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setPhase("downloading");
    setError(null);
    try {
      await info.onInstall((p) => {
        setPercent(p);
        if (p === 100) setPhase("installing");
      });
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message || "Update failed. Please try again later.");
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[80] w-[340px] select-none rounded-[18px] border border-white/[0.1] bg-[#121318]/95 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-[6px] rounded-full bg-white/80" />
          <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Update available
          </span>
        </div>
        {!busy && (
          <button
            type="button"
            onClick={info.onDismiss}
            title="Remind me later"
            className="grid size-6 cursor-pointer place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink-1">DoIT v{info.version}</h2>
        <span className="font-mono text-[10.5px] text-ink-3">
          v{info.currentVersion} → v{info.version}
        </span>
      </div>

      {info.notes && !busy && (
        <p className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-ink-3">{info.notes}</p>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-200">
          {error}
        </div>
      )}

      {busy && (
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-white/55">
            <span>
              {phase === "installing"
                ? "Installing - DoIT will restart"
                : percent === null
                  ? "Downloading update..."
                  : `Downloading update... ${percent}%`}
            </span>
            <RefreshCw size={10.5} className="animate-spin" />
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-white transition-[width] duration-200 ease-out ${percent === null ? "animate-pulse" : ""}`}
              style={{ width: percent === null ? "40%" : `${Math.max(4, percent)}%` }}
            />
          </div>
        </div>
      )}

      {!busy && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={info.onDismiss}
            className="flex h-8 cursor-pointer items-center rounded-[10px] border border-white/10 bg-white/[0.03] px-3 text-[11.5px] font-medium text-ink-3 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            Later
          </button>
          <button
            type="button"
            onClick={handleInstall}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[11.5px] font-semibold text-black transition-all hover:bg-white/90 active:scale-95"
          >
            <Download size={12.5} strokeWidth={2.4} />
            Update now
          </button>
        </div>
      )}
    </div>
  );
}
