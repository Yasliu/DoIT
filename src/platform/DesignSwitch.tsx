import { useEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import { tauriApi } from "../api/tauriBridge";
import { DESIGN_CACHE_KEY, type Design, design, isMarkdown } from ".";

/**
 * Saves the design choice. It takes effect the next time DoIT starts: windows opened before then
 * keep this run's design (platform/settleDesign).
 */
export async function setDesign(next: Design): Promise<void> {
  await tauriApi.patchSettings({ design: next });
}

/** Restarts into `next`, cached up front so the new run's first window paints it straight away. */
async function restartInto(next: Design, waitFor?: Promise<void> | null): Promise<void> {
  if (waitFor) {
    try {
      await waitFor;
    } catch {
      /* still restart if saving failed; settleDesign will reconcile on launch */
    }
  }
  try {
    localStorage.setItem(DESIGN_CACHE_KEY, next);
  } catch {
    /* the new run's first window corrects the cache and reloads once */
  }
  void tauriApi.restartApp();
}

/**
 * The ILOVEMARKDOWN feature flag, as Settings shows it: whether it is on, and whether DoIT has to
 * restart before the windows match it.
 */
export function useMarkdownFlag(): { on: boolean; pending: boolean; set: (on: boolean) => void; restart: () => void } {
  const [saved, setSaved] = useState<boolean | null>(null);
  const pendingSave = useRef<Promise<void> | null>(null);
  useEffect(() => {
    void tauriApi.getSettings().then((s) => setSaved(s.design === "markdown"));
  }, []);
  return {
    on: saved ?? isMarkdown,
    pending: saved !== null && saved !== isMarkdown,
    set: (on) => {
      setSaved(on);
      pendingSave.current = setDesign(on ? "markdown" : "modern");
    },
    restart: () => {
      void restartInto((saved ?? isMarkdown) ? "markdown" : "modern", pendingSave.current);
    },
  };
}

/** The opt-in card in the classic Settings, drawn in the classic style. */
export function NewDesignOptIn() {
  if (design !== "classic") return null;
  return (
    <section className="glass rounded-[20px] p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] border border-white/10">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white">
          <FlaskConical size={17} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-ink-1">Experimental: new design</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            A preview of DoIT's next look: colour themes in light and dark, Spotlight search and a simpler sidebar.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white/[0.03] p-4 border border-white/[0.06] flex items-center justify-between">
        <div className="pr-4">
          <div className="text-[13px] font-medium text-ink-1">Use the new design</div>
          <div className="mt-0.5 text-[11.5px] text-ink-4">
            DoIT reloads to switch. Turn it off under Settings › Experimental to come back to this look.
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input type="checkbox" checked={false} onChange={() => void setDesign("modern")} className="sr-only peer" />
          <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white/30 border border-white/20"></div>
        </label>
      </div>
    </section>
  );
}
