# DoIT

Local-first notes and tasks on a bento grid, stored as plain Markdown files. Tauri v2 desktop app:
React + TypeScript frontend, Rust backend. Shipped for Windows; a Linux port is in progress.

## Layout

- `src/`: React frontend. `api/tauriBridge.ts` is the only place that calls `invoke`; `components/`,
  `hooks/` (`useWorkspace` owns app state), `lib/` (pure helpers), `styles/`.
  - `editor/`: the note editor shared by the canvas sheet and the dock panel (`useNoteEditor` plus
    the pieces that render it). Each window keeps only its own chrome and toolbar.
  - `platform/`: the frontend's seam for OS and design. `index.ts` sets `data-platform` and
    `data-design` on `<html>`: `isLinux` is for real OS behaviour only; `isModern`, `pick` and `text`
    pick the design. Modern is the design on every OS since v1.2.0 (`isModern` is always true); the
    classic components are still in the tree but unreachable. `modern/` holds
    the modern look (`modern.css`, themes, Boxy) and the components it swaps in (sidebar, settings,
    Spotlight search, create and shelf dialogs, dock list), chosen in `App`/`TrayCompanion`.
- `src-tauri/src/`: Rust backend.
  - `lib.rs`: app setup, tray icon, window events, command registration.
  - `models.rs`: data types shared with the frontend over IPC.
  - `storage/`: `StorageManager` (notes and settings on disk), `shelves` (the ordered shelf list),
    `writer` (one thread writes note files in edit order), `attachments` (images beside the notes).
  - `commands/`: every `#[tauri::command]`, grouped as `notes`, `files`, `settings`, `window`.
    Keep them thin and delegate.
  - `window/`: owns the mode (canvas, dock pill, dock panel). Callers name the mode they want;
    `placement` is the pure, tested maths, `webview` builds and retires webviews, `lifecycle` runs
    the transitions, `pill/` draws the pill natively (no webview runs once it has been alone for
    20 s), `drag` keeps a dragged dock window on screen, `flush` waits for pages to save before one
    is retired or the app quits.
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
- Preview builds (`src-tauri/tauri.preview.conf.json` plus `DOIT_PREVIEW=1`) must never reach the
  updater or the Microsoft Store: no signing key, no updater files, no MSI. They are a separate app
  with their own data.

## Run, check, build

- Dev: `npm install`, then `npm run tauri dev`.
- Frontend typecheck and build: `npm run build`.
- Frontend tests: `npm test`.
- Rust: `cd src-tauri && cargo check` / `cargo test` (Linux needs the WebKitGTK dev packages, see README).
- PRs and `v1.2.3-beta.1` tags run `.github/workflows/checks.yml`: tests on Windows and Linux, and a
  Windows preview installer as a workflow artifact (beta tags also publish it as a prerelease).
- Release: a `v1.2.3` tag runs `.github/workflows/release.yml` (Windows), then `release-linux.yml` adds
  the Fedora rpm (self-updating) and an experimental AppImage to the same release and `latest.json`.
  Local Linux build: `npx tauri build`; Linux-only config `src-tauri/tauri.linux.conf.json`, desktop
  entry `src-tauri/linux/doit.desktop`.
- Linux runs through XWayland by default (positioning needs it); set `DOIT_NATIVE_WAYLAND=1` to opt out.
