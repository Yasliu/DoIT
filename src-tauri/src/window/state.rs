//! Process-wide window state shared by the lifecycle, geometry and command code.

use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

#[derive(Clone, Debug)]
pub struct MainWindowState {
    pub is_maximized: bool,
    pub is_fullscreen: bool,
    pub position: Option<tauri::PhysicalPosition<i32>>,
    pub size: Option<tauri::PhysicalSize<u32>>,
    pub monitor_name: Option<String>,
}

pub static SAVED_MAIN_WINDOW_STATE: Mutex<Option<MainWindowState>> = Mutex::new(None);

#[derive(Clone, Debug, Default)]
pub struct PreStatePositionBuffer {
    pub pill_physical_pos: Option<tauri::PhysicalPosition<i32>>,
    pub expanded_physical_pos: Option<tauri::PhysicalPosition<i32>>,
    pub main_physical_pos: Option<tauri::PhysicalPosition<i32>>,
    pub main_physical_size: Option<tauri::PhysicalSize<u32>>,
}

pub static PRE_STATE_BUFFER: Mutex<PreStatePositionBuffer> = Mutex::new(PreStatePositionBuffer {
    pill_physical_pos: None,
    expanded_physical_pos: None,
    main_physical_pos: None,
    main_physical_size: None,
});

pub static TRANSITION_LOCK_UNTIL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn current_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn lock_window_transition(duration_ms: u64) {
    TRANSITION_LOCK_UNTIL.store(current_timestamp_ms() + duration_ms, std::sync::atomic::Ordering::SeqCst);
}

pub fn is_window_transitioning() -> bool {
    current_timestamp_ms() < TRANSITION_LOCK_UNTIL.load(std::sync::atomic::Ordering::SeqCst)
}

#[derive(Clone, Debug, Default)]
pub struct TrayPositionState {
    pub pill_offset: Option<tauri::PhysicalPosition<i32>>,
    pub expanded_offset: Option<tauri::PhysicalPosition<i32>>,
    pub last_monitor_name: Option<String>,
}

pub static TRAY_POSITION_STATE: Mutex<TrayPositionState> = Mutex::new(TrayPositionState {
    pill_offset: None,
    expanded_offset: None,
    last_monitor_name: None,
});

pub static TARGET_TRAY_MONITOR_NAME: Mutex<Option<String>> = Mutex::new(None);

pub static MAIN_SUSPENDED: AtomicBool = AtomicBool::new(false);
pub static MAIN_SHOW_PENDING: AtomicBool = AtomicBool::new(false);
pub static TRAY_START_EXPANDED: AtomicBool = AtomicBool::new(false);
/// Set by the frontend while an externally opened file has unsaved edits (never blank the canvas then)
pub static EXTERNAL_DIRTY: AtomicBool = AtomicBool::new(false);
