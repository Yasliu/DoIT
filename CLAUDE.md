# DoIT

Local-first notes and tasks on a bento grid, stored as plain Markdown files. Tauri v2 desktop app:
React + TypeScript frontend, Rust backend. Shipped for Windows; a Linux port is in progress.

## Layout

- `src/`: React frontend. `api/tauriBridge.ts` is the only place that calls `invoke`; `components/`,
  `hooks/` (`useWorkspace` owns app state), `lib/` (pure helpers), `styles/`.
  - `platform/`: the frontend's OS seam. `index.ts` sets `data-platform` on `<html>` and exports
    `isLinux`, `pick` and Linux copy; `linux/` holds Linux's own look (`linux.css`, themes) and the
    components Linux swaps in (sidebar, settings, Spotlight search, create and shelf dialogs, dock list),
    chosen in `App`/`TrayCompanion`.
- `src-tauri/src/`: Rust backend.
  - `lib.rs`: app setup, tray icon, window events, command registration.
  - `models.rs`: data types shared with the frontend over IPC.
  - `storage.rs`: `StorageManager`, which reads and writes notes, categories and settings on disk.
  - `commands/`: every `#[tauri::command]`, grouped as `notes`, `files`, `settings`, `window`.
    Keep them thin and delegate.
  - `window/`: canvas/tray window engine: `lifecycle` (create, suspend, rebuild webviews),
    `geometry` (monitor and placement maths), `drag` (keeps a dragged dock window on screen),
    `state` (shared statics).
  - `actions/`: mode switches from outside the UI: tray click, or a second launch with
    `--canvas`, `--dock`, `--toggle` or `--quit`.
  - `platform/`: the only place OS-specific code lives. `mod.rs` documents the interface;
    `windows.rs` (Win32, WebView2, registry) and `unix.rs` (Linux/macOS) implement it.

## Rules

- No `#[cfg(windows)]` outside `platform/`. A new OS behaviour is a new function in `platform/mod.rs`
  with an implementation in each adapter.
- Windows' UI must not change with Linux work: Linux styles live in `src/platform/linux/linux.css`
  under `html[data-platform="linux"]`, hooked to `data-slot` attributes; components read OS
  differences only from `src/platform`. Linux theme settings use `palette`/`appearance`, never `theme_mode`.
- New IPC command: add it to the matching `commands/` file, register it in `lib.rs`, and wrap it
  in `src/api/tauriBridge.ts`.

## Run, check, build

- Dev: `npm install`, then `npm run tauri dev`.
- Frontend typecheck and build: `npm run build`.
- Rust: `cd src-tauri && cargo check` / `cargo test` (Linux needs the WebKitGTK dev packages, see README).
- Release: a `v*` tag runs `.github/workflows/release.yml` (Windows), then `release-linux.yml` adds
  the Fedora rpm (self-updating) and an experimental AppImage to the same release and `latest.json`.
  Local Linux build: `npx tauri build`; Linux-only config `src-tauri/tauri.linux.conf.json`, desktop
  entry `src-tauri/linux/doit.desktop`.
- Linux runs through XWayland by default (positioning needs it); set `DOIT_NATIVE_WAYLAND=1` to opt out.
