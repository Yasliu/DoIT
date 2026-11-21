import { useState } from "react";
import { Bar, Btn, Frame, Spin } from "../ui";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
  /** Downloads and installs; `onProgress` receives 0–100, or null when the size is unknown. */
  onInstall: (onProgress: (percent: number | null) => void) => Promise<void>;
  onDismiss: () => void;
}

/** A card in the corner: never interrupts typing, and shows the real download progress. */
export function UpdateCard({ info }: { info: UpdateInfo }) {
  const [phase, setPhase] = useState<"idle" | "downloading" | "installing">("idle");
  const [percent, setPercent] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);

  const install = async () => {
    setPhase("downloading");
    setError(null);
    try {
      await info.onInstall((p) => {
        setPercent(p);
        if (p === 100) setPhase("installing");
      });
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message || "The update failed. Try again later.");
      setPhase("idle");
    }
  };
  const busy = phase !== "idle";

  return (
    <div role="status" aria-live="polite" className="fixed bottom-10 right-6 z-[80] w-[360px]" style={{ animation: "tm-in 220ms var(--ease) both" }}>
      <Frame title="update" className="tm-layer px-[2.5ch] pb-5 pt-7" surface="var(--background)">
        <div className="font-semibold">
          DoIT {info.currentVersion} → {info.version}
        </div>
        {info.notes && !busy && <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-graph-muted">{info.notes}</p>}
        {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}
        {busy ? (
          <div className="mt-4 text-[12px]">
            <div className="flex items-center gap-[1ch] text-graph-muted">
              <Spin /> {phase === "installing" ? "installing, DoIT will restart" : percent === null ? "downloading" : `downloading ${percent}%`}
            </div>
            <Bar value={percent === null ? 0.4 : percent / 100} cells={32} className="mt-2 block" />
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-[2ch]">
            <Btn variant="ghost" onClick={info.onDismiss}>
              later
            </Btn>
            <Btn variant="primary" onClick={() => void install()}>
              update now
            </Btn>
          </div>
        )}
      </Frame>
    </div>
  );
}
