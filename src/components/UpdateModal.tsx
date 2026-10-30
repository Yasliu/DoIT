import { useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { cx } from "../lib/text";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
  onInstall: () => Promise<void>;
  onDismiss: () => void;
}

export function UpdateModal({ info }: { info: UpdateInfo }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setDownloading(true);
    setError(null);
    try {
      await info.onInstall();
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message || "Failed to install update");
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-200">
      <div
        className={cx(
          "relative w-full max-w-[490px] rounded-[24px] bg-[#121318] border border-white/[0.08] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.95)] select-none",
          "animate-in zoom-in-95 duration-250 ease-out",
        )}
      >
        {/* Top Header Tag */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-white/80" />
            <span className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-white/50 uppercase">
              00 // SYSTEM UPDATE
            </span>
          </div>

          <button
            type="button"
            onClick={info.onDismiss}
            className="grid size-6 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight text-ink-1">
                DoIT v{info.version} Available
              </h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
                A new release of DoIT is ready for deployment across your desktop environment.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-ink-2 shrink-0">
              v{info.currentVersion} → v{info.version}
            </div>
          </div>

          {info.notes && (
            <div className="rounded-xl border border-white/[0.06] bg-black/40 p-3.5">
              <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
                Release Notes
              </div>
              <div className="text-[12px] leading-relaxed text-ink-3 max-h-32 overflow-y-auto scroll">
                {info.notes}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-200">
              {error}
            </div>
          )}

          {downloading && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between font-mono text-[10.5px] text-white/60">
                <span>Downloading payload and preparing silent installation...</span>
                <RefreshCw size={11} className="animate-spin text-white/60" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-200 rounded-full animate-pulse"
                  style={{ width: "85%" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Decision Targets */}
        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={info.onDismiss}
            disabled={downloading}
            className="flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[12px] font-medium text-ink-3 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          >
            Remind Me Later
          </button>

          <button
            type="button"
            onClick={handleInstall}
            disabled={downloading}
            className="flex h-9 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[12px] font-semibold text-black hover:bg-white/90 active:scale-95 transition-all cursor-pointer shadow-lg disabled:opacity-40"
          >
            {downloading ? (
              <>
                <RefreshCw size={13} className="animate-spin text-black" />
                <span>Installing...</span>
              </>
            ) : (
              <>
                <Download size={13} strokeWidth={2.4} />
                <span>Install & Relaunch Now</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
