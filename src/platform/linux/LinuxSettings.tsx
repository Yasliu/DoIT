import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Check, ChevronRight, ExternalLink, FolderOpen, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { AppSettings, DEFAULT_SETTINGS, tauriApi } from "../../api/tauriBridge";
import { BLOCKS_STRUCTURE_SHORTCUT_ROWS, TEXT_MARKS_SHORTCUT_ROWS } from "../../components/SettingsPanel";
import { ShortcutField } from "../../components/ShortcutField";
import { applyShortcutSettings } from "../../lib/shortcuts";
import { cx } from "../../lib/text";
import { applyThemeSettings } from "..";
import {
  APPEARANCES,
  type Appearance,
  type LinuxTheme,
  PALETTE_IDS,
  type PaletteId,
  paletteLabel,
  paletteSwatch,
  themeFromSettings,
} from "./theme";

interface LinuxSettingsProps {
  onBack: () => void;
  onStoragePathChanged: () => void;
}

/** These keys are fixed in the app; they are listed, not edited. */
const APP_SHORTCUTS = [
  { label: "New note", keys: "Ctrl+N" },
  { label: "Switch to Docking Mode", keys: "Ctrl+J" },
  { label: "Search notes", keys: "Ctrl+K" },
  { label: "Settings", keys: "Ctrl+," },
  { label: "Open a file", keys: "Ctrl+O" },
];

const TYPING_SHORTCUTS = [
  { label: "Heading", keys: "# at line start" },
  { label: "Task", keys: "[] at line start" },
  { label: "Numbered list", keys: "1. at line start" },
  { label: "Quote", keys: "> at line start" },
  { label: "Definition", keys: ": under a term" },
  { label: "Inline code", keys: "`code`" },
  { label: "Link", keys: "[title](url)" },
  { label: "Strikethrough", keys: "~~text~~" },
  { label: "Highlight", keys: "==text==" },
  { label: "Subscript, superscript", keys: "H~2~O, x^2^" },
  { label: "Footnote", keys: "[^1] and [^1]:" },
  { label: "Emoji", keys: ":name:" },
  { label: "Next table cell", keys: "Tab" },
  { label: "Leave a table", keys: "Enter on an empty row" },
];

const APPEARANCE_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const APPEARANCE_LABELS: Record<Appearance, string> = { system: "System", light: "Light", dark: "Dark" };

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-2 flex h-7 items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold text-ink-1">{title}</h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-[var(--r-xl)] border border-[var(--l-border)] bg-[var(--l-surface)] shadow-[var(--shadow-xs)]">
        {children}
      </div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 border-t border-[var(--l-border)] px-4 py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-1">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-[18px] text-ink-3">{hint}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      data-on={on}
      className="group relative h-5 w-9 shrink-0 rounded-[var(--r-full)] bg-[var(--l-input)] transition-colors duration-200 data-[on=true]:bg-[var(--l-accent)]"
    >
      <span className="absolute left-0.5 top-0.5 size-4 rounded-[var(--r-full)] bg-[var(--l-surface)] shadow-[var(--shadow-knob)] transition-transform duration-200 ease-[var(--ease-out)] group-data-[on=true]:translate-x-4" />
    </button>
  );
}

function Keys({ keys }: { keys: string }) {
  return <kbd className="whitespace-nowrap">{keys}</kbd>;
}

function ThemeCard({ id, selected, appearance, onSelect }: { id: PaletteId; selected: boolean; appearance: "light" | "dark"; onSelect: () => void }) {
  const s = paletteSwatch(id, appearance);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        "group flex flex-col gap-2 rounded-[var(--r-lg)] p-1.5 text-left transition-colors duration-150",
        selected ? "bg-[var(--hover)]" : "hover:bg-[var(--hover)]",
      )}
    >
      <span
        className={cx(
          "relative flex h-16 w-full overflow-hidden rounded-[var(--r-md)] border transition-[border-color,box-shadow] duration-150",
          selected ? "border-[var(--l-accent)] shadow-[0_0_0_1px_var(--l-accent)]" : "border-[var(--l-border)]",
        )}
        style={{ backgroundColor: s.canvas }}
      >
        <span className="w-1/4" style={{ backgroundColor: s.surface }} />
        <span className="flex flex-1 flex-col gap-1.5 p-2.5">
          <span className="h-1.5 w-3/5 rounded-[var(--r-full)]" style={{ backgroundColor: s.text, opacity: 0.85 }} />
          <span className="h-1.5 w-2/5 rounded-[var(--r-full)]" style={{ backgroundColor: s.text, opacity: 0.35 }} />
          <span className="mt-auto h-3 w-8 rounded-[var(--r-xs)]" style={{ backgroundColor: s.accent }} />
        </span>
      </span>
      <span className="flex items-center gap-1.5 px-0.5 text-[12.5px] font-medium text-ink-2">
        {paletteLabel(id)}
        {selected && <Check size={13} className="text-[var(--l-accent)]" />}
      </span>
    </button>
  );
}

export function LinuxSettings({ onBack, onStoragePathChanged }: LinuxSettingsProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [pathInput, setPathInput] = useState("");
  const [version, setVersion] = useState("");
  const [scan, setScan] = useState<{ busy: boolean; message?: string; failed?: boolean }>({ busy: false });
  const [typingOpen, setTypingOpen] = useState(false);
  const [resolvedDark, setResolvedDark] = useState(document.documentElement.dataset.appearance === "dark");

  useEffect(() => {
    void tauriApi.getSettings().then((res) => {
      setSettings(res);
      setPathInput(res.storage_path);
    });
    void import("@tauri-apps/api/app")
      .then((m) => m.getVersion())
      .then(setVersion)
      .catch(() => undefined);
    const observer = new MutationObserver(() => setResolvedDark(document.documentElement.dataset.appearance === "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
    return () => observer.disconnect();
  }, []);

  /** Every control saves as soon as it changes. */
  const save = (next: AppSettings) => {
    setSettings(next);
    void tauriApi.updateSettings(next).then(applyShortcutSettings);
  };

  const theme = themeFromSettings(settings);
  const { palette, appearance } = theme;
  const setTheme = (next: Partial<LinuxTheme>) => {
    const updated = { ...settings, ...theme, ...next };
    applyThemeSettings(updated);
    save(updated);
  };

  const pathChanged = pathInput.trim() !== "" && pathInput.trim() !== settings.storage_path;
  const applyPath = async () => {
    const res = await tauriApi.updateSettings({ ...settings, storage_path: pathInput.trim() });
    setSettings(res);
    setPathInput(res.storage_path);
    onStoragePathChanged();
  };

  const rescan = async () => {
    setScan({ busy: true });
    try {
      const res = await tauriApi.scanMarkdownFolder();
      setScan({ busy: false, message: `${res.imported_count} notes found, ${res.skipped_count} files skipped.` });
      onStoragePathChanged();
    } catch (err: any) {
      setScan({ busy: false, failed: true, message: typeof err === "string" ? err : err?.message || "The folder could not be read." });
    }
  };

  const resetShortcuts = () => {
    const reset = { ...settings };
    for (const row of [...TEXT_MARKS_SHORTCUT_ROWS, ...BLOCKS_STRUCTURE_SHORTCUT_ROWS]) {
      (reset as Record<string, unknown>)[row.key] = row.def;
    }
    save(reset);
  };

  const openIssues = () => {
    const url = "https://github.com/Yasliu/DoIT/issues/";
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
  };

  return (
    <div className="mx-auto w-full max-w-[680px] px-6 pb-24">
      <header className="lx-page-header sticky top-0 z-20 -mx-6 flex h-14 items-center gap-2 bg-[var(--l-canvas)] px-6">
        <button type="button" onClick={onBack} className="ghost -ml-2" aria-label="Back to notes">
          <ArrowLeft size={16} />
          Notes
        </button>
        <h1 className="text-[15px] font-semibold text-ink-1">Settings</h1>
      </header>

      <div className="pt-2">
        <Section title="Appearance">
          <div className="grid grid-cols-4 gap-1 p-2">
            {PALETTE_IDS.map((id) => (
              <ThemeCard
                key={id}
                id={id}
                selected={id === palette}
                appearance={resolvedDark ? "dark" : "light"}
                onSelect={() => setTheme({ palette: id })}
              />
            ))}
          </div>
          <Row label="Mode" hint={appearance === "system" ? "Follows the light or dark style set in GNOME." : undefined}>
            <div role="radiogroup" aria-label="Mode" className="flex rounded-[var(--r-md)] border border-[var(--l-border)] bg-[var(--l-canvas)] p-0.5">
              {APPEARANCES.map((value) => {
                const Icon = APPEARANCE_ICONS[value];
                const on = value === appearance;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTheme({ appearance: value })}
                    className={cx(
                      "relative flex h-7 items-center gap-1.5 rounded-[var(--r-sm)] px-2.5 text-[12.5px] font-medium transition-colors duration-150",
                      on ? "text-ink-1" : "text-ink-3 hover:text-ink-1",
                    )}
                  >
                    {on && (
                      <motion.span
                        layoutId="mode-thumb"
                        className="absolute inset-0 rounded-[var(--r-sm)] bg-[var(--l-surface)] shadow-[var(--shadow-xs)]"
                        transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
                      />
                    )}
                    <Icon size={14} className="relative" />
                    <span className="relative">{APPEARANCE_LABELS[value]}</span>
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="Glass" hint="The desktop shows through the window, with a fine grain. Works with every theme.">
            <Switch label="Glass" on={theme.glass} onChange={(glass) => setTheme({ glass })} />
          </Row>
          <Row label="Boxy" hint="Square corners and hairline edges instead of soft shadows. Works with every theme.">
            <Switch label="Boxy" on={theme.boxy} onChange={(boxy) => setTheme({ boxy })} />
          </Row>
        </Section>

        <Section title="Notes folder">
          <div className="flex items-center gap-2 px-4 pb-3 pt-3.5">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pathChanged) void applyPath();
              }}
              spellCheck={false}
              aria-label="Notes folder"
              className="h-8 min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--l-border)] bg-[var(--l-canvas)] px-2.5 font-mono text-[12.5px] text-ink-1 [font-variant-ligatures:none] focus:border-[color-mix(in_oklab,var(--l-focus)_60%,var(--l-border))]"
            />
            {pathChanged ? (
              <button type="button" onClick={() => void applyPath()} className="btn" data-variant="primary">
                Apply
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const picked = await tauriApi.selectStorageDirectory();
                  if (picked) setPathInput(picked);
                }}
              >
                <FolderOpen size={15} />
                Browse
              </button>
            )}
          </div>
          <p className="px-4 pb-3.5 text-[12px] leading-[18px] text-ink-3">
            Each note is a Markdown file in this folder.{" "}
            <button
              type="button"
              className="font-medium text-ink-2 underline decoration-[var(--l-border)] underline-offset-[3px] hover:text-ink-1"
              onClick={async () => {
                const def = await tauriApi.getDefaultStoragePath();
                if (def) setPathInput(def);
              }}
            >
              Use the default folder
            </button>
          </p>
          <Row label="Rescan the folder" hint={scan.message ?? "Picks up files added or changed outside DoIT."}>
            <button type="button" className="btn" onClick={() => void rescan()} disabled={scan.busy}>
              <RefreshCw size={14} className={scan.busy ? "animate-spin" : undefined} />
              Rescan
            </button>
          </Row>
        </Section>

        <Section title="Window">
          <Row label="Closing the window opens Docking Mode" hint="When off, closing the window quits DoIT.">
            <Switch
              label="Closing the window opens Docking Mode"
              on={settings.dock_on_close ?? true}
              onChange={(on) => save({ ...settings, dock_on_close: on })}
            />
          </Row>
        </Section>

        <Section title="App shortcuts">
          {APP_SHORTCUTS.map((row) => (
            <Row key={row.label} label={row.label}>
              <Keys keys={row.keys} />
            </Row>
          ))}
        </Section>

        <Section
          title="Formatting shortcuts"
          action={
            <button type="button" className="ghost !h-7 text-[12px]" onClick={resetShortcuts}>
              Reset
            </button>
          }
        >
          <p className="px-4 pt-3 text-[12px] leading-[18px] text-ink-3">
            Click a shortcut, then press the new keys. Backspace restores the default.
          </p>
          <div className="grid grid-cols-2 gap-x-6 px-4 pb-2 pt-1">
            {[...TEXT_MARKS_SHORTCUT_ROWS, ...BLOCKS_STRUCTURE_SHORTCUT_ROWS].map((row) => (
              <div key={row.key} className="flex h-10 items-center justify-between gap-3 border-b border-[var(--l-border)] last:border-b-0 [&:nth-last-child(2):nth-child(odd)]:border-b-0">
                <span className="truncate text-[13px] text-ink-2">{row.label}</span>
                <ShortcutField
                  value={(settings[row.key] as string | undefined) || row.def}
                  def={row.def}
                  onChange={(combo) => save({ ...settings, [row.key]: combo })}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Markdown as you type">
          <button
            type="button"
            onClick={() => setTypingOpen((v) => !v)}
            aria-expanded={typingOpen}
            className="flex h-11 w-full items-center gap-2 px-4 text-left text-[13px] font-medium text-ink-1 hover:bg-[var(--hover)]"
          >
            <ChevronRight
              size={15}
              className="text-ink-3 transition-transform duration-200 ease-[var(--ease-out)]"
              style={{ transform: typingOpen ? "rotate(90deg)" : "none" }}
            />
            {typingOpen ? "Hide the syntax list" : `Show ${TYPING_SHORTCUTS.length} typing shortcuts`}
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out)]"
            style={{ gridTemplateRows: typingOpen ? "1fr" : "0fr" }}
          >
            <div className="min-h-0 overflow-hidden">
              {TYPING_SHORTCUTS.map((row) => (
                <Row key={row.label} label={row.label}>
                  <Keys keys={row.keys} />
                </Row>
              ))}
            </div>
          </div>
        </Section>

        <Section title="About">
          <Row label={`DoIT ${version}`} hint="Updates are checked in the background.">
            <button type="button" className="btn" onClick={() => window.dispatchEvent(new CustomEvent("doit:check-updates"))}>
              Check for updates
            </button>
          </Row>
          <Row label="Report a problem" hint="Opens the issue tracker on GitHub.">
            <button type="button" className="btn" onClick={openIssues}>
              <ExternalLink size={14} />
              Open
            </button>
          </Row>
        </Section>
      </div>
    </div>
  );
}
