use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::models::{
    compute_markdown_filename, AppSettings, AppStateData, CategoryInfo, GridCoordinates, NoteItem,
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

    /// High-speed memory-optimized indexing of all .md files in the storage directory
    fn load_markdown_repository(dir: &PathBuf) -> (AppStateData, HashMap<String, PathBuf>) {
        let mut notes: Vec<NoteItem> = Vec::new();
        let mut file_map = HashMap::new();

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                    if let Ok(metadata) = fs::metadata(&path) {
                        if metadata.len() > MAX_FILE_SIZE_BYTES {
                            continue;
                        }
                    }
                    if let Ok(mut f) = File::open(&path) {
                        let mut content = String::new();
                        if f.read_to_string(&mut content).is_ok() {
                            let filename = path.file_stem().and_then(|s| s.to_str()).unwrap_or("note");
                            if let Some(note) = NoteItem::from_markdown(&content, filename) {
                                file_map.insert(note.id.clone(), path.clone());
                                notes.push(note);
                            }
                        }
                    }
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

    pub fn upsert_note(&self, note: NoteItem) -> Result<NoteItem, String> {
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
        let md_content = note.to_markdown(repeated_num);
        let target_filename = compute_markdown_filename(
            &note.category,
            &note.title,
            note.last_edited,
            repeated_num,
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
            "Architecture".to_string()
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
    /// Reads target file, strictly verifies frontmatter app: "DoIT",
    /// parses metadata and note body, and ingests into workspace memory pool.
    pub fn import_single_file(&self, path_str: &str) -> Result<NoteItem, String> {
        let path = PathBuf::from(path_str);
        if !path.exists() || !path.is_file() {
            return Err(format!("File does not exist: {path_str}"));
        }

        // Strict 2 MB boundary check before reading into memory
        let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read file metadata: {e}"))?;
        if metadata.len() > MAX_FILE_SIZE_BYTES {
            return Err(format!(
                "File size limit exceeded: Maximum allowed note size is 2 MB (file is {:.2} MB).",
                (metadata.len() as f64) / (1024.0 * 1024.0)
            ));
        }

        let mut file = File::open(&path).map_err(|e| format!("Cannot read file: {e}"))?;
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| format!("Cannot read file contents: {e}"))?;

        let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("imported_note");
        // Strict Validation: must have app: "DoIT"
        let note = NoteItem::parse_and_validate_doit_markdown(&content, file_stem)?;

        // Ingest into active workspace pool and write copy to local repository
        let saved = self.upsert_note(note)?;
        Ok(saved)
    }

    /// Automated Folder Scanning Loop:
    /// Iterates through every .md file in the target directory,
    /// verifies app: "DoIT" on every file, safely skips unformatted files,
    /// and brings verified DoIT notes into the live workspace memory pool.
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
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                    total_scanned += 1;
                    if let Ok(meta) = fs::metadata(&path) {
                        if meta.len() > MAX_FILE_SIZE_BYTES {
                            skipped_count += 1;
                            continue;
                        }
                    }
                    if let Ok(mut f) = File::open(&path) {
                        let mut content = String::new();
                        if f.read_to_string(&mut content).is_ok() {
                            let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("note");
                            match NoteItem::parse_and_validate_doit_markdown(&content, file_stem) {
                                Ok(note) => {
                                    valid_notes.push(note);
                                    imported_count += 1;
                                }
                                Err(_) => {
                                    // Completely ignore standard or unformatted text files without breaking loop
                                    skipped_count += 1;
                                }
                            }
                        } else {
                            skipped_count += 1;
                        }
                    } else {
                        skipped_count += 1;
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
