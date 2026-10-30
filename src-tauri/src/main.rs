// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// DoIT Desktop Architecture:
// Native multi-monitor positioning, pre-state position buffering, and anti-drift
// coordinate locking are coordinated through `doit_lib` and `commands::PRE_STATE_BUFFER`.

fn main() {
    doit_lib::run()
}
