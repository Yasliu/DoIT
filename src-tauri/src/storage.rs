use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::models::{
    compute_note_filename, AppSettings, AppStateData, CategoryInfo, GridCoordinates, NoteItem,
    ScanSummary, MAX_FILE_SIZE_BYTES,
};

pub struct StorageManager {
    settings_path: PathBuf,
    settings: Arc<RwLock<AppSettings>>,
    data: Arc<RwLock<AppStateData>>,
    file_map: Arc<RwLock<HashMap<String, PathBuf>>>,
}

impl StorageManager {
    pub fn new() -> Self {
        let settings_path = Self::resolve_settings_path();
        let settings = Self::load_settings_from_disk(&settings_path).unwrap_or_default();
        let storage_path = PathBuf::from(&settings.storage_path);
        let _ = fs::create_dir_all(&storage_path);

        let (initial_data, file_map) = Self::load_markdown_repository(&storage_path);

        Self {
            settings_path,
            settings: Arc::new(RwLock::new(settings)),
            data: Arc::new(RwLock::new(initial_data)),
            file_map: Arc::new(RwLock::new(file_map)),
        }
    }

    fn resolve_settings_path() -> PathBuf {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            let mut dir = PathBuf::from(app_data);
            dir.push("DoIT");
            let _ = fs::create_dir_all(&dir);
            dir.push("settings.json");
            return dir;
        }

        let mut local = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        local.push("doit_settings.json");
        local
    }

    fn load_settings_from_disk(path: &PathBuf) -> Option<AppSettings> {
        if !path.exists() {
            return None;
        }
        let mut file = File::open(path).ok()?;
        let mut contents = String::new();
        file.read_to_string(&mut contents).ok()?;
        serde_json::from_str(&contents).ok()
    }

    fn persist_settings(&self) -> Result<(), String> {
        let lock = self.settings.read().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*lock).map_err(|e| e.to_string())?;
        drop(lock);

        if let Some(p) = self.settings_path.parent() {
            let _ = fs::create_dir_all(p);
        }

        let mut temp_path = self.settings_path.clone();
        temp_path.set_extension("tmp");
        if let Ok(mut f) = File::create(&temp_path) {
            let _ = f.write_all(json.as_bytes());
            let _ = f.sync_all();
            drop(f);
            let _ = fs::rename(&temp_path, &self.settings_path);
        }

        Ok(())
    }

    /// Reads any .md / .txt file into a NoteItem. Never rejects on content: invalid UTF-8 is repaired
    /// lossily and routed through the defensive sanitizer.
    fn read_note_file(path: &PathBuf) -> Option<NoteItem> {
        if !path.is_file() {
            return None;
        }
        let ext = path.extension().and_then(|s| s.to_str())?.to_ascii_lowercase();
        if ext != "md" && ext != "txt" {
            return None;
        }
        let metadata = fs::metadata(path).ok()?;
        if metadata.len() > MAX_FILE_SIZE_BYTES {
            return None;
        }
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let bytes = fs::read(path).ok()?;
        let content = String::from_utf8_lossy(&bytes).into_owned();
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("note");
        Some(NoteItem::from_file(&content, stem, &ext, modified_ms))
    }

    /// High-speed memory-optimized indexing of all .md / .txt files in the storage directory
    fn load_markdown_repository(dir: &PathBuf) -> (AppStateData, HashMap<String, PathBuf>) {
        let mut notes: Vec<NoteItem> = Vec::new();
        let mut file_map = HashMap::new();

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(mut note) = Self::read_note_file(&path) {
                    // Eliminate all pre-made categories across versions/updates
                    if note.category.eq_ignore_ascii_case("Architecture") || note.category.eq_ignore_ascii_case("Ideas") {
                        note.category = "Uncategorized".to_string();
                    }
                    note.title = crate::models::clean_yaml_scalar(&note.title);
                    note.category = crate::models::clean_yaml_scalar(&note.category);
                    if note.category.trim().is_empty() {
                        note.category = "Uncategorized".to_string();
                    }
                    if let Some(ref f) = note.font_family {
                        note.font_family = Some(crate::models::clean_yaml_scalar(f));
                    }
                    note.content.retain(|c| !(c.text.trim().eq_ignore_ascii_case("Line") && !c.is_todo));
                    file_map.insert(note.id.clone(), path.clone());
                    notes.push(note);
                }
            }
        }
        // If repository is brand new and empty, start with an empty clean repository
        // Never auto-generate dummy notes or pre-made categories!

        notes.sort_by(|a, b| b.last_edited.cmp(&a.last_edited));

        // Reconstruct categories
        let mut categories_map: HashMap<String, usize> = HashMap::new();
        for n in &notes {
            *categories_map.entry(n.category.clone()).or_insert(0) += 1;
        }
        // Permanent default category that can never be purged
        categories_map.entry("Uncategorized".to_string()).or_insert(0);

        let mut categories: Vec<CategoryInfo> = categories_map
            .into_keys()
            .map(|name| CategoryInfo {
                name,
                collapsed: false,
                color_accent: Some("#ffffff".to_string()),
            })
            .collect();
        categories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        (
            AppStateData {
                notes,
                categories,
                search_history: vec![],
            },
            file_map,
        )
    }

    pub fn get_settings(&self) -> Result<AppSettings, String> {
        let lock = self.settings.read().map_err(|e| e.to_string())?;
        Ok((*lock).clone())
    }

    pub fn get_is_maximized(&self) -> bool {
        self.settings.read().map(|s| s.is_maximized).unwrap_or(false)
    }

    pub fn set_is_maximized(&self, is_maximized: bool) -> Result<(), String> {
        let changed = {
            let mut lock = self.settings.write().map_err(|e| e.to_string())?;
            if lock.is_maximized != is_maximized {
                lock.is_maximized = is_maximized;
                true
            } else {
                false
            }
        };
        if changed {
            self.persist_settings()?;
        }
        Ok(())
    }

    pub fn get_dock_on_close(&self) -> bool {
        self.settings.read().map(|s| s.dock_on_close).unwrap_or(true)
    }

    pub fn set_dock_on_close(&self, dock_on_close: bool) -> Result<(), String> {
        let changed = {
            let mut lock = self.settings.write().map_err(|e| e.to_string())?;
            if lock.dock_on_close != dock_on_close {
                lock.dock_on_close = dock_on_close;
                true
            } else {
                false
            }
        };
        if changed {
            self.persist_settings()?;
        }
        Ok(())
    }

    pub fn update_settings(&self, new_settings: AppSettings) -> Result<AppSettings, String> {
        let old_path = {
            let mut lock = self.settings.write().map_err(|e| e.to_string())?;
            let old = lock.storage_path.clone();
            *lock = new_settings.clone();
            old
        };

        self.persist_settings()?;

        // If storage directory changed, migrate files and re-index
        if old_path != new_settings.storage_path {
            let new_dir = PathBuf::from(&new_settings.storage_path);
            let _ = fs::create_dir_all(&new_dir);

            // Re-index from new directory
            let (new_data, new_file_map) = Self::load_markdown_repository(&new_dir);
            {
                let mut data_lock = self.data.write().map_err(|e| e.to_string())?;
                *data_lock = new_data;
            }
            {
                let mut map_lock = self.file_map.write().map_err(|e| e.to_string())?;
                *map_lock = new_file_map;
            }
        }

        Ok(new_settings)
    }

    pub fn get_all_notes(&self) -> Result<Vec<NoteItem>, String> {
        let lock = self.data.read().map_err(|e| e.to_string())?;
        Ok(lock.notes.clone())
    }

    pub fn get_categories(&self) -> Result<Vec<CategoryInfo>, String> {
        let lock = self.data.read().map_err(|e| e.to_string())?;
        let mut cats = lock.categories.clone();
        if !cats.iter().any(|c| c.name.eq_ignore_ascii_case("uncategorized")) {
            cats.push(CategoryInfo {
                name: "Uncategorized".to_string(),
                collapsed: false,
                color_accent: Some("#ffffff".to_string()),
            });
        }
        cats.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(cats)
    }

    pub fn add_category(&self, category: &str) -> Result<bool, String> {
        let cat_clean = crate::models::clean_yaml_scalar(category);
        if cat_clean.is_empty() {
            return Err("Category name cannot be empty".to_string());
        }
        let mut lock = self.data.write().map_err(|e| e.to_string())?;
        if !lock.categories.iter().any(|c| c.name.eq_ignore_ascii_case(&cat_clean)) {
            lock.categories.push(CategoryInfo {
                name: cat_clean,
                collapsed: false,
                color_accent: Some("#ffffff".to_string()),
            });
        }
        Ok(true)
    }

    pub fn delete_category(&self, category: &str) -> Result<bool, String> {
        if category.eq_ignore_ascii_case("uncategorized") {
            return Err("Cannot delete the default Uncategorized category".to_string());
        }

        let notes_to_reassign: Vec<NoteItem> = {
            let mut lock = self.data.write().map_err(|e| e.to_string())?;
            lock.categories.retain(|c| !c.name.eq_ignore_ascii_case(category));

            let mut to_update = Vec::new();
            for note in lock.notes.iter_mut() {
                if note.category.eq_ignore_ascii_case(category) {
                    note.category = "Uncategorized".to_string();
                    note.last_edited = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;
                    to_update.push(note.clone());
                }
            }
            to_update
        };

        for note in notes_to_reassign {
            let _ = self.upsert_note(note);
        }

        Ok(true)
    }

    /// Opens any .md / .txt file in place (no copy). A file that already belongs to the repository
    /// resolves to its native note instead.
    pub fn open_external(&self, path_str: &str) -> Result<NoteItem, String> {
        let path = PathBuf::from(path_str);
        if !path.is_file() {
            return Err(format!("File does not exist: {path_str}"));
        }
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        if ext != "md" && ext != "markdown" && ext != "txt" {
            return Err("Only .md and .txt files can be opened.".to_string());
        }
        if let Ok(canon) = path.canonicalize() {
            let map = self.file_map.read().map_err(|e| e.to_string())?;
            let data = self.data.read().map_err(|e| e.to_string())?;
            for (id, p) in map.iter() {
                if p.canonicalize().map(|c| c == canon).unwrap_or(false) {
                    if let Some(n) = data.notes.iter().find(|n| &n.id == id) {
                        return Ok(n.clone());
                    }
                }
            }
        }
        let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read file metadata: {e}"))?;
        if metadata.len() > MAX_FILE_SIZE_BYTES {
            return Err("File is larger than the 30 MB limit.".to_string());
        }
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let bytes = fs::read(&path).map_err(|e| format!("Cannot read file: {e}"))?;
        let content = String::from_utf8_lossy(&bytes).into_owned();
        Ok(NoteItem::from_external_file(&content, path_str, modified_ms))
    }

    /// Writes an external note back to its own path (atomic). A MD <-> Text mode change renames the
    /// extension (.md <-> .txt) in place.
    pub fn save_external(&self, note: NoteItem) -> Result<NoteItem, String> {
        let src = note
            .source_path
            .clone()
            .ok_or_else(|| "This note has no external file path.".to_string())?;
        let path = PathBuf::from(&src);
        let current_kind = match path.extension().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()) {
            Some(e) if e == "txt" => "txt",
            _ => "md",
        };
        let wanted = note.file_extension();
        let target = if current_kind == wanted { path.clone() } else { path.with_extension(wanted) };
        if target != path && target.exists() {
            return Err(format!("{} already exists.", target.display()));
        }

        let text = note.to_external_text();
        let mut tmp = target.clone();
        tmp.set_extension("doit-tmp");
        fs::write(&tmp, text.as_bytes()).map_err(|e| format!("Cannot write file: {e}"))?;
        fs::rename(&tmp, &target).map_err(|e| format!("Cannot finalise file: {e}"))?;
        if target != path {
            let _ = fs::remove_file(&path);
        }

        let mut saved = note;
        saved.source_path = Some(target.to_string_lossy().to_string());
        Ok(saved)
    }
    pub fn rename_category(&self, old: &str, new_name: &str) -> Result<Vec<NoteItem>, String> {
        if old.eq_ignore_ascii_case("uncategorized") {
            return Err("The default Uncategorized category cannot be renamed".to_string());
        }
        let new_clean = crate::models::clean_yaml_scalar(new_name);
        if new_clean.is_empty() {
            return Err("Category name cannot be empty".to_string());
        }
        if new_clean.eq_ignore_ascii_case("uncategorized") {
            return Err("That name is reserved".to_string());
        }

        let changed: Vec<NoteItem> = {
            let mut lock = self.data.write().map_err(|e| e.to_string())?;
            let same_name = new_clean.eq_ignore_ascii_case(old);
            if !same_name && lock.categories.iter().any(|c| c.name.eq_ignore_ascii_case(&new_clean)) {
                return Err("A category with that name already exists".to_string());
            }
            for cat in lock.categories.iter_mut() {
                if cat.name.eq_ignore_ascii_case(old) {
                    cat.name = new_clean.clone();
                }
            }
            let mut moved = Vec::new();
            for note in lock.notes.iter_mut() {
                if note.category.eq_ignore_ascii_case(old) {
                    note.category = new_clean.clone();
                    moved.push(note.clone());
                }
            }
            moved
        };

        let mut saved = Vec::with_capacity(changed.len());
        for note in changed {
            saved.push(self.upsert_note(note)?);
        }
        Ok(saved)
    }
    pub fn upsert_note(&self, note: NoteItem) -> Result<NoteItem, String> {
        // External files are edited in place and only ever written by an explicit Save
        if note.source_path.is_some() {
            return Ok(note);
        }
        let mut note = note;
        note.title = crate::models::clean_yaml_scalar(&note.title);
        note.category = crate::models::clean_yaml_scalar(&note.category);
        if note.category.trim().is_empty() {
            note.category = "Uncategorized".to_string();
        }
        if let Some(ref f) = note.font_family {
            note.font_family = Some(crate::models::clean_yaml_scalar(f));
        }

        let mut lock = self.data.write().map_err(|e| e.to_string())?;

        // Auto-register category if not present
        let cat_exists = lock.categories.iter().any(|c| c.name.eq_ignore_ascii_case(&note.category));
        if !cat_exists && !note.category.trim().is_empty() {
            lock.categories.push(CategoryInfo {
                name: note.category.trim().to_string(),
                collapsed: false,
                color_accent: Some("#ffffff".to_string()),
            });
        }

        let mut found = false;
        for existing in lock.notes.iter_mut() {
            if existing.id == note.id {
                *existing = note.clone();
                found = true;
                break;
            }
        }

        if !found {
            lock.notes.insert(0, note.clone());
        }

        // Calculate repeated title number
        let repeated_num = lock
            .notes
            .iter()
            .filter(|n| {
                n.id != note.id
                    && n.category.eq_ignore_ascii_case(&note.category)
                    && n.title.eq_ignore_ascii_case(&note.title)
            })
            .count();

        drop(lock);

        // Compute markdown content and target filename
        let ext = note.file_extension();
        let md_content = if ext == "txt" { note.to_plain_text() } else { note.to_markdown(repeated_num) };
        let target_filename = compute_note_filename(
            &note.category,
            &note.title,
            note.last_edited,
            repeated_num,
            ext,
        );

        let storage_dir = {
            let settings = self.settings.read().map_err(|e| e.to_string())?;
            PathBuf::from(&settings.storage_path)
        };
        let target_path = storage_dir.join(&target_filename);

        // Track and clean up previous file if renamed
        let previous_path = {
            let mut map = self.file_map.write().map_err(|e| e.to_string())?;
            let old = map.insert(note.id.clone(), target_path.clone());
            old
        };

        // Offload disk write to background thread (high-speed zero-lag execution)
        std::thread::spawn(move || {
            if let Some(prev) = previous_path {
                if prev != target_path && prev.exists() {
                    let _ = fs::remove_file(prev);
                }
            }

            let mut temp_path = target_path.clone();
            temp_path.set_extension("tmp");
            if let Ok(mut f) = File::create(&temp_path) {
                let _ = f.write_all(md_content.as_bytes());
                let _ = f.sync_all();
                drop(f);
                let _ = fs::rename(&temp_path, &target_path);
            }
        });

        Ok(note)
    }

    pub fn update_category(&self, id: &str, new_category: &str) -> Result<NoteItem, String> {
        let mut lock = self.data.write().map_err(|e| e.to_string())?;
        let cat_clean = if new_category.trim().is_empty() {
            "Uncategorized".to_string()
        } else {
            new_category.trim().to_string()
        };

        if !lock.categories.iter().any(|c| c.name.eq_ignore_ascii_case(&cat_clean)) {
            lock.categories.push(CategoryInfo {
                name: cat_clean.clone(),
                collapsed: false,
                color_accent: Some("#ffffff".to_string()),
            });
        }

        let mut updated: Option<NoteItem> = None;
        for existing in lock.notes.iter_mut() {
            if existing.id == id {
                existing.category = cat_clean.clone();
                existing.last_edited = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as i64;
                updated = Some(existing.clone());
                break;
            }
        }
        drop(lock);

        if let Some(note) = updated {
            self.upsert_note(note)
        } else {
            Err("Note not found".to_string())
        }
    }

    pub fn update_coordinates(
        &self,
        id: &str,
        coords: GridCoordinates,
    ) -> Result<NoteItem, String> {
        let mut lock = self.data.write().map_err(|e| e.to_string())?;
        let mut updated: Option<NoteItem> = None;

        for existing in lock.notes.iter_mut() {
            if existing.id == id {
                existing.grid_coordinates = coords.clone();
                updated = Some(existing.clone());
                break;
            }
        }
        drop(lock);

        if let Some(note) = updated {
            self.upsert_note(note)
        } else {
            Err("Note not found".to_string())
        }
    }

    pub fn delete_note(&self, id: &str) -> Result<bool, String> {
        let mut lock = self.data.write().map_err(|e| e.to_string())?;
        let initial_len = lock.notes.len();
        lock.notes.retain(|n| n.id != id);
        let removed = lock.notes.len() < initial_len;
        drop(lock);

        let path_to_remove = {
            let mut map = self.file_map.write().map_err(|e| e.to_string())?;
            map.remove(id)
        };

        if let Some(p) = path_to_remove {
            std::thread::spawn(move || {
                let _ = fs::remove_file(p);
            });
        }

        Ok(removed)
    }

    pub fn toggle_category_collapse(&self, category: &str) -> Result<bool, String> {
        let mut lock = self.data.write().map_err(|e| e.to_string())?;
        let mut new_state = false;
        for cat in lock.categories.iter_mut() {
            if cat.name.eq_ignore_ascii_case(category) {
                cat.collapsed = !cat.collapsed;
                new_state = cat.collapsed;
                break;
            }
        }
        Ok(new_state)
    }

    pub fn export_raw_json(&self) -> Result<String, String> {
        let lock = self.data.read().map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&*lock).map_err(|e| e.to_string())
    }

    pub fn import_raw_json(&self, json: &str) -> Result<bool, String> {
        let parsed: AppStateData = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let notes_to_write = parsed.notes.clone();

        {
            let mut lock = self.data.write().map_err(|e| e.to_string())?;
            *lock = parsed;
        }

        for note in notes_to_write {
            let _ = self.upsert_note(note);
        }

        Ok(true)
    }

    /// Single File Ingestion Layer:
    /// Reads the target .md / .txt file,
    /// parses metadata and note body, and ingests into workspace memory pool.
    pub fn import_single_file(&self, path_str: &str) -> Result<NoteItem, String> {
        let path = PathBuf::from(path_str);
        if !path.exists() || !path.is_file() {
            return Err(format!("File does not exist: {path_str}"));
        }
        let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read file metadata: {e}"))?;
        if metadata.len() > MAX_FILE_SIZE_BYTES {
            return Err(format!(
                "File size limit exceeded: maximum allowed note size is 30 MB (file is {:.2} MB).",
                (metadata.len() as f64) / (1024.0 * 1024.0)
            ));
        }
        let note = Self::read_note_file(&path)
            .ok_or_else(|| "Only .md and .txt files can be imported.".to_string())?;
        self.upsert_note(note)
    }
    /// Automated Folder Scanning Loop:
    /// Iterates through every .md file in the target directory,
    /// ingests every file without requiring any header,
    /// and brings every note into the live workspace memory pool.
    pub fn scan_folder(&self, folder_path_str: Option<&str>) -> Result<ScanSummary, String> {
        let target_dir = match folder_path_str {
            Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
            _ => {
                let lock = self.settings.read().map_err(|e| e.to_string())?;
                PathBuf::from(&lock.storage_path)
            }
        };

        if !target_dir.exists() || !target_dir.is_dir() {
            return Err(format!("Directory does not exist: {}", target_dir.to_string_lossy()));
        }

        let mut total_scanned = 0usize;
        let mut imported_count = 0usize;
        let mut skipped_count = 0usize;
        let mut valid_notes = Vec::new();

        if let Ok(entries) = fs::read_dir(&target_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let is_note_file = path.is_file()
                    && path
                        .extension()
                        .and_then(|s| s.to_str())
                        .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("txt"))
                        .unwrap_or(false);
                if is_note_file {
                    total_scanned += 1;
                    match Self::read_note_file(&path) {
                        Some(note) => {
                            valid_notes.push(note);
                            imported_count += 1;
                        }
                        None => skipped_count += 1,
                    }
                }
            }
        }
        // Ingest valid notes into memory pool
        for note in &valid_notes {
            let _ = self.upsert_note(note.clone());
        }

        let all_notes = self.get_all_notes()?;

        Ok(ScanSummary {
            total_scanned,
            imported_count,
            skipped_count,
            imported_notes: all_notes,
        })
    }
}
