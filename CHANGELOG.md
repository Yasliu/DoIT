# DoIT Developer Architecture & Engineering Changelog

## [2026-11-01] - Version 1.1.4: Viewport Bounding Clamps, Ingestion Bar Breathing Room & Persistent Single-Show Release Modal

### 1. Tray Companion Font Dropdown Viewport Clamping (`src/components/TrayCompanion.tsx`, `src/components/NoteSheet.tsx`)
- **Dynamic Viewport Height Measurement**: Calculated the exact distance from the typeface trigger button to the bottom of the window chassis (`window.innerHeight - rect.bottom - 18`).
- **Eliminated Overflow Clipping**: Replaced static Tailwind `max-h-[380px] sm:max-h-[420px]` classes with dynamic inline `style={{ maxHeight: `${fontMaxHeight}px` }}` clamped between `140px` and `320px`. The dropdown popover now terminates safely within the window chassis, guaranteeing the bottom border, border radius, and padding are fully visible without being clipped by the window's `overflow-hidden`.
- **Mirror Fix for Canvas Editor**: Applied the same dynamic `maxHeight` clamping to `NoteSheet.tsx` to safeguard against compact window dimensions.

### 2. Sidebar Ingestion Portal Layout & Text Truncation Fix (`src/components/Sidebar.tsx`)
- **Full Text Visibility**: Replaced `truncate` and `overflow-hidden` on `File Import` and `Scan Folder` with `whitespace-nowrap`, adjusted font size to `11px`, and tightened padding to `px-1.5` so neither label is clipped into ellipsis (`Scan Fold...`).
- **Breathing Room & Padding Calibration**: Expanded the portal container from `h-7 overflow-hidden pt-1.5` to `pt-2 pb-3.5 min-h-[38px]`, providing ample vertical clearance between the ingestion buttons and the `SHELVES` category header below.

### 3. Persistent One-Time Update Log Modal (`src-tauri/src/models.rs`, `src/api/tauriBridge.ts`, `src/App.tsx`)
- **Disk-Backed State (`last_seen_version`)**: Added `last_seen_version: Option<String>` to `AppSettings` in Rust backend and TypeScript bridge, ensuring version acknowledgments persist in `settings.json`.
- **No-Spam Upgrade Guarantee**:
  - Fresh installs / first launches quietly initialize `last_seen_version = CURRENT_VERSION` without displaying the modal.
  - Upgrading users are shown the modal exactly once when `last_seen_version < CURRENT_VERSION`.
  - Closing the modal commits the version to disk (`settings.json`), `localStorage`, and `sessionStorage`, permanently suppressing repeated popups across application reboots and reloads.

## [2026-10-30] - UI Refinements, Event Decoupling & Multi-Monitor Position Tracking

### 1. Visual Aesthetics & Outline Suppression (`src/styles/globals.css`, `src/components/TrayCompanion.tsx`)
- **Global Outline Reset**: Suppressed all default browser/WebView2 runtime focus bounding rings via `@layer base`:
  ```css
  * {
    -webkit-tap-highlight-color: transparent !important;
    outline: none !important;
  }
  *:focus,
  *:focus-visible,
  *:focus-within {
    outline: none !important;
    box-shadow: none !important;
  }
  ```
- **Pill Container and Action Button**: Applied explicit `outline-none focus:outline-none focus:ring-0 border-none ring-0` on `.group/pill` and its `New Note (+)` trigger button. Eliminated all rectangular artifact borders on hover, focus, and pointer down.
- **Hardware-Accelerated Radial Light Cue**: Integrated `@keyframes radialCueFade` scaling from `0.65` to `1.35` with `[mask-image:radial-gradient(circle,black_20%,transparent_70%)]`. Guarantees a zero-border, soft radial spotlight halo that fades to 0% opacity within window dimensions.

### 2. Multi-Monitor Real-Time Window Position Synchronization (`src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`)
- **Live Event Hook**: Hooked `tauri::WindowEvent::Moved(pos)` in `lib.rs` for the `"tray"` window, routing real-time window drag coordinates directly to `commands::track_tray_window_moved`.
- **Dynamic Position Anchoring**: Modified `position_tray_on_monitor` in `commands.rs` to prioritize the window's live physical coordinates (`window.outer_position()`) over stale in-memory cached points.
- **Edge Boundary Constraints**: Clamped all coordinates against active monitor physical boundaries (`m_pos.x + 8` to `m_pos.x + m_size.width - win_size.width - 8`).
- **Seamless Expansion Mapping**:
  - When the mini tile is dragged to any screen coordinate `(x, y)` on any display, expanding it now anchors directly from that live physical position instead of warping back to an earlier coordinate.
  - Collapsing back down restores the exact center-anchored pill position on the active display.

### 3. Transition Decoupling & Event Loop Elimination (`src/components/TrayCompanion.tsx`)
- **Top Bar Drag vs. Minimize Intent Buffer**:
  - Implemented a 4-pixel movement threshold on `handleTopBarPointerDown`.
  - Dispatches `window.start_dragging()` only when cursor travel exceeds 4px.
  - If mouse release occurs within 4px of travel, dispatches clean `collapseTray()` intent.
  - Removed synthetic `onClick` from the top bar div to eliminate double-firing and event stealing.
- **Atomic Transition Lock (`visibilityLockRef`)**:
  - Added a 400ms atomic timestamp lock during expand and collapse state transitions.
  - Prevents synthetic `click` events from bleeding through from the mini tile into the newly mounted top bar under the cursor.

### 4. Text & Frontmatter Sanitization (`src/lib/text.ts`, `src-tauri/src/models.rs`, `src-tauri/src/storage.rs`)
- **Escaped Quotes & Bracket Stripping**: Enhanced `cleanText` and `clean_yaml_scalar` to strip repeated quotes and backslashes from titles, categories, and font family strings.
- **Dummy Line Pruning**: Eradicated legacy `"Line"` input placeholder and filtered any auto-generated dummy rows from persistent disk storage.
- **Inline Rich Formatting**: Contenteditable freeform editor renders genuine `<strong>` and `<em>` tags; removed raw markdown asterisks from user-facing surfaces.

### 5. Absolute Physical Unit Multi-Monitor Positioning & Anti-Drift Engine (`src-tauri/src/commands.rs`)
- **Native Platform Handles**: Query active monitor handles via `window.current_monitor().unwrap().unwrap()` and calculate exact physical pixels using `scale_factor`.
- **Monitor Offset Normalization**: Window positions are stored as physical offsets `(pos.x - monitor_pos.x, pos.y - monitor_pos.y)` in `TrayPositionState`.
- **Zero-Drift Toggles**: Expanding and collapsing calculates `final_x = monitor_pos.x + offset.x` strictly in `tauri::Position::Physical`, eliminating DPI scale conversion jitter and drift loops across multi-monitor setups.
- **Enforced Screen Blockage**: Strict edge bounds clamped to `[8, monitor_size - window_size - 8]` preventing tray window loss beyond screen boundaries.
- **Mandatory Bottom-Right Start**: Entering desk tray mode from maximized view always resets offsets to start cleanly at the bottom-right of the active display.

### 6. Note Card Multi-Image Bento Grid Preview (`src/components/NoteTile.tsx`)
- **Dynamic Bento Grid**: Replaced single-image with `+1` badge layout with a true adaptive bento grid in the note tile preview:
  - 1 Image: Full-width hero thumbnail.
  - 2 Images: 2-column side-by-side bento layout (`grid grid-cols-2`).
  - 3 Images: Hero preview on left with stacked 2-row preview on right.
  - 4+ Images: 2x2 grid with `+N` overlay on the 4th cell for overflow.

### 8. Pre-State Position Buffering & Async Drift Elimination (`src-tauri/src/main.rs`, `src-tauri/src/commands.rs`, `src/styles/globals.css`, `index.html`)
- **Pre-State Position Lock Architecture**:
  - Implemented `PRE_STATE_BUFFER` (`Mutex<PreStatePositionBuffer>`) storing `pill_physical_pos`, `expanded_physical_pos`, `main_physical_pos`, and `main_physical_size`.
  - In `resize_tray_window`, at the exact millisecond before any size mutation or visibility call occurs, `window.outer_position().unwrap()` captures the absolute physical coordinates and locks them into memory.
  - When expanding or collapsing back out, the window is explicitly forced to the exact pre-locked physical pixels using `Position::Physical(target_pos)`.
- **Async OS Drift Crusher**:
  - Windows emits asynchronous `WindowEvent::Moved` events during `set_size` calls with intermediate / non-final coordinates.
  - Added `lock_window_transition(350)` and `is_window_transitioning()`. All OS move events dispatched during programmatic sizing or repositioning transitions are instantly discarded.
  - Window drag tracking (`track_tray_window_moved`) only records coordinates when the user is actively, intentionally dragging the window with the cursor.
- **Root Focus Ring Suppression**:
  - Added universal `box-shadow: none !important; outline: none !important;` to `*`, `*::before`, `*::after`, and all pseudo-classes (`:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:active`) across `index.html` and `src/styles/globals.css`.
  - Removes all rectangular hover bounding artifacts on the rounded Tray pill and buttons.
- **Developer Layout Tracking Pointers**:
  - Always read from `PRE_STATE_BUFFER` when restoring collapsed/expanded state.
  - Do not recalculate position from dynamic window bounding box offsets mid-transition.
  - Any programmatic window mutation must wrap inside `lock_window_transition`.


### 9. Rich-Text Editor Empty Bullet Breakout & De-indentation (`src/lib/format.tsx`, `src/components/NoteSheet.tsx`, `src/components/TrayCompanion.tsx`)
- **Empty Bullet Line Breakout (Enter)**:
  - Added detection for lines containing markdown bullet prefixes (`- `, `* `, `• `) with zero trailing text.
  - Intercepts Enter via `e.preventDefault()`, preserves block element continuity with `<br>`, and pins the selection range to `offset: 0` on that same line as normal text.
  - Prevents line block deletion and eliminates cursor warping back to the preceding line.
- **Bullet De-indentation Engine (Backspace)**:
  - When Backspace is pressed on an empty bullet line, intercepts deletion via `e.preventDefault()`.
  - Cleanses the bullet prefix characters while maintaining the line container with `<br>`, leaving the cursor focused on that exact line in a normal plain text state instead of merging backward.
- **Unified Keyboard Handler (`handleRichEditorKeyDown`)**:
  - Deployed shared handler across both the full canvas editor (`NoteSheet.tsx`) and the Desk Tray floating companion (`TrayCompanion.tsx`).

### 10. Repository Cleanliness & Workspace Isolation
- **Changelog Ignored**: Added `CHANGELOG.md` to `.gitignore` to preserve local developer tracking without polluting git tracking.
- **Local Commits Only**: All patches committed strictly to branch `v1` with zero remote push operations.

### 11. Native Visual Checkboxes, Unblocked Title Whitespace & Spring Transitions (`src/styles/globals.css`, `src/components/NoteSheet.tsx`, `src/components/TrayCompanion.tsx`, `src/components/NoteTile.tsx`, `src/components/Sidebar.tsx`)
- **Native Checkbox UI Layer in Tasks Mode**:
  - Replaced markdown bullet strings in Tasks view with structured interactive checkbox items (`flex items-center gap-3 w-full py-1 group`).
  - Added dedicated `.check-indicator-layer` class in `globals.css` with explicit `border: 1px solid rgba(255, 255, 255, 0.22);` avoiding earlier universal `box-shadow: none !important;` stripping.
  - Active/completed checkboxes transition into high-contrast marked states (`border-white bg-white text-black`) with flat opacity strike-through (`line-through text-ink-4 opacity-50`).
  - Tasks mode markdown conversion strips leading list markers (`^\s*[-*•]\s+`) cleanly upon conversion.
- **Title Whitespace Unblocking**:
  - Prevented spacebar drops inside title input containers by binding directly to `draft.title ?? ""` rather than stripping spaces via `cleanText()` during controlled render cycles.
  - Added `onKeyDown={(e) => e.stopPropagation()}` on title inputs across `NoteSheet.tsx` and `TrayCompanion.tsx` to prevent parent shortcuts from capturing spacebar events.
- **Sidebar Hardware-Accelerated Smooth Transitions**:
  - Refactored collapsible rail and expanded shelves in `Sidebar.tsx` with smooth transitions (`transition-[width,opacity] duration-300 ease-out will-change-[width,opacity]`).
  - Added cross-fading text and action labels to eliminate layout pops and icon jumping during collapse/expansion.

### 12. Sidebar Text Overlap Purge & Fluid Drawer Slide Transitions (`src/components/Sidebar.tsx`, `src/components/TrayCompanion.tsx`, `src/styles/globals.css`)
- **Strict Sidebar Label Clipping (`Sidebar.tsx`)**:
  - Enforced rigid clipping constraints on all sub-labels (Brand header, New note action, Shelves header, Shelf rows, Settings, Collapse) using `max-w-0 opacity-0 overflow-hidden whitespace-nowrap transition-all duration-300 pointer-events-none` when collapsed.
  - Replaced text initials in collapsed shelf rows with clean, centered `size-2 rounded-full` colored dot indicators, completely eliminating any character bleed (such as the letter 'u' from "uncategorized") below the grid icon.
- **Hardware-Accelerated Drawer Sliding Transitions (`TrayCompanion.tsx`, `globals.css`)**:
  - Replaced abrupt size cutting and vertical jump animations with a fluid mechanical sliding drawer.
  - Applied `.drawer-spring-motion` using hardware-accelerated transforms (`translate-x-full` to `translate-x-0`) with a dampened single-spring curve (`cubic-bezier(0.16, 1, 0.3, 1)` over 300ms).
  - Decoupled window collapse: closing glides the drawer smoothly off-screen with `opacity-0` before triggering the Tauri window resize to the small pill, preventing flickering and layout jumps.

### 13. Framer Motion Hardware-Accelerated Drawer Orchestration (`src/components/TrayCompanion.tsx`, `package.json`)
- **Global Motion Configuration & Single-Spring Tuning**:
  - Integrated `motion` package (`motion/react`) with a root `<MotionConfig transition={{ type: 'spring', bounce: 0, duration: 0.6 }}>` wrapper for unified physics across all animations.
- **Framer Motion Height Morphing & Layout Compositing**:
  - Refactored collapsible container body areas using `<AnimatePresence>` with explicit height animation properties:
    `initial={{ opacity: 0, height: 0 }}`, `animate={{ opacity: 1, height: 'auto' }}`, `exit={{ opacity: 0, height: 0 }}`.
  - Applied the `layout` attribute tag on parent wrappers, enabling GPU-accelerated compositing vectors so that note rows, inputs, headers, and quick-find shelves slide and scale smoothly without layout snapping.
- **Smooth Header Action Toggles**:
  - Configured relative layout modifiers on control icons:
    * Shrink state: `animate={{ scale: drawerOpen ? 0.8 : 1 }}` (or `0.98` for full-width action rows).
    * Rotation cue: `animate={{ rotate: drawerOpen ? 180 : 0 }}` on chevron toggles.

### 14. Native Tauri Window & Frontend Motion Spring Synchronization (`src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/api/tauriBridge.ts`, `src/components/TrayCompanion.tsx`, `src/styles/globals.css`)
- **Real-Time Synchronous Window Resizing**:
  - Implemented `sync_tray_window_height` command in Rust that receives frame-by-frame logical height updates, calculates physical scaling, and adjusts window bounds while anchoring the bottom screen position (`delta_y = cur_size.height - clamped_h`).
  - Added a `ResizeObserver` listener on the root Desk Tray panel element that streams real-time border-box heights to Tauri on every animation frame during spring collapse.
  - Wrapped internal content blocks (category filters, note lists, and action buttons) inside `<motion.div layout>` with template spring configuration:
    `initial={{ opacity: 1, height: 'auto' }}`, `animate={{ opacity: open ? 1 : 0, height: open ? 'auto' : 0 }}`, `transition={{ type: 'spring', bounce: 0, duration: 0.6 }}`.
- **Global Scrollbar Eradication**:
  - Enforced `::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }` and `body { overflow: hidden !important; -ms-overflow-style: none; scrollbar-width: none; }` across `globals.css`.
  - Stripped custom `.scroll::-webkit-scrollbar` width rules to prevent WebView2 from ever rendering clipping lines or scrollbar tracks during window shrinkage.


### 15. Mini Desk Tray UI Core Restoration, Dynamic Window Resize Sync & Permanent Scrollbar Wipeout (`src/components/TrayCompanion.tsx`, `src-tauri/src/commands.rs`, `index.html`, `src/styles/globals.css`)
- **Restored Mini Desk Tray Workspace & Permanent Structural Header**:
  - Unified the floating companion into a single robust chassis with a permanently visible, active header ('DESK TRAY' / 'EDIT NOTE' alongside ↗, —, ✕ toggles).
  - Eliminated the disruptive double-DOM pill switch, replacing it with an explicit low-profile minimized mini tray state.
  - Configured Framer Motion (`motion/react`) to spring-animate only the lower note collection container body:
    `initial={{ opacity: 1, height: 'auto' }}`
    `animate={{ height: isMinimized ? 0 : 'auto', opacity: isMinimized ? 0 : 1 }}`
    `transition={{ type: 'spring', bounce: 0, duration: 0.5 }}`
- **Synchronous Native Tauri Window Resizing**:
  - Continuous `ResizeObserver` on `panelRef` reports real-time DOM heights directly to Tauri's `sync_tray_window_height`.
  - When minimized, the window frame scales fluidly down to match the exact ~48px-56px header chassis without clipping or dead space.
  - Preserved bottom-right anchoring so the minimized header rests cleanly above the taskbar.
- **Universal Scrollbar Elimination & Complete CSS Reset**:
  - Injected universal scrollbar annihilation rules across both `index.html` and `src/styles/globals.css`:
    `* { -ms-overflow-style: none !important; scrollbar-width: none !important; }`
    `*::-webkit-scrollbar, ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }`
    `body, html { overflow: hidden !important; }`
  - Completely purged any WebView2 vertical scrollbars and boundary artifacts during window collapse and expansion.


### 16. Window Resolution Shrinkage Fix, Hard-Coded Pixel Heights & Scale Suppression (`src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/api/tauriBridge.ts`, `src/components/TrayCompanion.tsx`, `src/styles/globals.css`)
- **Banned Internal CSS Scaling & Purged Framer Motion Layout Matrix Projection**:
  - Removed all `layout` properties and dynamic `scale` transitions across `TrayCompanion.tsx`. Framer Motion's `layout` projection was computing transform matrix scale reductions (down to `scale(0.1)`), causing elements to render as tiny microscopic slivers.
  - Enforced strict 100% literal rendering size (`scale-100`, `zoom: 1 !important; transform: none !important;`) across all text nodes, buttons, inputs, and container divs in `globals.css` and `TrayCompanion.tsx`.
- **Hard-Coded Native Window Dimensions & Dedicated Tauri Minimize Command**:
  - Replaced continuous `ResizeObserver` animation loops with an explicit, single-shot Tauri command: `set_tray_minimized`.
  - Pass explicit hard-coded physical pixel height arguments directly to Tauri Rust handlers:
    * Expanded State: Exactly 520px logical height, 380px logical width.
    * Minimized State (Small Tile View): Exactly 52px logical height, 380px logical width (tightly wrapping only the header bar).
  - Maintained bottom-right coordinate anchoring (`cur_pos.y + delta_y`) so the minimized chassis rests cleanly in position.
- **Decoupled Top Bar Window Controls (Eliminated Crash & Conflict Loops)**:
  - Header actions now trigger isolated, asynchronous-safe Tauri visibility calls without triggering intermediate animation loops:
    * `✕` Close: Directly calls `getCurrentWindow().hide()`.
    * `↗` Canvas Mode: Directly calls `tauriApi.openCanvasMode()`.
    * `—` Minimize / Restore: Directly toggles `set_tray_minimized`.


### 17. Dynamic 2D Width/Height Spring Morphing & Real-Time Tauri Bounds Lifecycle (`src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/api/tauriBridge.ts`, `src/components/TrayCompanion.tsx`)
- **Shrunk Collapsed Bar Footprint & 2D Spring Expansion**:
  - Refactored the floating companion container to morph dynamically across both horizontal and vertical axes simultaneously using Framer Motion:
    * Expanded State: `width: 380px`, `height: 480px`.
    * Collapsed State (Dense Dashboard Pill): `width: 180px`, `height: 44px`.
    * Spring parameters: `transition={{ type: 'spring', bounce: 0, duration: 0.6 }}`.
  - Collapsed pill layout optimized to cleanly fit Mark icon, "DESK TRAY" label, and control buttons without text truncation, clipping, or horizontal bloat.
  - Lower note collections smoothly cross-fade via `<AnimatePresence>` during the two-dimensional expansion, preserving 100% scale typography.
- **Continuous Real-Time Window Frame Tracking**:
  - Implemented `sync_tray_window_bounds` in Tauri Rust to continuously adjust both physical width and height frame-by-frame.
  - Linked `onUpdate={(latest) => tauriApi.syncTrayWindowBounds(latest.width, latest.height)}` on the root motion container to stream spring interpolation coordinates to Tauri on every single frame.
  - Anchored physical coordinates simultaneously on `delta_x` and `delta_y`, locking the bottom-right corner while top and left boundaries morph fluidly with zero margin bleed, white lines, or clipping.


### 18. Window Transition Frame-Rate Optimization (60 FPS), Control Dashboard Streamlining & Logo Calibration (`src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/api/tauriBridge.ts`, `src/components/TrayCompanion.tsx`)
- **60 FPS Hardware-Accelerated Viewport Morphing**:
  - Eliminated high-frequency IPC bridge calls (`syncTrayWindowBounds` frame loops) that previously forced Win32/DWM repaints at 30 FPS.
  - Implemented `snap_tray_window` in Rust:
    * When expanding: Instantly snaps outer native window frame to `380x480` so that visual spring expansion occurs fluidly inside the allocated transparent viewport with zero repaint bottlenecks.
    * When collapsing: Fluidly shrinks visual container from `380x480` down to `180x44` at 60 FPS, then snaps outer window frame to `180x44` on animation completion (`onAnimationComplete`).
- **Purged Redundant Minus ('—') Button**:
  - Removed the minimization ('—') button from the top bar right-side control dashboard since direct clicks anywhere on the bar manage state toggles cleanly.
  - Right-side dashboard now cleanly presents only Canvas (`↗`, when expanded) and Close (`✕`).
- **Vertical Re-Centering of Left Brand Assets**:
  - Encapsulated Mark logo within a rigid `size-3.5` centered container.
  - Aligned 'DESK TRAY' text with `leading-none flex items-center text-[9.5px]` to remove font line-height descent bias, achieving exact vertical centering across the 24px header row.


### 19. Launch Window State Persistence Engine, Tray Text Reflow Locking & Residual Collapse Blink Elimination (`src-tauri/src/models.rs`, `src-tauri/src/storage.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src/components/TrayCompanion.tsx`)
- **Launch Window State Persistence Engine**:
  - Extended `AppSettings` in `src-tauri/src/models.rs` with `#[serde(default)] pub is_maximized: bool` for seamless backwards-compatible storage in `settings.json`.
  - Added `get_is_maximized` and `set_is_maximized` methods to `StorageManager` in `src-tauri/src/storage.rs` to persist the maximization boolean to disk whenever altered.
  - Synchronized window state writing across all lifecycle boundaries:
    * `tauri::WindowEvent::Resized` and `CloseRequested` events on the `main` window.
    * Tray companion switch (`open_tray_mode`), window minimization (`toggle_window_minimize`), and application exit (`quit_app`).
  - Added initialization check in `.setup()` hook: reads `is_maximized` from disk and immediately invokes `main_win.maximize()` on launch if previously maximized, or preserves default un-maximized dimensions.
- **Tray Typography Whitespace Locking (Reflow Elimination)**:
  - Implemented strict single-line text constraints (`whitespace-nowrap overflow-hidden text-ellipsis truncate`) across all typography nodes in `TrayCompanion.tsx`:
    * Brand header label ("DESK TRAY" / "EDIT NOTE") and navigation back action button.
    * "New note" action row and its ⌘N keyboard badge.
    * Note search input and category filter toggle badge ("FIND").
    * Category filter drawer pills and tag indicators.
    * Recent note list rows (note titles, shelf category badges, and relative timestamp labels).
    * Bottom action footer buttons ("Minimize" and "Canvas").
  - Permanently anchors all text and iconography along single linear horizontal axes during dynamic spring width interpolation, eliminating jittery vertical wrapping.
- **Residual Collapse Blink Elimination & Win32 Atomic Window Resizing**:
  - Implemented `set_window_bounds_atomic` using native Win32 `SetWindowPos` (`SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER`) in `src-tauri/src/commands.rs`.
  - Replaced disjoint two-step `set_size` and `set_position` sequences with single atomic OS window boundary updates, preventing 1-frame reposition tears when snapping to 180x44.
  - Synchronized Framer Motion exit animation (`duration: 0.15, ease: 'easeOut'`) for lower shelf and note contents so interior elements settle completely before the outer native window frame shrinks.


### 20. Absolute Webview Transparency, Opening Flash Elimination & Closing Blink Lifecycle Synchronization (`index.html`, `src/styles/globals.css`, `src/main.tsx`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src/components/TrayCompanion.tsx`)
- **Purged Opening Flash & Enforced Absolute Webview Transparency**:
  - Enforced `background: transparent !important; background-color: transparent !important;` across `html`, `body`, and `#root` in `index.html` inline styles and `src/styles/globals.css`.
  - Removed `<meta name="color-scheme" content="dark" />` from `index.html` to prevent Chromium/WebView2 from applying its default `#121212` canvas background prior to component rendering.
  - Injected runtime zero-fill style assertions on `document.documentElement`, `document.body`, and `#root` inside `src/main.tsx`.
  - Enforced `window.set_decorations(false)` and `window.set_shadow(false)` inside `.setup()` in `src-tauri/src/lib.rs` and coordinated via `src-tauri/src/main.rs`.
  - Dynamically modulated `boxShadow` on the root motion container to prevent high-radius shadow blur clouds from bleeding outside the pill perimeter during expansion.
- **Squashed Closing Blink via `onAnimationComplete` Timing Hooks**:
  - Refactored frontend minimize and close routines: click handlers strictly manage reactive state (`isMinimized`, `isClosing`) and never prematurely invoke native window shrink or hide commands.
  - Lower note collections cleanly drop opacity to 0 via `<AnimatePresence>` (`duration: 0.15, ease: 'easeOut'`) and unmount smoothly before outer panel spring completes.
  - Bound `tauriApi.snapTrayWindow(180, 44)` strictly to Framer Motion's `<motion.div onAnimationComplete={(definition) => ...}>`:
    * Filtered out bubbling child exit animation completions (such as `opacity: 0`).
    * Verified that physical dimensions settled at target small bar metrics (`width <= 185px`, `height <= 50px`) prior to executing atomic Win32 `SetWindowPos` snap.
  - Integrated `isClosing` lifecycle for hide action (✕) to animate container opacity to 0 smoothly before invoking `getCurrentWindow().hide()`, completely eradicating closing blink loops.

## [2026-10-31] - Desk Tray Expand/Collapse Flash Fix
- **src/components/TrayCompanion.tsx**
  - Removed native `snapTrayWindow` from the click handler and `set-expanded` listener.
  - Added `panelExpanded` state: on open, an effect snaps the native window to 380x480 first, then releases the spring (content stays hidden until then).
  - On close, the spring collapses first; `onAnimationComplete` crops the native window to 180x44 once settled.
  - Content mounts only when `panelExpanded`; panel root enforces `whitespace-nowrap` (editor uses `whitespace-pre-wrap`).
- **Transparency audit**: `tauri.conf.json` (`transparent: true`), `lib.rs`, `index.html` and `globals.css` already enforce transparent root/body; no change needed.


## [2026-10-31] - Desk Tray Squash & End-of-Close Blink
- **src/components/TrayCompanion.tsx**
  - Removed outer drop shadows (`shadow-2xl` + animated `boxShadow`): they spilled past the native window bounds and were cropped/popped when the window resized (blink at close end / open start). Only the inset ring remains.
  - Lower content now has a fixed 358x434 layout box, so text no longer reflows/squashes while the panel springs; the panel clips it. Content fade-in delayed 60ms.

## [2026-10-31] - Desk Tray Visibility Freeze (teleport + close blink)
- **src/components/TrayCompanion.tsx** (sizing stays in `commands.rs::snap_tray_window`; no `main.rs` change needed)
  - Added `veil` state: panel goes opacity 0 instantly on open click; native window is only resized while invisible.
  - Open: veil -> `snapTrayWindow(380,480)` -> 40ms layout buffer -> lift veil (100ms fade) + spring.
  - Close: panel + content fade to 0 (150ms) -> instant swap to pill size -> `snapTrayWindow(180,44)` -> 40ms buffer -> fade pill in.
  - Removed the spring-settle `onAnimationComplete` shrink; it now only handles hide-to-tray. Panel is `visibility:hidden` while opening and non-interactive while veiled.
  - Guarded `set-expanded` events against redundant state (prevents stuck veil).

## [2026-10-31] - Desk Tray Simplification (static window + opacity fade) & Title Space Fix
- **src/components/TrayCompanion.tsx**: removed spring width/height morph, veil/layout-buffer pipeline and pill mode. Panel is a static 380x480 box; open = `opacity 0->1` (`transition-opacity duration-200 ease-out`), close = fade to 0 then `getCurrentWindow().hide()` on `transitionend` (260ms fallback). No native resizing during transitions.
- **src-tauri/tauri.conf.json**: tray window now 380x480.
- **src-tauri/src/commands.rs**: `set_tray_minimized` no longer resizes (emits only); `open_canvas_mode` emits `set-expanded=false` before hiding tray so it reopens at opacity 0.
- **Title spacebar bug** (src/hooks/useWorkspace.ts): root cause was the backend `note-saved` echo (`upsert_note` trims title via `clean_yaml_scalar`) overwriting local state after the 320ms debounce. Echo no longer replaces a title that differs only by surrounding whitespace; trimming now only happens on write.

## [2026-10-31] - Mini Floating Pill + List-Mode Duplicate Text Fix
- **Pill window**: new static 180x44 transparent `pill` window (`tauri.conf.json`, capability, `src/components/TrayPill.tsx`, routed in `main.tsx`). Closing the tray (✕/Minimize/Esc/Ctrl+J/top-bar tap) fades out then `collapse_tray_to_pill` hides the tray and shows the pill at the tray's bottom-right. Click pill -> `expand_tray_from_pill` opens the tray anchored to the pill's bottom-right; drag (>4px) moves the pill. No window is ever resized.
- **commands.rs / lib.rs**: added both commands; `open_tray_mode`/`open_canvas_mode` hide the pill.
- **List-mode bug** (`TrayCompanion.tsx`): React reused the same `div` for the contenteditable editor and the task list, so the editor's manually injected HTML stayed and duplicated as large text above the checklist. Added distinct `key`s (`rich-editor` / `task-list`).

## [2026-10-31] - Undo/Redo, Pill Persistence, List Conversion & Round-trip Formatting
- **Undo/redo** (`src/hooks/useUndoStack.ts`, `TrayCompanion.tsx`, `NoteSheet.tsx`): title and body now have separate history stacks (typing bursts coalesce, 600ms). Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z act on the focused field only (`data-undo="title|body"`), covering text edits and text<->list conversion.
- **Pill persisting after Maximize**: `set-expanded=false` from Rust (canvas opened) made the tray's fade-out call `collapse_tray_to_pill`. Added a suppress flag in the tray and a guard in `collapse_tray_to_pill` (hides tray+pill when the main window is visible).
- **Merged lines / extra empty lines** (`src/lib/format.tsx`): `htmlToMarkdown` rewritten as a line-based walker. Root cause: nested `<div>` text was concatenated onto the previous line (`- a- b`), and `<div><br></div>` produced two newlines. Block elements now always start a new line, trailing placeholder `<br>` ignored, NBSP normalised.
- **Text<->list conversion**: new `convertContentMode` (1 non-empty line -> 1 item, blank lines dropped, bullet prefixes stripped); reads the live editor DOM first. Used by tray and canvas.
- **Restart reformatting** (`src-tauri/src/models.rs`): new `parse_todo_line` handles bare `- [ ]` (empty checklist items were reloaded as text "- [ ]"); blank lines in text notes are preserved instead of dropped (checklist notes still skip them).

## [2026-10-31] - Rich/Wrapping Checklist Lines, Text Wrapping & Folder Cleanup
- **Raw stars in list mode**: checklist lines were plain `<input>`s showing `**bold**`/`***bold italic***` literally. New `src/components/TaskLineInput.tsx` (contenteditable) renders markdown as real bold/italic and writes it back as markdown; used in tray and canvas sheet. Toolbar Bold/Italic now works on focused task lines. Added `inlineMarkdownToHtml` in `src/lib/format.tsx`.
- **Wrapping**: task lines wrap inside their own checkbox (`whitespace-pre-wrap break-words`, checkbox top-aligned) instead of scrolling right; canvas text editor also gets `whitespace-pre-wrap break-words` (tray editor already had it).
- **Installer targets**: `tauri.conf.json` bundle targets `"all"` -> `["nsis"]` (no more MSI/WiX).
- **Cleanup**: removed `DoIT-Setup.msi`, `DoIT-Portable.zip`, root `WebView2Loader.dll` (verified the exe launches without it), `.build.log`, `.preview/`, `src/.openclaw-write-probe`, `src-tauri/target/{debug,flycheck0}`, release `wix/` and `bundle/msi`. Root now ships exactly `doit.exe` + `DoIT-Setup.exe` (fresh build).

## [2026-10-31] - Branding
- Tray top bar and pill label now read **DoIT** (was DESK TRAY), centered in the pill; rebuilt `doit.exe` + `DoIT-Setup.exe`.

## [2026-10-31] - Bullet Memory, Category Rename, Image Preview Click-Out
- **Bullet memory** (`src/lib/format.tsx`): `convertContentMode` now remembers each line's stripped bullet prefix per note (localStorage `doit.bullets.<noteId>`, keyed by line id) and restores it on list -> text. Survives app restarts.
- **Rename category**: right-click a category in the sidebar or a shelf header -> `CategoryMenu` (Rename / Delete) with a rename dialog (Enter saves, Esc cancels, duplicate/empty names rejected). Backend `StorageManager::rename_category` + `rename_category` command re-files every note in it and emits `note-saved` / `categories-changed` so the tray stays in sync. Active filter and collapsed state follow the new name. Uncategorized is protected.
- **Image preview**: clicking the dark area outside the image (tray + canvas) now closes it; dragging/panning does not.

## [2026-10-31] - Pasted multi-line text collapsing
- `htmlToMarkdown` (`src/lib/format.tsx`): the editors are `white-space: pre-wrap`, so pasted text arrives as text nodes containing `\n`; my earlier rewrite collapsed those to spaces, merging pasted lines into one. Newlines inside text nodes are now real line breaks.

## [2026-10-31] - V2 Core: Universal Markdown, Right-Side Editor, Updater, Tray Stabilization
**Schema (V2)**: `NoteItem.format` (`"md"` default | `"txt"`). `.md` files keep DoIT frontmatter (`app: "DoIT"`) when saved, but it is no longer required to load; `.txt` files are stored as plain text (category/title recovered from `Category - Title - date - n.txt` names).
- **Updater**: endpoint fixed to `https://raw.githubusercontent.com/Yasliu/DoIT/main/update.json` (old value pointed at `yasin-islam`); removed v1-only keys (`active`, `dialog`) from `plugins.updater`. Boot check (`App.tsx`) skips when offline, uses `check({timeout: 3000})` + a 3s race, and swallows every failure silently; never blocks notes load. NOTE: `update.json` does not exist in the repo yet, so checks currently 404 (silently).
- **Universal ingestion** (`models.rs`, `storage.rs`): `NoteItem::from_file` / `parse_generic_document` accept any `.md`/`.txt` (boot index, single import, folder scan); frontmatter optional, title from frontmatter -> filename -> first `# heading` -> file stem; stable id from filename hash; file mtime used as last_edited; invalid UTF-8 repaired lossily. Tasks only become a checklist when EVERY line is a task.
- **Defensive AST pass**: `sanitize_markdown_body` (pulldown-cmark 0.12) wraps corrupt/control-character bodies in a fenced monospace block and closes unterminated code fences. The editor renders fenced blocks as isolated monospace blocks (`.md-code`). (Implemented in `models.rs`; `main.rs` only boots `run()`.)
- **TXT**: listed like any note; footer + tray show **Convert to Markdown**, which flips `format` to `md` -> save rewrites as `.md` with frontmatter and deletes the `.txt`.
- **Editor shortcuts** (`format.tsx`): Ctrl+1/2/3 headings (toggle), Ctrl+T inserts a table, Tab walks table cells and appends a new row from the last cell, Shift+Tab goes back; Ctrl+B/I unchanged. Headings/tables/code get live classes (`refreshBlockClasses`).
- **Inline images**: `![alt](path)` renders inline in the editor via Tauri asset protocol (`protocol-asset` feature + `assetProtocol` scope: HOME, DOCUMENT, DESKTOP, DOWNLOAD, PICTURE, APPDATA); round-trips back to markdown. Existing attached-image cards are untouched.
- **Right-side drawer** (`NoteSheet.tsx`, `App.tsx`): centered modal + scrim removed. Editor is a drawer sliding from the right edge (`transform 300ms cubic-bezier(0.16,1,0.3,1)`), dashboard reflows/stays interactive, switching notes does not replay the slide, Escape/X slides it out. Focus trap removed (non-modal). Closing no longer prunes blank lines between paragraphs.
- **Tray**: window created hidden + pill hidden at setup; tray locked to 380x480 logical (min = max); expand/collapse use scale-computed absolute pixel sizes instead of a hidden window's reported size. Tray editor shares the same markdown renderer (single column, wraps).

## [2026-10-31] - V2 Fix: Rendered Markdown Editor, Visual Toolbar, Legacy Frontmatter Purge
**Parser / renderer** (`src/lib/format.tsx`) - the editor no longer shows markdown markers:
- Block parser: `# ..######` headings, `-`/`*`/bullet lists, `>` quotes (marker kept invisibly in `data-p`, restored on save), `---` rules (`<hr>`), fenced code (`<pre class="md-pre">`, plaintext-only island), and pipe tables rendered as real `<table>` (editable `th`/`td` cells, alignment kept from `:---:` separators, `\|` escaped). Cells accept inline bold/italic.
- Live conversion while typing (`normalizeEditor`): `# `, `- `, `> ` become real lines; a typed header row + `|---|---|` becomes a table. Multi-line paste is re-parsed as markdown (`handleMarkdownPaste`).
- Keys: Enter leaves empty bullet/quote and exits headings; Backspace at line start strips the prefix; in tables Tab/Shift+Tab/Enter move cells and the last cell appends a row.
- Images: `![alt](url|C:\abs\path|relative)` render inline as rounded frames; relative paths resolve against the storage folder (`setMarkdownBaseDir`) via the Tauri asset protocol.
- Verified in jsdom: markdown -> DOM -> markdown round-trips headings, lists, quotes, tables, code, rules and images (only table separators normalise to `| --- |`).
- Note: rendering is a custom block parser over the editable surface (a read-only React tree cannot be edited); `pulldown-cmark` still guards imported files in the Rust layer.
**Toolbar** (`NoteSheet.tsx`, `TrayCompanion.tsx`): new monochrome Lucide buttons `Heading1/2/3` (toggle heading on caret line), `Table` (inserts the `| Header | Header |` / `|---|---|` / `|  |  |` blueprint at the caret as a real table), `ListChecks` (switches to checklist if needed and appends a new empty task row). Heading/table buttons disable in checklist mode.
**Table styling** (`globals.css`): `1px solid white/10` cell borders, header `bg white/[0.02]` + semibold white, cell padding `6px 12px` (`py-1.5 px-3`), focused-cell highlight, rounded scroll-x wrapper.
**Legacy frontmatter purge**: `app: "DoIT"` and `version:` are no longer written (`to_markdown`) or required; the strict validator (`parse_and_validate_doit_markdown`) and its tests are deleted - one lenient `parse_generic_document` reads optional keys (id, category, title, order, type, media, flags). Settings panel signature box and "validate / non-DoIT" copy removed; scan toasts reworded; stale comments/README updated.

## [2026-10-31] - V2 Stabilization: Unified Mixed-Mode Document, Table Columns, Header Dropdown, Shortcuts, Drawer Easing
**Unified document** (`format.tsx`, `NoteSheet.tsx`, `TrayCompanion.tsx`, `models.rs`)
- Removed the TEXT/TASKS mode switch, the checklist list view, `TaskLineInput.tsx`, bullet-memory/`convertContentMode`, and the duplicate task-row button. A note body is now ONE markdown canvas: text, headings, tables and `- [ ]` tasks can sit anywhere together.
- `- [ ]` / `- [x]` lines render as real checkboxes mid-paragraph (typed `- [ ] ` or `[ ] ` inside a bullet converts live). Clicking a box rewrites only that line's `[ ]`<->`[x]`; Enter continues the task list, Enter on an empty task / Backspace at line start leaves it. One toolbar `ListChecks` button toggles the caret line into a task.
- Storage: `contentToMarkdown` / `markdownToContent` map lines <-> items (task lines stay `is_todo` items so cards/progress still work). Rust parser: tasks recognised per line, `type:` key no longer written or forcing all lines into tasks (legacy `type: checkbox` ignored). New mixed round-trip test.
- Note cards: `previewLine` (`text.ts`) strips heading hashes, quote/bullet markers, table pipes/separators, fences, rules and image syntax; task rows keep their checkbox.
**Tables**: Tab on the last header cell appends a column to every row (new header `Header`, empty cells); Tab on the final cell still appends a row; `Ctrl+Alt+Right` = add column, `Ctrl+Alt+Down` = add row. Table wrapper is an isolated scroller (`w-full overflow-x-auto`, thin 6px transparent-track scrollbar, `width:max-content; min-width:100%`, cells 7em-28em) so wide tables never shift the drawer or the single-column tray.
**Toolbar**: H1/H2/H3 buttons replaced by one themed dropdown (`HeadingSelect`: Normal Text / Heading 1-3, label follows the caret line) in both canvas editor and tray.
**Shortcuts** (`shortcuts.ts`, `SettingsPanel.tsx`, `models.rs`): new settings keys `hotkey_h1/h2/h3/bold/italic/table` (defaults Ctrl+1/2/3/B/I/T). Settings now shows a "Markdown editor" group with record-a-combo fields (modifier required, Backspace = default); the editors bind to the saved combos (loaded on startup, saved/reset in Settings; tray picks them up on next launch).
**Drawer**: slide uses `transform 500ms cubic-bezier(0.16,1,0.3,1)` for both entry and exit (dashboard reserve width eases at the same duration), `will-change: transform` while moving, unmount delayed to 520ms.
**Build fix**: the previous cleanup deleted `WebView2Loader.dll`; this toolchain (gnullvm) links it dynamically, so `doit.exe` failed to start (my earlier "launch ok" check was wrong - the error dialog kept the process alive). Restored the DLL next to `doit.exe` in the project root and the local NSIS installer now bundles it (built with a local-only `--config` resource override, repo config untouched so the MSVC CI build is unaffected). Verified: no error dialog, loader module loaded, WebView2 processes spawned.

## [2026-10-31] - Re-architecture: OS File Associations, In-Place External Saves, MD/Text Mode, UI Fixes
**File associations & launch args** (`tauri.conf.json`, `lib.rs`, `commands.rs`, `storage.rs`, `models.rs`)
- `bundle.fileAssociations`: `.md` (Markdown Document) and `.txt` (Text Document), role Editor. The NSIS installer registers "Open with DoIT" for both (verified in the generated installer script).
- Startup args are parsed in `run()` (called from `main.rs`) via `file_from_args`; the path waits in managed state `LaunchFile` and the frontend pulls it with `take_launch_file` once its listener is ready. `tauri-plugin-single-instance` (registered first) forwards a second launch's file to the running instance (`open-external-file` event; canvas is restored if the app was in tray mode). Verified: a second launch exits immediately.
- `open_external_file` reads the file in place (no copy; invalid UTF-8 repaired; a file that is already a repository note opens as that native note). New `NoteItem.source_path` / `external_header` (original YAML frontmatter is preserved verbatim).
**Conditional save**
- Native notes: unchanged silent autosave, no Save button. External notes (`source_path` set): autosave, close-commit and category/delete controls are off (`upsert_note` also hard-refuses to copy them); a prominent **Save** button (also Ctrl+S) with an Unsaved marker writes atomically back to that exact path via `save_external_file`. Closing with unsaved changes asks to discard.
**MD Mode / Text Mode** (`ModeToggle.tsx`, `RawEditor.tsx`, sheet + tray)
- MD Mode = rendered markdown (`format: md`); Text Mode = raw monospace source, markers visible (`# Title`, `| Header |`), toolbar formatting hidden (`format: txt`). Toggling flips the extension: native notes are re-filed `.md` <-> `.txt` by the existing storage rename; external files are renamed in place on Save (refuses if the target exists). The old "Convert to Markdown" button is gone. Note: converting to `.txt` drops frontmatter-only metadata (attached images, fonts).
**Fixes**
- Drawer: entry and exit are now plain `transform 300ms ease-out` (no custom overshoot curves); dashboard reserve width uses the same 300ms ease-out; unmount at 320ms.
- Table right-click menu (`TableMenu.tsx`): + Add Column, + Add Row (below the clicked row), Delete Row (header protected); works in the sheet and the single-column tray, writes back through the normal serialiser.
- Empty task rows: checkbox is now absolutely positioned and the line has a fixed 25px left text offset, so the caret always sits 10px clear of the ring.
- Card previews (`previewLine`): every `|`, standalone dash/colon alignment tokens and separator rows are stripped from snippets, leaving only the cell words.
- Untouched: tray geometry/position memory, pill logic and the fade-only tray transitions.

## [2026-10-31] - Real-Rendering Card Previews, Soft Drawer Entry, Release/Updater Pipeline
**Card previews** (`NoteTile.tsx`, `format.tsx::previewMarkup`, `globals.css`): tiles now show the note exactly as it looks when opened. MD notes render the same block markup as the editor (styled headings, bullets, quotes, tables, code, inline images, task checkboxes) read-only and clamped to the card size with a soft fade only when content overflows; Text-Mode (.txt) notes show the raw file in monospace as-is. Preview checkboxes still toggle (Nth rendered box -> matching task item; fenced "tasks" are ignored). Editable flags are stripped so nothing in a card is focusable.
**Drawer entry**: root cause of the harsh slide-in was `focus()` on the off-canvas panel, which made the browser scroll the clipped chassis sideways, plus the dashboard width easing starting a frame before the panel. Fixes: `focus({ preventScroll: true })`, dashboard reserve now starts on the same frame as the slide (`onOpening`), entry = 460ms `cubic-bezier(0.32,0.72,0,1)` + 240ms fade; exit untouched (300ms ease-out).
**Updater / releases**
- UI: replaced the full-screen modal with a non-blocking themed card (bottom-right) with real download progress (`downloadAndInstall` events), "Later" / "Update now"; checks on startup (offline-safe, 3s cap) and every 6h.
- Config: endpoint `https://github.com/Yasliu/DoIT/releases/latest/download/latest.json`, `windows.installMode: passive`, `bundle.createUpdaterArtifacts: true`, **new signing key pair** (public key in `tauri.conf.json`; private key at `%USERPROFILE%\.tauri\doit-updater.key`, no password). Workflow now passes `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` and `includeUpdaterJson`, so tauri-action uploads the signed installer + `latest.json`. Local build verified: produces `DoIT_1.1.0_x64-setup.exe` + `.sig`.
- Version bumped 0.1.0 -> 1.1.0 (tauri.conf, Cargo.toml, package.json): the updater only offers builds whose version is higher than the installed one.
- Note: Tauri updates by downloading the full signed installer (it has no binary-delta mode); it runs in the background with progress and a passive installer.

## [2026-10-31] - Performance: one live webview, WebView2 footprint 251 MB -> 73-97 MB
**Measured (Win32 "private working set" of the WebView2 tree, same machine, 9-10s after each step):**
| state | before | after |
|---|---|---|
| canvas open | 8 processes / 251 MB | 5 processes / 97 MB |
| tray mode | 8 processes / 227 MB | 5 processes / 73 MB |
| tray -> canvas again | 8 processes / 254 MB | 5 processes / 100 MB |
**Window lifecycle** (`commands.rs`, `lib.rs`, `tauri.conf.json`)
- Startup creates ONLY `main` (the always-hidden `tray` and `pill` webviews are gone: 3 renderers -> 1).
- Tray mode creates a single `tray` frame on demand. Panel (380x480) and floating bar (180x44) are the SAME frame: `set_tray_mode` mutates it with native bounds, bottom-right anchored and screen-clamped; the page hides its content (blank transparent) while the frame resizes, then fades the new shape in. Verified with real Esc / click: 475x600 <-> 225x55 px at 125% DPI, same corner. Separate `pill` window, `TrayPill` route and `collapse/expand_tray_from_pill` removed.
- Entering tray mode: frontend gets `flush-pending` (debounced saves written), then the canvas window is **destroyed** (renderer + layout tree freed). Leaving tray mode rebuilds it from the window config, restores the saved size/position/maximize state, reveals it on `canvas_ready` (3s failsafe) and destroys the tray frame. It is skipped while an external file has unsaved edits (`set_external_dirty`). A file launched while the canvas is gone is parked in `LaunchFile` and opened on mount.
**Memory hooks**
- `--in-process-gpu` (removes the separate GPU process: ~100-130 MB), `--js-flags=--expose-gc`, `--disable-background-networking`, `--disk-cache-size=8388608` in `additionalBrowserArgs` (config + builder share the exact same string so WebView2 keeps ONE browser/GPU tree). Data folder stays the per-app isolated `%LOCALAPPDATA%\com.doit.desktop\EBWebView`.
- `flush_webview_memory` (calls `window.gc()` before a window goes idle) and `set_webview_memory_level` (WebView2 `ICoreWebView2_19::MemoryUsageTargetLevel` LOW while the tray is the floating bar, NORMAL when it is the panel).
**Frontend bundle**: removed the `motion` dependency (tray cross-fades are now CSS), stripped all app `console.*` calls, vite build: no sourcemaps, no modulepreload polyfill, minified CSS. JS 511 kB -> 402 kB. (Next.js is not used; this is Vite + Tailwind.)
**Tables**: right-click menu gained **Delete Column** (disabled for a table's last column; alignment markers are kept in sync) next to Add Column / Add Row / Delete Row.
Note: `--disable-gpu` would reach ~95 MB too but forces software compositing of the transparent/blurred UI; `--in-process-gpu` keeps hardware acceleration at ~97 MB.

## [2026-10-31] - v1.1.1
- **Task shortcut**: new configurable `Ctrl+L` (turns the caret line into a `- [ ]` task / back to text) listed in Settings; typing `[] ` or `[ ] ` at the start of a line also creates a task live. Verified by script.
- **Settings shortcut fields**: replaced the clipped text boxes with key-cap fields (`ShortcutField`); arrow keys show as theme-matched Lucide arrow icons. "Table keys (fixed)" is now a line-per-item list.
- **Desk tray panel**: 380x480 -> 440x620 logical (clamped to 90% width / 88% height of the monitor). First-open shrink fixed: the frame is created on one monitor then moved, so Windows could rescale it by the DPI ratio; `tray_ready` now re-applies the exact geometry once the frame sits on its final monitor.
- **Image viewer lag**: new isolated `ImageLightbox`: pan/zoom live in refs and are written to the image transform inside requestAnimationFrame (no React re-render of the editor tree), wheel zoom is cursor-anchored and non-passive, backdrop blur removed. Esc closes only the viewer.
- **Release**: version 1.1.1 (tauri.conf, Cargo.toml, package.json); tags v1.0.0 / v1.1.0 removed, only v1.1.1 remains.

## [2026-10-31] - Updater diagnostics (not released yet)
- Diagnosis of "v1.1.0 does not see v1.1.1": endpoint, manifest (`"version": "1.1.1"`, no `v` prefix), asset URLs and the Ed25519/BLAKE2b signature all valid; a dev run with the app version forced to 1.1.0 found v1.1.1 in 1.3s and downloaded + signature-verified it. Root cause: GitHub's release CDN intermittently needs 10-12s for the TLS handshake (measured 142ms-12.5s), the shipped v1.1.0 check had a hard 3s cap, ran once at startup and then not for 6h.
- Fix (ships with the next release): `App.tsx` retries with growing patience (15s, then 30s attempts after 25s / 2min / 10min) before falling back to the 6h interval; Settings -> "App updates" shows the running version and a "Check for updates" button (toasts "latest version" / "could not reach server").

## [Section 21] - Engine Overhaul: Dropdowns, 50-Step Undo/Redo, Ingestion Portal, Docking Mode, Lifecycle Guardrails & Fault-Tolerant Custom Fonts
- **Dropdown Component Corrections & Immediate Selection**:
  - Fixed event handling and backdrop collision in `HeadingSelect.tsx`, `NoteSheet.tsx`, and `TrayCompanion.tsx`.
  - Replaced blocking `onMouseDown` preventions on dropdown menu items with clean propagation isolation (`stopPropagation`), preventing backdrop click swallowing.
  - Implemented caret range snapshotting (`savedRangeRef`) that preserves and restores exact selection ranges inside the editor before applying text level styles (`applyHeading`).
  - Font family selections and text level selections now trigger immediate commits (`immediate = true`) to active note targets without debounce latency.
- **Deep 50-Step Undo/Redo Engine (`useUndoStack.ts`)**:
  - Expanded undo history buffer stack depth to 50 distinct structural state mutations (`MAX_DEPTH = 50`).
  - Eliminated the 600ms coalesce freeze, replacing it with responsive snapshot detection triggered by word boundaries, spaces, punctuation (`[ .,;:!?'"()[\]{}\-–—]`), line additions/removals, and typing pauses (`>= 300ms`).
  - Added undo keyboard shortcut delegation on title input fields in both `NoteSheet.tsx` and `TrayCompanion.tsx`, resolving previous event propagation locks and ensuring `Ctrl+Z`, `Ctrl+Shift+Z`, and `Ctrl+Y` flow fluidly across title and body editors.
- **Main Dashboard Ingestion Portal Relocation**:
  - Removed "Open / Ingest File" and "Scan & Import Custom Folder" from the hidden Settings drawer panel (`SettingsPanel.tsx`).
  - Promoted both utilities directly onto the prominent left-side main dashboard rail (`Sidebar.tsx`) with dedicated actions in both expanded (text labels + icons) and collapsed (compact icon-only buttons with tooltips) sidebar states.
  - Wired directly to `workspace.importNoteFile()` and `workspace.pickAndScan()`.
- **Destructive Action Warn Block**:
  - Intercepted the note Delete (trashcan) action button in `NoteSheet.tsx` and `TrayCompanion.tsx`.
  - Replaced instant data purge with a clean, theme-matched confirmation popover modal ("Are you sure you want to delete this note? This action cannot be undone.") providing explicit "Cancel" and "Confirm Delete" actions.
- **Docking Mode Rebranding & Window Lifecycle Parameter**:
  - Rebranded all software references, title bar labels, system tray menu items, widget titles, and tooltip text tracking "Desk Tray Mode" over to "Docking Mode".
  - Introduced explicit boolean setting in `AppSettings` (Rust backend & TypeScript bridge): `dock_on_close` (default: `true`).
  - Added user toggle switch in Settings -> "Window Lifecycle & Docking Mode".
  - When enabled (`dock_on_close == true`): tapping window close (✕) smoothly collapses the application into its compact floating bar dock.
  - When disabled (`dock_on_close == false`): tapping window close (✕) terminates the native Rust application process (`app.exit(0)`) and shuts down the runtime environment instantly.
- **Fault-Tolerant Custom Font Preview Engine**:
  - Integrated custom font family declaration input within font dropdown popovers in `NoteSheet.tsx` and `TrayCompanion.tsx`, allowing users to apply arbitrary typeface names.
  - Preserved underlying Markdown file format integrity with frontmatter metadata: writes both `font: "FONT_NAME"` and `font_family: "FONT_NAME"` without modifying document body text.
  - Deployed strict CSS fallback cascade array: `font-family: "${name}", "DoIT_Default", "Instrument Sans", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;`.
  - Configured `@font-face` alias `DoIT_Default` mapping safely to bundled webfonts. If an uninstalled or missing font is declared, the layout safely and silently cascades to the default font stack without errors, crashes, or rendering stalls.

## [Section 22] - Critical UI Overhaul: Dropdown Interaction Restoration, Resizable Persistent Editor Drawer & Bento Tile Motion Physics
- **Dropdown Component Interaction Restoration (The Selector Fix)**:
  - Fixed unresponsive Font Family and Text Type (Normal, H1, H2, H3) dropdowns across `NoteSheet.tsx`, `HeadingSelect.tsx`, and `TrayCompanion.tsx`.
  - Removed restrictive horizontal overflow clipping (`overflow-x-auto` was clipping absolutely-positioned dropdown menus) and replaced with `overflow-visible pointer-events-auto`.
  - Added `pointer-events-auto` and isolated event propagation (`e.stopPropagation()`) across dropdown triggers, popover containers, and menu buttons.
  - Added `onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}` on dropdown option items so that selecting a typeface or heading level does not blur the editor textarea.
  - Implemented immediate styling application (`style.fontFamily`) on active editor nodes and restored editor focus without cursor loss or layout freezing.
- **Dynamic Resizable Right Panel with Persistence Mapping**:
  - Implemented an interactive resize rail handle (`w-1 hover:w-1.5 cursor-col-resize bg-white/10 hover:bg-white/30 transition-all absolute top-0 left-0 h-full z-40 select-none group/resize`) along the far-left edge of the sliding editor drawer (`NoteSheet.tsx`).
  - Added drag tracking hooks capturing mouse position deltas (`deltaX = startX - clientX`) to smoothly widen or narrow the editor panel in real-time, clamped between `380px` and `window.innerWidth - 100px`.
  - Persisted the finalized drawer width to local storage (`doit.drawer_width`) upon mouse release.
  - Added startup initialization in `App.tsx` reading `localStorage.getItem("doit.drawer_width")` so all subsequent notes and app sessions immediately inherit the user's custom drawer width configuration.
- **Smooth Bento Tile Expansion Physics (Fluid Motion Transitions)**:
  - Eliminated rough layout snaps, pops, and visual jitter when text wraps, cards resize, or notes are reordered.
  - Integrated `motion` from `motion/react` with the `layout` attribute on both the parent bento grid container (`CategoryShelf.tsx`) and individual note card tiles (`NoteTile.tsx`).
  - Enforced fluid spring transition dynamics: `transition={{ type: "spring", stiffness: 180, damping: 25, mass: 0.8 }}`.

## [Section 23] - Critical UI & Editor Refactor: System Font Ingestion, Minimum Width Safeguards, Dropdown Boundary Protection & Table Escape Engine
- **Dynamic System Font Ingestion Engine (The Confusing Input Purge)**:
  - Removed manual text input box and Apply button under 'Custom Font Declaration' across `NoteSheet.tsx` and `TrayCompanion.tsx`.
  - Added native `get_system_fonts` Tauri command querying the Windows Registry (`HKLM` and `HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`) with Web API fallback (`window.queryLocalFonts()`), automatically sweeping all natively installed typefaces without prompts or permissions.
  - Implemented dynamic, searchable, theme-matched scrollable inner panel inside the typeface dropdown menus with real-time text query filtering, font preview rendering, active font checkmark indication, and one-click immediate application.
- **Right Editor Side-Panel Minimum Width Safeguards & Absolute Toolbar Visibility**:
  - Implemented screen-adaptive minimum width threshold in `App.tsx` and `NoteSheet.tsx`: clamping rigidly at `360px` for compact displays (`<= 1280px` screen width) and `420px` for standard/high-resolution multi-monitor configurations.
  - Absolute Toolbar Visibility: Added `shrink-0` and compact responsive font and heading modes (icon-only font button when drawer width is < 460px; short labels "Normal", "H1", "H2", "H3" in `HeadingSelect.tsx`), ensuring toolbar items (Font, B, I, Header drop-down, Table, Checkbox, Image, Delete, Close) never wrap or get pushed off-screen down to the absolute minimum width stopping point.
  - Dropdown Clipping Prevention: Converted container layout properties from `overflow-hidden` to `overflow-visible` on the main frame header and sheet chassis, and deployed dynamic viewport detection hooks (`useLayoutEffect` with `getBoundingClientRect()` alignment) on `HeadingSelect`, font dropdown, and shelf dropdown menus, preventing any edge clipping against screen and drawer boundaries.
- **Table Line-Break Escape Engine (The Enter Line-Break Bug Fix)**:
  - Enhanced rich-text editor keyboard handler (`handleRichEditorKeyDown` & `moveInTable` in `format.tsx`) for table matrix blocks.
  - When the cursor is positioned at the conclusion of a table matrix block (or in the final cell with caret at the end, or in an empty trailing row), pressing `Enter` cleanly breaks out of the table layout parameters instead of trapping the cursor or infinitely generating table rows.
  - Explicitly appends a clean newline paragraph block (`\n` / `<div><br></div>`) right below the table boundary and advances typing cursor focus seamlessly onto the blank text row.

## [Section 24] - v1.1.4: Mode-Specific Font Restrictions, Viewport Bounding Constraints & Startup Update Log Modal
- **Mode-Specific Font Visibility & Editing Restrictions**:
  - Restricted typeface selection controls strictly to rich Markdown mode ('MD Mode').
  - When the editor is toggled into raw 'Text Mode' (monospace plain text view), the font selection dropdown is completely hidden from the top toolbar row across both `NoteSheet.tsx` and `TrayCompanion.tsx`.
- **Font Dropdown Viewport Bounds & Clipping Eradication**:
  - Enforced strict structural height limits and scrolling mechanics on the font picker popover container chassis: `max-h-[380px] sm:max-h-[420px] overflow-y-auto scrollbar-thin`.
  - Added clean viewport boundary constraints ensuring the dropdown never bleeds past the bottom window chassis or truncates system font indexes on compact screens.
- **One-Time Post-Update Log Interface (Version v1.1.4 Modal)**:
  - Added persistent version storage tracker (`doit.release_notes_version`).
  - On application startup lifecycle initialization, compares cached version token against current binary version ("1.1.4"). If lower or missing, presents the clean monochrome overlay release modal and updates storage immediately.
  - Features concise summary notes, a direct GitHub changelog documentation link, and a one-click "Got it" permanent dismissal trigger.
