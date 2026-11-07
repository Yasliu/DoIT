# DoIT

Local-first notes and tasks on a bento grid, stored as plain Markdown files. Tauri v2 desktop app:
React + TypeScript frontend, Rust backend. Shipped for Windows; a Linux port is in progress.

## Layout

- `src/`: React frontend. `api/tauriBridge.ts` is the only place that calls `invoke`; `components/`,
  `hooks/` (`useWorkspace` owns app state), `lib/` (pure helpers), `styles/`.
  - `platform/`: the frontend's seam for OS and design. `index.ts` sets `data-platform` and
    `data-design` on `<html>`: `isLinux` is for real OS behaviour only; `isModern`, `pick` and `text`
    pick the design. Two designs: classic (Windows' original look) and modern (always on Linux; on
    Windows behind the experimental `design` setting, switched in `DesignSwitch.tsx`). `modern/` holds
    the modern look (`modern.css`, themes, Boxy) and the components it swaps in (sidebar, settings,
    Spotlight search, create and shelf dialogs, dock list), chosen in `App`/`TrayCompanion`.
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
- The classic design must not change with modern work: modern styles live in
  `src/platform/modern/modern.css` under `html[data-design="modern"]` (plus `[data-platform]` for OS
  bits such as the Linux window frame or caption buttons), hooked to `data-slot` attributes.
  Components read OS and design only from `src/platform`; edits to shared components stay small
  hooks. Modern theme settings use `palette`/`appearance`/`glass`/`boxy`, never `theme_mode`.
- Preview another OS's UI in dev: `localStorage["doit.dev-platform"] = "windows"`, then reload.
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
