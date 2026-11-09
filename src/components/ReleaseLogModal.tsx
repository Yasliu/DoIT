import { Sparkles, ExternalLink, X } from "lucide-react";

interface ReleaseLogModalProps {
  onClose: () => void;
}

export function ReleaseLogModal({ onClose }: ReleaseLogModalProps) {
  const handleOpenChangelog = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = "https://github.com/Yasliu/DoIT/blob/main/CHANGELOG.md";
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[420px] rounded-2xl bg-[#14151a] border border-white/15 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.9)] text-ink-1 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 size-7 flex items-center justify-center rounded-lg text-ink-3 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex size-7 items-center justify-center rounded-lg bg-white/10 text-white">
            <Sparkles size={14} />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
            Version 1.2.1 Update
          </span>
        </div>

        <h2 className="text-[17px] font-semibold text-white tracking-tight mb-3">
          What&apos;s New in v1.2.1
        </h2>

        <ul className="space-y-2 mb-5 text-[12px] text-ink-2 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="size-1.5 rounded-full bg-white/60 mt-2 shrink-0" />
            <span>Native Dock Pill: Lightweight Win32 native dock pill with zero webview overhead while docked, and instant 0ms dock-to-canvas switching.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="size-1.5 rounded-full bg-white/60 mt-2 shrink-0" />
            <span>Settled Notes (Archiving): Mark notes as settled to keep your shelves clean while preserving searchable access in the Settled tab.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="size-1.5 rounded-full bg-white/60 mt-2 shrink-0" />
            <span>Performance &amp; Launch Speed: Incremental block parser for smooth typing in large notes, off-screen shelf virtualization, and a themed splash screen.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="size-1.5 rounded-full bg-white/60 mt-2 shrink-0" />
            <span>Multi-Monitor Dock Support: Seamless positioning, monitor tracking, and DPI scaling across multi-display setups.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="size-1.5 rounded-full bg-white/60 mt-2 shrink-0" />
            <span>Windows &amp; Store Polish: Fixed pill caption button glitch, centered shelf action icons, and automated Microsoft Store package update detection.</span>
          </li>
        </ul>

        <div className="pt-2 pb-5 border-t border-white/[0.08]">
          <a
            href="https://github.com/Yasliu/DoIT/blob/main/CHANGELOG.md"
            onClick={handleOpenChangelog}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-mono text-ink-3 hover:text-white transition-colors cursor-pointer underline underline-offset-4"
          >
            <span>View full documentation on GitHub</span>
            <ExternalLink size={11} />
          </a>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-9 rounded-xl bg-white text-black font-semibold text-[13px] hover:bg-white/90 active:scale-[0.99] transition-all cursor-pointer shadow-sm"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
