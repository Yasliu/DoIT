import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  Command,
  ExternalLink,
  Folder,
  FolderSearch,
  HardDrive,
  Layers,
  PanelRightClose,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Sparkles,
  Square,
  Table,
  Type,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AppSettings, DEFAULT_SETTINGS, tauriApi } from "../api/tauriBridge";
import { applyShortcutSettings, DEFAULT_MD_SHORTCUTS } from "../lib/shortcuts";
import { ShortcutField } from "./ShortcutField";
import { cx } from "../lib/text";
import { NewDesignOptIn } from "../platform/DesignSwitch";

interface SettingsPanelProps {
  onBack: () => void;
  onStoragePathChanged: () => void;
  onThemeChanged?: (theme: "glass" | "monochrome") => void;
}

const GENERAL_SHORTCUT_ROWS = [
  { key: "hotkey_new_note", label: "Create New Note", hint: "Spawns a new note in current view", def: "Ctrl+N" },
  { key: "hotkey_toggle_tray", label: "Toggle Docking Mode", hint: "Switch between Canvas and Dock", def: "Ctrl+J" },
  { key: "hotkey_search", label: "Global Search", hint: "Focus search query input", def: "Ctrl+F" },
  { key: "hotkey_settings", label: "Open Settings", hint: "Toggles this settings panel", def: "Ctrl+," },
  { key: "hotkey_open_file", label: "Open / Ingest File", hint: "Native file picker to import note", def: "Ctrl+O" },
] as const;

export const TEXT_MARKS_SHORTCUT_ROWS = [
  { key: "hotkey_bold", label: "Bold", hint: "Wrap selection in **bold**", def: DEFAULT_MD_SHORTCUTS.bold },
  { key: "hotkey_italic", label: "Italic", hint: "Wrap selection in *italic*", def: DEFAULT_MD_SHORTCUTS.italic },
  { key: "hotkey_strikethrough", label: "Strikethrough", hint: "Wrap selection in ~~strikethrough~~", def: DEFAULT_MD_SHORTCUTS.strikethrough },
  { key: "hotkey_highlight", label: "Highlight", hint: "Wrap selection in ==highlight==", def: DEFAULT_MD_SHORTCUTS.highlight },
  { key: "hotkey_inline_code", label: "Inline Code", hint: "Format selection as `code`", def: DEFAULT_MD_SHORTCUTS.inlineCode },
  { key: "hotkey_subscript", label: "Subscript", hint: "Wrap selection in ~subscript~ (e.g. H~2~O)", def: DEFAULT_MD_SHORTCUTS.subscript },
  { key: "hotkey_superscript", label: "Superscript", hint: "Wrap selection in ^superscript^ (e.g. x^2)", def: DEFAULT_MD_SHORTCUTS.superscript },
  { key: "hotkey_link", label: "Insert Link", hint: "Wrap selection in [title](url)", def: DEFAULT_MD_SHORTCUTS.link },
] as const;

export const BLOCKS_STRUCTURE_SHORTCUT_ROWS = [
  { key: "hotkey_h1", label: "Heading 1 (H1)", hint: "Toggle # H1 heading on the current line", def: DEFAULT_MD_SHORTCUTS.h1 },
  { key: "hotkey_h2", label: "Heading 2 (H2)", hint: "Toggle ## H2 heading on the current line", def: DEFAULT_MD_SHORTCUTS.h2 },
  { key: "hotkey_h3", label: "Heading 3 (H3)", hint: "Toggle ### H3 heading on the current line", def: DEFAULT_MD_SHORTCUTS.h3 },
  { key: "hotkey_task", label: "Checklist Task", hint: "Turn the line into a - [ ] task", def: DEFAULT_MD_SHORTCUTS.task },
  { key: "hotkey_ordered_list", label: "Numbered List", hint: "Toggle numbered list (or type 1. at start)", def: DEFAULT_MD_SHORTCUTS.orderedList },
  { key: "hotkey_blockquote", label: "Blockquote", hint: "Toggle blockquote (or type > at line start)", def: DEFAULT_MD_SHORTCUTS.blockquote },
  { key: "hotkey_footnote", label: "Footnote", hint: "Insert footnote reference [^1] and definition", def: DEFAULT_MD_SHORTCUTS.footnote },
  { key: "hotkey_table", label: "Insert Table", hint: "Drop a markdown table at the cursor", def: DEFAULT_MD_SHORTCUTS.table },
  { key: "hotkey_table_col", label: "Table: Add Column", hint: "Inside a table cell: new column on every row", def: DEFAULT_MD_SHORTCUTS.tableCol },
  { key: "hotkey_table_row", label: "Table: Add Row", hint: "Inside a table cell: new row at the bottom", def: DEFAULT_MD_SHORTCUTS.tableRow },
] as const;

function CollapsibleShortcutCategory({
  id,
  isOpen,
  onToggle,
  icon: Icon,
  title,
  description,
  badge,
  children,
}: {
  id: string;
  isOpen: boolean;
  onToggle: (id: string) => void;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  description: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-[20px] border border-white/10 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between p-4.5 text-left hover:bg-white/[0.03] transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white">
            <Icon size={17} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-ink-1 truncate">{title}</h3>
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-white/50 bg-white/[0.06] border border-white/10 px-2 py-0.5 rounded-full shrink-0">
                {badge}
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-ink-4 truncate">{description}</p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="text-white/40 shrink-0 ml-3"
        >
          <ChevronDown size={17} strokeWidth={2} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] p-4.5 pt-3.5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BugReportSection() {
  const handleOpenIssues = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = "https://github.com/Yasliu/DoIT/issues/";
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
  };

  return (
    <section className="glass rounded-[20px] border border-white/10 p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
      <a
        href="https://github.com/Yasliu/DoIT/issues/"
        onClick={handleOpenIssues}
        className="group flex items-center justify-between gap-4 cursor-pointer"
      >
        <div className="flex items-center gap-3.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white group-hover:bg-white/[0.12] transition-colors">
            <Bug size={17} strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-ink-1 group-hover:text-white transition-colors">
              Spotted a bug? Report Here
            </h2>
            <p className="text-[11.5px] text-ink-4">
              Open an issue on GitHub to report unexpected behavior or suggest improvements.
            </p>
          </div>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 text-[12px] font-medium text-white transition-all group-hover:bg-white/[0.14] group-hover:border-white/25">
          <span>Report issue</span>
          <ExternalLink size={13} />
        </div>
      </a>
    </section>
  );
}

function AppUpdatesSection() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    void import("@tauri-apps/api/app")
      .then((m) => m.getVersion())
      .then(setVersion)
      .catch(() => undefined);
  }, []);
  return (
    <section className="glass rounded-[20px] border border-white/10 p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-ink-1">App updates</h2>
          <p className="text-[11.5px] text-ink-4">
            DoIT {version ? `v${version}` : ""} - updates download in the background and are signature-verified.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("doit:check-updates"))}
          className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 text-[12px] font-medium text-white transition-all hover:bg-white/[0.14]"
        >
          <RefreshCw size={13} />
          Check for updates
        </button>
      </div>
    </section>
  );
}

export function SettingsPanel({ onBack, onStoragePathChanged, onThemeChanged }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [ingestStatus, setIngestStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [openTiles, setOpenTiles] = useState<Record<string, boolean>>({});
  const toggleTile = (id: string) => setOpenTiles((prev) => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    void tauriApi.getSettings().then((res) => {
      applyShortcutSettings(res);
      setSettings(res);
      setPathInput(res.storage_path);
      setLoading(false);
    });
  }, []);

  const handleSelectTheme = (mode: "glass" | "monochrome") => {
    const updated = { ...settings, theme_mode: mode };
    setSettings(updated);
    document.documentElement.dataset.theme = mode;
    if (onThemeChanged) onThemeChanged(mode);
    void tauriApi.patchSettings({ theme_mode: mode });
  };

  const handleBrowseFolder = async () => {
    const selected = await tauriApi.selectStorageDirectory();
    if (selected) {
      setPathInput(selected);
    }
  };



  const handleScanCurrentRepo = async () => {
    setIngestStatus(null);
    setIsScanning(true);
    try {
      const res = await tauriApi.scanMarkdownFolder();
      setIngestStatus({
        type: "info",
        message: `Current Repository: ${res.imported_count} notes indexed (${res.skipped_count} files skipped).`,
      });
      onStoragePathChanged();
    } catch (err: any) {
      setIngestStatus({
        type: "error",
        message: typeof err === "string" ? err : err?.message || "Scan failed",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleDockOnClose = async (checked: boolean) => {
    const nextSettings: AppSettings = {
      ...settings,
      dock_on_close: checked,
    };
    setSettings(nextSettings);
    await tauriApi.patchSettings({ dock_on_close: checked });
  };

  const handleSave = async () => {
    const nextSettings: AppSettings = {
      ...settings,
      storage_path: pathInput.trim() || settings.storage_path,
      dock_on_close: settings.dock_on_close ?? true,
    };
    const pathChanged = nextSettings.storage_path !== settings.storage_path;
    const hotkeys = Object.fromEntries(Object.entries(nextSettings).filter(([key]) => key.startsWith("hotkey_")));
    const res = await tauriApi.patchSettings({
      ...hotkeys,
      storage_path: nextSettings.storage_path,
      dock_on_close: nextSettings.dock_on_close,
    });
    applyShortcutSettings(res);
    setSettings(res);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    if (pathChanged) {
      onStoragePathChanged();
    }
  };

  const handleResetDefaults = async () => {
    const { storage_path: _keepPath, ...defaults } = DEFAULT_SETTINGS;
    const res = await tauriApi.patchSettings(defaults);
    applyShortcutSettings(res);
    setSettings(res);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-[840px] px-6 pb-28 pt-6 select-none animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[12px] text-ink-3 transition-colors hover:bg-white/10 hover:text-ink-1"
          >
            <ArrowLeft size={13} />
            <span>Canvas</span>
          </button>
          <div>
            <h1 className="text-[20px] font-semibold text-ink-1 tracking-tight">Settings</h1>
            <p className="text-[12px] text-ink-4">
              Local Markdown Storage Engine & Hotkey Configuration
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className={cx(
            "flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-medium transition-all shadow-sm",
            saved
              ? "bg-white text-black"
              : "bg-white/10 text-white hover:bg-white/20 active:scale-95",
          )}
        >
          {saved ? (
            <>
              <Check size={13} strokeWidth={2.5} />
              <span>Saved</span>
            </>
          ) : (
            <span>Save Configuration</span>
          )}
        </button>
      </div>

      <div className="mt-8 space-y-8">
        {/* SECTION 1: Interface Style & Theme */}
        <section className="glass rounded-[20px] p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] border border-white/10">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white">
              <Layers size={17} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-semibold text-ink-1">
                Appearance & Interface Mode
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                Choose between blurred translucency or solid matte monochrome.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Glass Mode */}
            <button
              type="button"
              onClick={() => handleSelectTheme("glass")}
              className={cx(
                "flex items-start gap-3 rounded-xl p-3.5 border transition-all text-left",
                (settings.theme_mode ?? "glass") === "glass"
                  ? "border-white/40 bg-white/[0.08] shadow-[0_0_20px_rgba(255,255,255,0.06)]"
                  : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20",
              )}
            >
              <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-white">
                <Sparkles size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink-1">Blurred Glass Mode</span>
                  {(settings.theme_mode ?? "glass") === "glass" && (
                    <span className="font-mono text-[10px] text-white uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-4">
                  Translucent frosted glass with backdrop blur and dynamic light dynamics.
                </p>
              </div>
            </button>

            {/* Monochrome Mode */}
            <button
              type="button"
              onClick={() => handleSelectTheme("monochrome")}
              className={cx(
                "flex items-start gap-3 rounded-xl p-3.5 border transition-all text-left",
                settings.theme_mode === "monochrome"
                  ? "border-white/40 bg-white/[0.08] shadow-[0_0_20px_rgba(255,255,255,0.06)]"
                  : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20",
              )}
            >
              <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-white">
                <Square size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink-1">Opaque Monochrome</span>
                  {settings.theme_mode === "monochrome" && (
                    <span className="font-mono text-[10px] text-white uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-4">
                  Solid matte black (#0d0e12), 100% opaque, crisp borders, and zero blur.
                </p>
              </div>
            </button>
          </div>
        </section>

        <NewDesignOptIn />

        {/* SECTION 2: Local Markdown Repository */}
        <section className="glass rounded-[20px] p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] border border-white/10">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white">
              <Folder size={17} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-semibold text-ink-1">
                Markdown Repository Storage
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                All notes are compiled and saved directly as physical <code className="text-white font-mono text-[11px] bg-white/10 px-1 py-0.5 rounded">.md</code> files on your local drive with zero cloud telemetry.
              </p>
              <div className="mt-2 text-[11px] font-mono text-ink-4">
                Pattern: <span className="text-ink-2">Category - Title - Date - Index.md</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="relative flex-1 flex items-center rounded-xl bg-white/[0.04] px-3 h-10 border border-white/10 focus-within:border-white/30 transition-all">
              <HardDrive size={13} className="text-ink-4 mr-2.5 shrink-0" />
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="Path to Markdown repository folder..."
                className="flex-1 bg-transparent text-[12.5px] font-mono text-ink-1 outline-none placeholder:text-ink-4 min-w-0"
              />
            </div>
            <button
              type="button"
              onClick={handleBrowseFolder}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-[12px] text-ink-2 hover:bg-white/[0.12] hover:text-white transition-colors shrink-0"
              title="Select folder via native directory dialog"
            >
              <FolderSearch size={14} />
              <span>Browse</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const def = await tauriApi.getDefaultStoragePath();
                if (def) setPathInput(def);
              }}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[12px] text-ink-3 hover:bg-white/[0.08] hover:text-white transition-colors shrink-0"
              title="Reset to default Documents/DoIT folder"
            >
              <RotateCcw size={12} />
              <span>Default</span>
            </button>
          </div>
        </section>

        {/* SECTION 3: Window Lifecycle & Docking Mode */}
        <section className="glass rounded-[20px] p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] border border-white/10">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white">
              <PanelRightClose size={17} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-semibold text-ink-1">
                Window Lifecycle & Docking Mode
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                Configure runtime termination and window minimize behavior on exit.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white/[0.03] p-4 border border-white/[0.06] flex items-center justify-between">
            <div className="pr-4">
              <div className="text-[13px] font-medium text-ink-1">
                Enable Docking Mode on Window Close
              </div>
              <div className="mt-0.5 text-[11.5px] text-ink-4">
                When enabled, clicking (✕) collapses DoIT smoothly into its floating bar dock. When disabled, clicking (✕) terminates the native application instantly.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.dock_on_close ?? true}
                onChange={(e) => void handleToggleDockOnClose(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white/30 border border-white/20"></div>
            </label>
          </div>
        </section>

        {/* SECTION 4: Repository Synchronization */}
        <section className="glass rounded-[20px] p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] border border-white/10">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white">
              <ScanLine size={17} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-semibold text-ink-1">
                Repository Synchronization
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                Rescan and index all <code className="text-white font-mono text-[11px] bg-white/10 px-1 py-0.5 rounded">.md</code> or <code className="text-white font-mono text-[11px] bg-white/10 px-1 py-0.5 rounded">.txt</code> files in the active notes storage directory. File import and custom folder scans are also accessible on the main dashboard sidebar.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleScanCurrentRepo}
              disabled={isScanning}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-[12px] text-white hover:bg-white/[0.12] transition-all cursor-pointer"
            >
              <RefreshCw size={12} className={isScanning ? "animate-spin" : ""} />
              <span>Sync Repository</span>
            </button>
          </div>

          {/* Ingest Status Notification */}
          {ingestStatus && (
            <div
              className={cx(
                "mt-4 flex items-start gap-2.5 rounded-xl p-3 text-[12px] border animate-in fade-in-0 duration-150",
                ingestStatus.type === "error"
                  ? "bg-red-500/10 border-red-500/30 text-red-200"
                  : ingestStatus.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                  : "bg-white/[0.06] border-white/20 text-white",
              )}
            >
              {ingestStatus.type === "error" ? (
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
              ) : ingestStatus.type === "success" ? (
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ScanLine size={15} className="text-white/70 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 leading-relaxed font-sans">{ingestStatus.message}</div>
            </div>
          )}
        </section>

                {/* SHORTCUTS HEADER */}
        <div className="flex items-center justify-between pt-2 pb-1">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-1 tracking-tight">
              Shortcuts & Keyboard Controls
            </h2>
            <p className="text-[12px] text-ink-4">
              Click any category tile below to view or customize its keyboard shortcuts
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-mono text-ink-3 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <RotateCcw size={11} />
            <span>Reset All Defaults</span>
          </button>
        </div>

        {/* TILE 1: General & Window Hotkeys */}
        <CollapsibleShortcutCategory
          id="general"
          isOpen={!!openTiles["general"]}
          onToggle={toggleTile}
          icon={Command}
          title="General & Window Controls"
          description="App-wide hotkeys for note creation, view switching, and navigation"
          badge="5 hotkeys"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {GENERAL_SHORTCUT_ROWS.map((row) => (
              <div
                key={row.key}
                className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06] flex items-center justify-between"
              >
                <div>
                  <div className="text-[12.5px] font-medium text-ink-2">{row.label}</div>
                  <div className="text-[10.5px] text-ink-4">{row.hint}</div>
                </div>
                <input
                  type="text"
                  value={(settings[row.key] as string | undefined) || row.def}
                  onChange={(e) =>
                    setSettings({ ...settings, [row.key]: e.target.value })
                  }
                  className="w-24 h-7 text-center rounded-lg bg-black/40 border border-white/15 text-[11.5px] font-mono text-white outline-none focus:border-white/40"
                />
              </div>
            ))}
          </div>
        </CollapsibleShortcutCategory>

        {/* TILE 2: Text & Inline Formatting */}
        <CollapsibleShortcutCategory
          id="textMarks"
          isOpen={!!openTiles["textMarks"]}
          onToggle={toggleTile}
          icon={Type}
          title="Text & Inline Marks"
          description="Bold, italic, strikethrough, highlights, code pills, sub/superscript, and links"
          badge="8 shortcuts"
        >
          <div className="mb-3 text-[11px] font-mono uppercase tracking-[0.12em] text-ink-4">
            Click a field, then press the new combination (Backspace restores default)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TEXT_MARKS_SHORTCUT_ROWS.map((row) => (
              <div
                key={row.key}
                className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06] flex items-center justify-between"
              >
                <div>
                  <div className="text-[12.5px] font-medium text-ink-2">{row.label}</div>
                  <div className="text-[10.5px] text-ink-4">{row.hint}</div>
                </div>
                <ShortcutField
                  value={(settings[row.key] as string | undefined) || row.def}
                  def={row.def}
                  onChange={(combo) => setSettings({ ...settings, [row.key]: combo })}
                />
              </div>
            ))}
          </div>
        </CollapsibleShortcutCategory>

        {/* TILE 3: Blocks & Structure */}
        <CollapsibleShortcutCategory
          id="blocksStructure"
          isOpen={!!openTiles["blocksStructure"]}
          onToggle={toggleTile}
          icon={Layers}
          title="Blocks & Structure"
          description="Headings H1-H3, task checklists, blockquotes, lists, tables, and footnotes"
          badge="10 shortcuts"
        >
          <div className="mb-3 text-[11px] font-mono uppercase tracking-[0.12em] text-ink-4">
            Click a field, then press the new combination (Backspace restores default)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {BLOCKS_STRUCTURE_SHORTCUT_ROWS.map((row) => (
              <div
                key={row.key}
                className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06] flex items-center justify-between"
              >
                <div>
                  <div className="text-[12.5px] font-medium text-ink-2">{row.label}</div>
                  <div className="text-[10.5px] text-ink-4">{row.hint}</div>
                </div>
                <ShortcutField
                  value={(settings[row.key] as string | undefined) || row.def}
                  def={row.def}
                  onChange={(combo) => setSettings({ ...settings, [row.key]: combo })}
                />
              </div>
            ))}
          </div>
        </CollapsibleShortcutCategory>

        {/* TILE 4: Table Navigation & Productivity */}
        <CollapsibleShortcutCategory
          id="tableNav"
          isOpen={!!openTiles["tableNav"]}
          onToggle={toggleTile}
          icon={Table}
          title="Table Navigation & Controls"
          description="Cell traversal, column and row appending, and table boundary management"
          badge="6 controls"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Next / Prev Cell</span>
                <div className="flex items-center gap-1 shrink-0">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm">Tab</kbd>
                  <span className="text-[10px] text-ink-4">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[10px] font-mono font-medium text-white shadow-sm">Shift+Tab</kbd>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Cycles caret focus horizontally across cells</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Append Column</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">Tab in Header End</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Appends a brand new column across all table rows</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Append Row</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">Tab in Last Cell</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Adds a new row at the bottom and focuses its first cell</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Step Down</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">Enter</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Moves directly to the cell in the next row below</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Table Actions</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">Right-Click</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Opens menu to add or delete rows and columns</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Exit Table</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">Enter on Blank Row</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Exits table into a normal text line underneath</p>
            </div>
          </div>
        </CollapsibleShortcutCategory>

        {/* TILE 5: Live Markdown Typing Triggers Guide */}
        <CollapsibleShortcutCategory
          id="syntaxGuide"
          isOpen={!!openTiles["syntaxGuide"]}
          onToggle={toggleTile}
          icon={Sparkles}
          title="Live Markdown Typing Triggers"
          description="Type these live syntax triggers directly in the note to format on the fly"
          badge="11 triggers"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Blockquote</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">&gt; at start</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Type <code className="font-mono text-white/80">&gt; </code> at line start to format as a blockquote</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Numbered List</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">1. at start</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Type <code className="font-mono text-white/80">1. </code> at line start; Enter continues with 2., 3., etc.</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Checklist Task</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">[] at start</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Type <code className="font-mono text-white/80">[] </code> or <code className="font-mono text-white/80">- [ ] </code> to create an interactive task</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Inline Code</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">`code`</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Wrap words with backticks for monospaced inline code</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Link</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">[title](url)</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Formats clickable web and file links (Ctrl+K)</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Footnote</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">[^1] & [^1]:</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Superscript reference and footnote explanation line</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Definition List</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">: Definition</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Type <code className="font-mono text-white/80">: </code> on the line beneath a term to define it</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Strikethrough</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">~~text~~</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Wrap text with double tildes for crossed-out text</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Highlight</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">==word==</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Wrap words with double equal signs for neon marker highlight</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Sub & Super</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">~2~ & ^2^</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Formulas like <code className="font-mono text-white/80">H~2~O</code> and powers like <code className="font-mono text-white/80">x^2</code></p>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/[0.08] hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink-1">Emoji Shortcodes</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/15 text-[11px] font-mono font-medium text-white shadow-sm shrink-0">:fire:</kbd>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-4">Type <code className="font-mono text-white/80">:smile:</code>, <code className="font-mono text-white/80">:heart:</code>, <code className="font-mono text-white/80">:rocket:</code>, etc.</p>
            </div>
          </div>
        </CollapsibleShortcutCategory>

        <BugReportSection />
        <AppUpdatesSection />
      </div>
    </div>
  );
}
