# DoIT Developer Architecture & Engineering Changelog

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
