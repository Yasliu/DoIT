import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Folder,
  FolderInput,
  FolderSearch,
  HardDrive,
  Keyboard,
  Layers,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Sparkles,
  Square,
} from "lucide-react";
import { AppSettings, DEFAULT_SETTINGS, tauriApi } from "../api/tauriBridge";
import { applyShortcutSettings, DEFAULT_MD_SHORTCUTS } from "../lib/shortcuts";
import { ShortcutField } from "./ShortcutField";
import { cx } from "../lib/text";

interface SettingsPanelProps {
  onBack: () => void;
  onStoragePathChanged: () => void;
  onThemeChanged?: (theme: "glass" | "monochrome") => void;
}

const MD_SHORTCUT_ROWS = [
  { key: "hotkey_h1", label: "Heading 1", hint: "Toggle H1 on the current line", def: DEFAULT_MD_SHORTCUTS.h1 },
  { key: "hotkey_h2", label: "Heading 2", hint: "Toggle H2 on the current line", def: DEFAULT_MD_SHORTCUTS.h2 },
  { key: "hotkey_h3", label: "Heading 3", hint: "Toggle H3 on the current line", def: DEFAULT_MD_SHORTCUTS.h3 },
  { key: "hotkey_bold", label: "Bold", hint: "Wrap selection in **bold**", def: DEFAULT_MD_SHORTCUTS.bold },
  { key: "hotkey_italic", label: "Italic", hint: "Wrap selection in *italic*", def: DEFAULT_MD_SHORTCUTS.italic },
  { key: "hotkey_table", label: "Insert Table", hint: "Drop a markdown table at the cursor", def: DEFAULT_MD_SHORTCUTS.table },
  { key: "hotkey_task", label: "Task Checkbox", hint: "Turn the line into a - [ ] task (or type [] and a space)", def: DEFAULT_MD_SHORTCUTS.task },
  { key: "hotkey_table_col", label: "Table: Add Column", hint: "Inside a table cell: new column on every row", def: DEFAULT_MD_SHORTCUTS.tableCol },
  { key: "hotkey_table_row", label: "Table: Add Row", hint: "Inside a table cell: new row at the bottom", def: DEFAULT_MD_SHORTCUTS.tableRow },
] as const;

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
    void tauriApi.updateSettings(updated);
  };

  const handleBrowseFolder = async () => {
    const selected = await tauriApi.selectStorageDirectory();
    if (selected) {
      setPathInput(selected);
    }
  };

  const handleImportSingleFile = async () => {
    setIngestStatus(null);
    try {
      const note = await tauriApi.importSingleMarkdownFile();
      setIngestStatus({
        type: "success",
        message: `Successfully ingested "${note.title || "Untitled"}" into ${note.category}.`,
      });
      onStoragePathChanged();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to import file";
      if (!msg.toLowerCase().includes("cancelled")) {
        setIngestStatus({
          type: "error",
          message: msg,
        });
      }
    }
  };

  const handlePickAndScan = async () => {
    setIngestStatus(null);
    setIsScanning(true);
    try {
      const res = await tauriApi.pickAndScanFolder();
      setIngestStatus({
        type: "info",
        message: `Scanned ${res.total_scanned} files: ${res.imported_count} notes imported (${res.skipped_count} files skipped).`,
      });
      onStoragePathChanged();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to scan folder";
      if (!msg.toLowerCase().includes("cancelled")) {
        setIngestStatus({
          type: "error",
          message: msg,
        });
      }
    } finally {
      setIsScanning(false);
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

  const handleSave = async () => {
    const nextSettings: AppSettings = {
      ...settings,
      storage_path: pathInput.trim() || settings.storage_path,
    };
    const pathChanged = nextSettings.storage_path !== settings.storage_path;
    const res = await tauriApi.updateSettings(nextSettings);
    applyShortcutSettings(res);
    setSettings(res);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    if (pathChanged) {
      onStoragePathChanged();
    }
  };

  const handleResetDefaults = async () => {
    const res = await tauriApi.updateSettings({
      ...DEFAULT_SETTINGS,
      storage_path: settings.storage_path, // Keep path, reset hotkeys
    });
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

        {/* SECTION 3: Markdown & Text Import */}
        <section className="glass rounded-[20px] p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] border border-white/10">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white">
              <ScanLine size={17} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-semibold text-ink-1">
                Markdown & Text Import
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                Import and scan any <code className="text-white font-mono text-[11px] bg-white/10 px-1 py-0.5 rounded">.md</code> or <code className="text-white font-mono text-[11px] bg-white/10 px-1 py-0.5 rounded">.txt</code> file across devices. No special header or metadata is needed.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleImportSingleFile}
              className="flex h-9 items-center rounded-xl border border-white/15 bg-white/[0.07] px-3.5 text-[12px] font-medium text-white hover:bg-white/[0.14] transition-all cursor-pointer"
            >
              <span>Open / Ingest File</span>
            </button>

            <button
              type="button"
              onClick={handlePickAndScan}
              disabled={isScanning}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 text-[12px] font-medium text-white hover:bg-white/[0.14] transition-all cursor-pointer disabled:opacity-50"
            >
              <FolderInput size={14} />
              <span>{isScanning ? "Scanning..." : "Scan & Import Custom Folder"}</span>
            </button>

            <button
              type="button"
              onClick={handleScanCurrentRepo}
              disabled={isScanning}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[12px] text-ink-3 hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer ml-auto"
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

        {/* SECTION 2: Dynamic Keyboard Shortcuts */}
        <section className="glass rounded-[20px] p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] border border-white/10">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white">
                <Keyboard size={17} strokeWidth={1.8} />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-ink-1">
                  Editable Application Shortcuts
                </h2>
                <p className="text-[11.5px] text-ink-4">
                  Remap hotkeys mapped to local <code className="font-mono text-ink-3">settings.json</code>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1 text-[11px] font-mono text-ink-4 hover:text-ink-2 transition-colors"
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* New Note */}
            <div className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-ink-2">Create New Note</div>
                <div className="text-[10.5px] text-ink-4">Spawns a new note in current view</div>
              </div>
              <input
                type="text"
                value={settings.hotkey_new_note}
                onChange={(e) =>
                  setSettings({ ...settings, hotkey_new_note: e.target.value })
                }
                className="w-24 h-7 text-center rounded-lg bg-black/40 border border-white/15 text-[11.5px] font-mono text-white outline-none focus:border-white/40"
              />
            </div>

            {/* Minimize to Tray */}
            <div className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-ink-2">Minimize to Tray</div>
                <div className="text-[10.5px] text-ink-4">Hides to Windows Taskbar Tray</div>
              </div>
              <input
                type="text"
                value={settings.hotkey_toggle_tray}
                onChange={(e) =>
                  setSettings({ ...settings, hotkey_toggle_tray: e.target.value })
                }
                className="w-24 h-7 text-center rounded-lg bg-black/40 border border-white/15 text-[11.5px] font-mono text-white outline-none focus:border-white/40"
              />
            </div>

            {/* Search */}
            <div className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-ink-2">Global Search</div>
                <div className="text-[10.5px] text-ink-4">Focus search query input</div>
              </div>
              <input
                type="text"
                value={settings.hotkey_search}
                onChange={(e) =>
                  setSettings({ ...settings, hotkey_search: e.target.value })
                }
                className="w-24 h-7 text-center rounded-lg bg-black/40 border border-white/15 text-[11.5px] font-mono text-white outline-none focus:border-white/40"
              />
            </div>

            {/* Settings */}
            <div className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-ink-2">Open Settings</div>
                <div className="text-[10.5px] text-ink-4">Toggles this settings panel</div>
              </div>
              <input
                type="text"
                value={settings.hotkey_settings}
                onChange={(e) =>
                  setSettings({ ...settings, hotkey_settings: e.target.value })
                }
                className="w-24 h-7 text-center rounded-lg bg-black/40 border border-white/15 text-[11.5px] font-mono text-white outline-none focus:border-white/40"
              />
            </div>

            {/* Open / Ingest File */}
            <div className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-ink-2">Open / Ingest File</div>
                <div className="text-[10.5px] text-ink-4">Native file picker to import note</div>
              </div>
              <input
                type="text"
                value={settings.hotkey_open_file ?? "Ctrl+O"}
                onChange={(e) =>
                  setSettings({ ...settings, hotkey_open_file: e.target.value })
                }
                className="w-24 h-7 text-center rounded-lg bg-black/40 border border-white/15 text-[11.5px] font-mono text-white outline-none focus:border-white/40"
              />
            </div>
          </div>

          <div className="mt-5 pb-2 text-[11px] font-mono uppercase tracking-[0.12em] text-ink-4">
            Markdown editor - click a field, then press the new combination (Backspace restores default)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {MD_SHORTCUT_ROWS.map((row) => (
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

          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-ink-4">
            <div className="mb-1.5 font-mono uppercase tracking-[0.1em] text-ink-3">Table keys (fixed)</div>
            <ul className="space-y-1">
              <li>Tab / Shift+Tab: move between cells</li>
              <li>Tab in the last header cell: add a column</li>
              <li>Tab in the last cell: add a row</li>
              <li>Enter: move down a row</li>
              <li>Right-click a table: Add Column / Add Row / Delete Column / Delete Row</li>
            </ul>          </div>
        </section>
      </div>
    </div>
  );
}
