import { useEffect, useState, type ReactNode } from "react";
import { GraphSpec } from "@/registry/default/graph-spec/graph-spec";
import { Keys } from "@/registry/default/keys/keys";
import { AppSettings, DEFAULT_SETTINGS, settingsChanges, tauriApi } from "../../api/tauriBridge";
import { APP_VERSION } from "../../lib/version";
import { BLOCKS_STRUCTURE_SHORTCUT_ROWS, TEXT_MARKS_SHORTCUT_ROWS, applyShortcutSettings } from "../../lib/shortcuts";
import { applyThemeSettings, isLinux, platform } from "../../platform";
import { useMarkdownFlag } from "../../platform/DesignSwitch";
import { ACCENT_IDS, APPEARANCES, Btn, Choices, Field, Frame, Row, Spin, Toggle, accentColors, accentLabel, resolve, themeFromSettings, type Theme } from "../ui";
import { ShortcutField } from "./ShortcutField";

interface SettingsProps {
  onStoragePathChanged: () => void;
}

/** These keys are fixed in the app; they are listed, not edited. */
const APP_SHORTCUTS = [
  { keys: "Ctrl+N", action: "new note" },
  { keys: "Ctrl+J", action: "shrink to the dock" },
  { keys: "Ctrl+K", action: "search notes", accent: true },
  { keys: "Ctrl+,", action: "settings" },
  { keys: "Ctrl+O", action: "open a file" },
];

const TYPING_SHORTCUTS = [
  { keys: "#", action: "heading, at line start" },
  { keys: "[]", action: "task, at line start" },
  { keys: "1.", action: "numbered list, at line start" },
  { keys: ">", action: "quote, at line start" },
  { keys: ":", action: "definition, under a term" },
  { keys: "`code`", action: "inline code" },
  { keys: "[title](url)", action: "link" },
  { keys: "~~text~~", action: "strikethrough" },
  { keys: "==text==", action: "highlight" },
  { keys: "H~2~O x^2^", action: "subscript, superscript" },
  { keys: "[^1]", action: "footnote, then [^1]: below" },
  { keys: ":name:", action: "emoji" },
  { keys: "Tab", action: "indent, or nest a list line" },
  { keys: "Alt+↑", action: "move a line with its nested lines" },
  { keys: "Tab", action: "next table cell" },
];

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Frame title={title} className="px-6 pb-6 pt-8">
      {action && <span className="absolute right-[2ch] top-0 z-10 -translate-y-1/2 bg-background px-[0.5ch]">{action}</span>}
      {children}
    </Frame>
  );
}

export function Settings({ onStoragePathChanged }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [pathInput, setPathInput] = useState("");
  const [version, setVersion] = useState(APP_VERSION);
  const [scan, setScan] = useState<{ busy: boolean; message?: string; failed?: boolean }>({ busy: false });
  const [quickNote, setQuickNote] = useState<{ supported: boolean | null; error?: string }>({ supported: null });
  const markdownFlag = useMarkdownFlag();

  useEffect(() => {
    void tauriApi.getSettings().then((res) => {
      setSettings(res);
      setPathInput(res.storage_path);
    });
    void tauriApi.quickNoteShortcutStatus().then(({ supported, error }) => setQuickNote({ supported, error: error ?? undefined }));
    void import("@tauri-apps/api/app")
      .then((m) => m.getVersion())
      .then((v) => setVersion(v === "1.2.3" ? APP_VERSION : v))
      .catch(() => undefined);
  }, []);

  /** Every control saves as soon as it changes. */
  const save = (next: AppSettings) => {
    const changes = settingsChanges(settings, next);
    setSettings(next);
    void tauriApi.patchSettings(changes).then(applyShortcutSettings);
  };

  const theme = themeFromSettings(settings);
  const setTheme = (next: Partial<Theme>) => {
    const merged = { ...theme, ...next };
    const updated = { ...settings, palette: merged.accent, appearance: merged.appearance };
    applyThemeSettings(updated);
    save(updated);
  };
  const mode = resolve(theme.appearance);

  const pathChanged = pathInput.trim() !== "" && pathInput.trim() !== settings.storage_path;
  const applyPath = async () => {
    const res = await tauriApi.patchSettings({ storage_path: pathInput.trim() });
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

  /** Saved only once the OS accepts the keys; otherwise the row says why and the old keys stay. */
  const changeQuickNote = async (keys: string) => {
    try {
      setSettings(await tauriApi.setQuickNoteShortcut(keys));
      setQuickNote({ supported: true });
    } catch (err) {
      setQuickNote({ supported: true, error: typeof err === "string" ? err : "Those keys can't be used. Try different ones." });
    }
  };

  const resetShortcuts = () => {
    const reset = { ...settings };
    for (const row of [...TEXT_MARKS_SHORTCUT_ROWS, ...BLOCKS_STRUCTURE_SHORTCUT_ROWS]) (reset as Record<string, unknown>)[row.key] = row.def;
    save(reset);
  };

  const openIssues = () => {
    const url = "https://github.com/Yasliu/DoIT/issues/";
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
  };

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
      <div className="mx-auto w-full max-w-[800px] px-12 pb-32 pt-12">
        <h1 className="text-[24px] font-semibold leading-tight">Settings</h1>

        <div className="mt-12 space-y-14">
          <Section title="appearance">
            <Row label="accent">
              <Choices
                label="Accent"
                value={theme.accent}
                onChange={(accent) => setTheme({ accent })}
                className="max-w-[46ch] justify-end"
                options={ACCENT_IDS.map((id) => ({ value: id, label: accentLabel(id), lead: <span style={{ color: accentColors(id, mode)[0] }}>█</span> }))}
              />
            </Row>
            <Row label="mode" hint={theme.appearance === "system" ? (isLinux ? "Follows the light or dark style set in GNOME." : "Follows the light or dark mode set in Windows.") : undefined}>
              <Choices label="Mode" value={theme.appearance} onChange={(appearance) => setTheme({ appearance })} options={APPEARANCES.map((a) => ({ value: a, label: a }))} />
            </Row>
          </Section>

          <Section title="notes folder">
            <div className="flex items-center gap-[2ch] pt-1">
              <Field
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && pathChanged && void applyPath()}
                aria-label="Notes folder"
                prompt="~"
                wrapClassName="flex-1"
              />
              {pathChanged ? (
                <Btn variant="primary" onClick={() => void applyPath()}>
                  apply
                </Btn>
              ) : (
                <Btn
                  onClick={async () => {
                    const picked = await tauriApi.selectStorageDirectory();
                    if (picked) setPathInput(picked);
                  }}
                >
                  browse
                </Btn>
              )}
            </div>
            <p className="mt-3">
              <button
                type="button"
                className="text-[13px] text-graph-muted underline decoration-dashed underline-offset-4 hover:text-graph-accent"
                onClick={async () => {
                  const def = await tauriApi.getDefaultStoragePath();
                  if (def) setPathInput(def);
                }}
              >
                use the default folder
              </button>
            </p>
            <Row label="rescan the folder" hint={<span className={scan.failed ? "text-destructive" : undefined}>{scan.message ?? "Picks up files added or changed outside DoIT."}</span>} className="mt-3">
              <Btn onClick={() => void rescan()} disabled={scan.busy} lead={scan.busy ? <Spin /> : "↻"}>
                rescan
              </Btn>
            </Row>
          </Section>

          <Section title="window">
            <Row label="closing the window opens the dock" hint="When off, closing the window quits DoIT.">
              <Toggle label="Closing the window opens the dock" on={settings.dock_on_close ?? true} onChange={(on) => save({ ...settings, dock_on_close: on })} />
            </Row>
          </Section>

          <Section title="shortcuts">
            {quickNote.supported === null ? null : quickNote.supported ? (
              <Row label="quick note from anywhere" hint={<span className={quickNote.error ? "text-destructive" : undefined}>{quickNote.error ?? "Opens the dock on your latest note, even from another app. Press again to put it away."}</span>}>
                {settings.quick_note_shortcut && (
                  <Btn variant="ghost" onClick={() => void changeQuickNote("")}>
                    off
                  </Btn>
                )}
                <ShortcutField value={settings.quick_note_shortcut ?? ""} def="" onChange={(keys) => void changeQuickNote(keys)} />
              </Row>
            ) : (
              <Row
                label="quick note from anywhere"
                hint="Your desktop doesn't let apps listen for keys while another app is in front. In your system's keyboard settings, add a custom shortcut that runs: doit --quick-note"
              />
            )}
            <div className="mt-4">
              <Keys title="app" bindings={APP_SHORTCUTS} frame="rule" />
            </div>
          </Section>

          <Section
            title="formatting keys"
            action={
              <Btn variant="ghost" onClick={resetShortcuts} className="h-6">
                reset
              </Btn>
            }
          >
            <p className="pb-3 text-[13px] text-graph-muted">Focus a shortcut and press the new keys. Backspace restores the default.</p>
            <div className="grid grid-cols-1 gap-x-[4ch] sm:grid-cols-2">
              {[...TEXT_MARKS_SHORTCUT_ROWS, ...BLOCKS_STRUCTURE_SHORTCUT_ROWS].map((row) => (
                <div key={row.key} className="tm-rule-b flex h-12 items-center justify-between gap-[2ch]">
                  <span className="truncate">{row.label.toLowerCase()}</span>
                  <ShortcutField value={(settings[row.key] as string | undefined) || row.def} def={row.def} onChange={(combo) => save({ ...settings, [row.key]: combo })} />
                </div>
              ))}
            </div>
          </Section>

          <Keys title="markdown as you type" bindings={TYPING_SHORTCUTS} />

          <Section title="experimental">
            <Row label="ILOVEMARKDOWN" hint={markdownFlag.pending ? "Restart DoIT to switch." : "Turn off to go back to the default look. Takes effect after a restart."}>
              {markdownFlag.pending && (
                <Btn variant="primary" onClick={markdownFlag.restart}>
                  restart now
                </Btn>
              )}
              <Toggle label="ILOVEMARKDOWN" on={markdownFlag.on} onChange={markdownFlag.set} />
            </Row>
          </Section>

          <GraphSpec
            title="about"
            rows={[
              { label: "version", value: `DoIT ${version}`, accent: true },
              { label: "system", value: platform },
            ]}
          />
          <div className="-mt-6 flex flex-wrap gap-[2ch]">
            <Btn onClick={() => window.dispatchEvent(new CustomEvent("doit:check-updates"))}>check for updates</Btn>
            <Btn onClick={() => window.dispatchEvent(new CustomEvent("doit:show-release-log"))}>what's new</Btn>
            <Btn onClick={openIssues}>report a problem ↗</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
