# DoIT

Local-first notes and tasks on a bento grid, stored as plain Markdown files. Tauri v2 desktop app:
React + TypeScript frontend, Rust backend. Shipped for Windows; a Linux port is in progress.

## Layout

- `src/`: React frontend. `api/tauriBridge.ts` is the only place that calls `invoke`; `hooks/`
  (`useWorkspace` owns app state), `lib/` (pure helpers). `main.tsx` loads one design per run:
  `defaultDesign.ts` or, with the ILOVEMARKDOWN flag on, `markdown/`. Each brings its own styles.
  - Default design: `App.tsx`, `components/`, `styles/globals.css`, and `platform/modern/` (the
    modern look and the components it swaps in). The classic components are still in the tree but
    unreachable.
  - `editor/`: the note editor; the default design renders it, ILOVEMARKDOWN shares its core
    (`useNoteEditor`, `bodyReader`).
  - `markdown/`: the ILOVEMARKDOWN design, a monospace text-mode UI. `ui/` holds every control and
    its theme, `canvas/` the main window, `dock/` the dock panel, `editor/` its toolbar, body and
    popovers, `figures/` the `::tag … ::` figure blocks notes can hold (`catalog` lists them;
    `lib/format` reads and writes them only once `enableFigureBlocks` has run).
  - `registry/default/`: the figure components (MIT, see `public/THIRD_PARTY_NOTICES.md`). Keep
    edits small; `markdown/styles/figures.css` holds their tokens.
  - `platform/`: the frontend's seam for OS and design. `isLinux` is for real OS behaviour only;
    `design`/`isMarkdown` say which design runs, from the `design` setting (`"markdown"` turns the
    flag on; Settings saves it and asks for a restart).
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
  - `actions/`: mode switches from outside the UI: tray click, the two global shortcuts (`shortcut`:
    quick note, and show/hide the dock panel; under Wayland they are bound through the desktop's own
    shortcut settings where it has them), or a second launch with `--canvas`, `--dock`, `--toggle`,
    `--toggle-panel`, `--quick-note` or `--quit`.
  - `platform/`: the only place OS-specific code lives. `mod.rs` documents the interface;
    `windows.rs` (Win32, WebView2, registry) and `unix.rs` (Linux/macOS) implement it.

## Rules

- No `#[cfg(windows)]` outside `platform/`. A new OS behaviour is a new function in `platform/mod.rs`
  with an implementation in each adapter.
- The default design must not change with ILOVEMARKDOWN work: that design lives in `src/markdown`
  with its own stylesheet, and shared code (`editor/`, `lib/`, `hooks/`, `api/`) stays
  design-neutral. Components read OS and design only from `src/platform`. Both designs share the
  `palette` and `appearance` settings (ILOVEMARKDOWN stores accents as the default palette ids).
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
  the Debian/Ubuntu deb (self-updating), Fedora rpm (self-updating), and an experimental AppImage to
  the same release and `latest.json`.
  Local Linux build: `npx tauri build`; Linux-only config `src-tauri/tauri.linux.conf.json`, desktop
  entry `src-tauri/linux/doit.desktop`.
- Linux runs through XWayland by default (positioning needs it); set `DOIT_NATIVE_WAYLAND=1` to opt out.
