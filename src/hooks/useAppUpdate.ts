import { useCallback, useEffect, useRef, useState } from "react";
import { tauriApi, type FoundUpdate, type UpdateCheck } from "../api/tauriBridge";
import { APP_VERSION, isVersionLower, whatsNewAfter } from "../lib/version";

/**
 * What the update control shows. `none` (no control at all) covers up to date, not checked yet,
 * Microsoft Store installs and releases with no package for this system.
 */
export type UpdateState =
  | { status: "none" }
  | { status: "available"; version: string; notes: string }
  /** `percent` is null while the size is unknown. */
  | { status: "downloading"; version: string; notes: string; percent: number | null }
  | { status: "ready"; version: string; notes: string }
  /** Installing, then restarting: a password prompt or the Windows installer may show. */
  | { status: "installing"; version: string; notes: string }
  | { status: "error"; version: string; notes: string; reason: string };

export type Notify = (message: string, action?: { label: string; run: () => void }) => void;

export interface AppUpdate {
  state: UpdateState;
  /** The icon's one action: download the update, restart into it, or retry what failed. */
  act: () => void;
  /** The full "What's new" dialog is open. */
  whatsNew: boolean;
  closeWhatsNew: () => void;
}

const SEEN_KEY = "doit.release_notes_version";
const SESSION_SEEN_KEY = "doit.release_notes_seen";
const MANUAL_TIMEOUT = 30000;
// GitHub's release CDN sometimes needs 10s+ for the TLS handshake: one short attempt silently missed
// updates for hours. So retry with growing patience, then re-check every 6 hours (tray sessions).
const ATTEMPTS = [
  { delay: 1200, timeout: 15000 },
  { delay: 25000, timeout: 30000 },
  { delay: 120000, timeout: 30000 },
  { delay: 600000, timeout: 30000 },
];
const RECHECK_EVERY = 6 * 60 * 60 * 1000;

/** What the update control does when pressed, for screen readers and tooltips. */
export function updateLabel(state: UpdateState): string {
  switch (state.status) {
    case "available":
      return `Update to DoIT ${state.version}`;
    case "downloading":
      return `Downloading DoIT ${state.version}${state.percent === null ? "" : `, ${state.percent}%`}`;
    case "ready":
      return `Restart to update to DoIT ${state.version}`;
    case "installing":
      return `Installing DoIT ${state.version}`;
    case "error":
      return "The update failed. Try again";
    default:
      return "";
  }
}

/** What a screen reader hears when the state changes. Download progress stays quiet. */
export function updateAnnouncement(state: UpdateState): string {
  switch (state.status) {
    case "available":
      return `DoIT ${state.version} is available.`;
    case "downloading":
      return `Downloading DoIT ${state.version}.`;
    case "ready":
      return `DoIT ${state.version} is downloaded. Restart to update.`;
    case "installing":
      return `Installing DoIT ${state.version}.`;
    case "error":
      return `The update failed. ${state.reason}`;
    default:
      return "";
  }
}

const reasonOf = (err: unknown) =>
  (typeof err === "string" ? err : (err as { message?: string } | null)?.message) || "The update failed. Try again in a moment.";

/**
 * Everything about updating DoIT, for either design to draw: the background check, Settings' "Check
 * for updates" (`doit:check-updates`, answered through `notify`), download, install and restart,
 * and the "What's new" after an update (`doit:show-release-log` opens it).
 */
export function useAppUpdate(notify: Notify): AppUpdate {
  const [state, setState] = useState<UpdateState>({ status: "none" });
  const [whatsNew, setWhatsNew] = useState(false);
  const stateRef = useRef(state);
  const found = useRef<FoundUpdate | null>(null);
  const failed = useRef<"download" | "install">("download");
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const set = useCallback((next: UpdateState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const check = useCallback(
    async (timeoutMs: number): Promise<UpdateCheck["kind"]> => {
      const result = await tauriApi.checkForUpdate(timeoutMs);
      if (result.kind !== "available") return result.kind;
      const { status } = stateRef.current;
      // A download under way, or kept for a restart, stays; a newer release replaces an offer or a
      // failure (which retrying may never fix).
      const newer = isVersionLower(found.current?.version ?? null, result.update.version);
      if (status === "none" || ((status === "available" || status === "error") && newer)) {
        found.current = result.update;
        const { version, notes } = result.update;
        // Downloaded already, by this page before it was rebuilt: offer the restart.
        const kept = (await tauriApi.downloadedUpdate()) === version;
        if (stateRef.current.status === status) set(kept ? { status: "ready", version, notes } : { status: "available", version, notes });
      }
      return "available";
    },
    [set],
  );

  const download = useCallback(async () => {
    const update = found.current;
    if (!update) return;
    const { version, notes } = update;
    set({ status: "downloading", version, notes, percent: null });
    try {
      await tauriApi.downloadUpdate(update, (percent) => set({ status: "downloading", version, notes, percent }));
      set({ status: "ready", version, notes });
    } catch (err) {
      failed.current = "download";
      set({ status: "error", version, notes, reason: reasonOf(err) });
    }
  }, [set]);

  const install = useCallback(async () => {
    const update = found.current;
    if (!update) return;
    const { version, notes } = update;
    set({ status: "installing", version, notes });
    try {
      await tauriApi.installUpdate(update);
    } catch (err) {
      failed.current = "install";
      set({ status: "error", version, notes, reason: reasonOf(err) });
    }
  }, [set]);

  const act = useCallback(() => {
    const { status } = stateRef.current;
    if (status === "available" || (status === "error" && failed.current === "download")) void download();
    else if (status === "ready" || status === "error") void install();
  }, [download, install]);

  // The background check.
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const run = (i: number) => {
      if (cancelled || i >= ATTEMPTS.length) return;
      timers.push(
        window.setTimeout(async () => {
          if (!cancelled && (await check(ATTEMPTS[i].timeout)) === "error") run(i + 1);
        }, ATTEMPTS[i].delay),
      );
    };
    run(0);
    const interval = window.setInterval(() => void check(MANUAL_TIMEOUT), RECHECK_EVERY);
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(interval);
    };
  }, [check]);

  // Settings' "Check for updates" and "What's new". A found update shows on the icon.
  useEffect(() => {
    const onCheck = async () => {
      const kind = await check(MANUAL_TIMEOUT);
      const message = {
        store: "Updates are managed by the Microsoft Store.",
        none: "You're on the latest version.",
        unsupported: "A newer DoIT is out, but there is no update package for this system yet.",
        error: "Couldn't reach the update server. Try again in a moment.",
        available: null,
      }[kind];
      if (message) notifyRef.current(message);
    };
    const onShowLog = () => setWhatsNew(true);
    window.addEventListener("doit:check-updates", onCheck);
    window.addEventListener("doit:show-release-log", onShowLog);
    return () => {
      window.removeEventListener("doit:check-updates", onCheck);
      window.removeEventListener("doit:show-release-log", onShowLog);
    };
  }, [check]);

  // The first run after an update says what's new, once; a fresh install only records the version.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_SEEN_KEY) === APP_VERSION) return;
    } catch {
      /* storage unavailable */
    }
    void tauriApi.getSettings().then((settings) => {
      try {
        const diskSeen = settings.last_seen_version;
        const previous = diskSeen || localStorage.getItem(SEEN_KEY);
        sessionStorage.setItem(SESSION_SEEN_KEY, APP_VERSION);
        if (previous && !isVersionLower(previous, APP_VERSION)) {
          if (!diskSeen) void tauriApi.patchSettings({ last_seen_version: APP_VERSION });
          return;
        }
        localStorage.setItem(SEEN_KEY, APP_VERSION);
        void tauriApi.patchSettings({ last_seen_version: APP_VERSION });
        const show = whatsNewAfter(previous, APP_VERSION);
        if (show === "dialog") setWhatsNew(true);
        if (show === "toast") notifyRef.current(`Updated to ${APP_VERSION}`, { label: "What's new", run: () => setWhatsNew(true) });
      } catch {
        /* storage unavailable */
      }
    });
  }, []);

  return { state, act, whatsNew, closeWhatsNew: useCallback(() => setWhatsNew(false), []) };
}
