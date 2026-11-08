mod attachments;
pub mod shelves;
mod writer;

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use crate::models::{
    compute_note_filename, AppSettings, AppStateData, CategoryInfo, FolderImport, GridCoordinates,
    NoteItem, ScanSummary, MAX_FILE_SIZE_BYTES,
};

pub struct StorageManager {
    settings_path: PathBuf,
    settings: Arc<RwLock<AppSettings>>,
    notes: Arc<RwLock<Vec<NoteItem>>>,
    shelves: RwLock<shelves::Shelves>,
    file_map: Arc<RwLock<HashMap<String, PathBuf>>>,
    writer: writer::NoteWriter,
}

impl StorageManager {
    pub fn new() -> Self {
        let settings_path = Self::resolve_settings_path();
        let mut settings = Self::load_settings_from_disk(&settings_path).unwrap_or_default();
        let storage_path = PathBuf::from(&settings.storage_path);
        let _ = fs::create_dir_all(&storage_path);

        let (notes, file_map) = Self::load_markdown_repository(&storage_path);
        let migrating = settings.shelves.is_none();
        let shelves = shelves::Shelves::load(
            settings.shelves.take(),
            settings.shelf_order.as_deref().unwrap_or_default(),
            &settings.category_icons.clone().unwrap_or_default(),
            notes.iter().map(|n| n.category.as_str()),
        );
        settings.shelves = Some(shelves.list().to_vec());

        let manager = Self {
            settings_path,
            settings: Arc::new(RwLock::new(settings)),
            notes: Arc::new(RwLock::new(notes)),
            shelves: RwLock::new(shelves),
            file_map: Arc::new(RwLock::new(file_map)),
            writer: writer::NoteWriter::new(),
        };
        if migrating {
            // Shelf order and icons now live in `shelves`; drop the settings they came from.
            if let Ok(mut settings) = manager.settings.write() {
                settings.shelf_order = None;
                settings.category_icons = None;
            }
            let _ = manager.persist_settings();
        }
        manager
    }

    fn resolve_settings_path() -> PathBuf {
        if let Some(dir) = crate::platform::config_dir() {
            let _ = fs::create_dir_all(&dir);
            return dir.join("settings.json");
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
    fn load_markdown_repository(dir: &PathBuf) -> (Vec<NoteItem>, HashMap<String, PathBuf>) {
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
        notes.sort_by(|a, b| b.last_edited.cmp(&a.last_edited));
        (notes, file_map)
    }

    /// Stores an image in the notes folder; returns the relative path a note links to.
    pub fn save_attachment(&self, bytes: &[u8], mime: &str) -> Result<String, String> {
        let notes_dir = PathBuf::from(&self.settings.read().map_err(|e| e.to_string())?.storage_path);
        attachments::save(&notes_dir, bytes, mime)
    }

    /// The folder notes and their images live in.
    pub fn notes_dir(&self) -> Result<PathBuf, String> {
        Ok(PathBuf::from(&self.settings.read().map_err(|e| e.to_string())?.storage_path))
    }

    /// Blocks until every note change is on disk (call before the process exits).
    pub fn flush_writes(&self) {
        self.writer.flush();
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

    /// Merges `patch` (any subset of the settings fields) into the saved settings. Callers send only
    /// what they changed, so two windows saving different fields never undo each other.
    pub fn update_settings(&self, mut patch: serde_json::Map<String, serde_json::Value>) -> Result<AppSettings, String> {
        // Shelves change only through the shelf methods below.
        patch.remove("shelves");
        let (old_path, new_settings) = {
            let mut lock = self.settings.write().map_err(|e| e.to_string())?;
            let merged = merge_settings(&lock, patch)?;
            let old = std::mem::replace(&mut *lock, merged.clone());
            (old.storage_path, merged)
        };

        self.persist_settings()?;

        // If storage directory changed, migrate files and re-index
        if old_path != new_settings.storage_path {
            let new_dir = PathBuf::from(&new_settings.storage_path);
            let _ = fs::create_dir_all(&new_dir);

            // Re-index from new directory
            let (new_notes, new_file_map) = Self::load_markdown_repository(&new_dir);
            self.change_shelves(|shelves| {
                for note in &new_notes {
                    shelves.ensure(&note.category);
                }
                Ok(())
            })?;
            {
                let mut notes_lock = self.notes.write().map_err(|e| e.to_string())?;
                *notes_lock = new_notes;
            }
            {
                let mut map_lock = self.file_map.write().map_err(|e| e.to_string())?;
                *map_lock = new_file_map;
            }
        }

        Ok(new_settings)
    }

    pub fn get_all_notes(&self) -> Result<Vec<NoteItem>, String> {
        let lock = self.notes.read().map_err(|e| e.to_string())?;
        Ok(lock.clone())
    }

    /// Runs `change` on the shelves and saves them if it changed anything.
    fn change_shelves<R>(&self, change: impl FnOnce(&mut shelves::Shelves) -> Result<R, String>) -> Result<R, String> {
        let (result, changed) = {
            let mut shelves = self.shelves.write().map_err(|e| e.to_string())?;
            let before = shelves.clone();
            let result = change(&mut shelves)?;
            (result, (*shelves != before).then(|| shelves.list().to_vec()))
        };
        if let Some(list) = changed {
            self.settings.write().map_err(|e| e.to_string())?.shelves = Some(list);
            self.persist_settings()?;
        }
        Ok(result)
    }

    /// Every shelf in display order ("Uncategorized" last).
    pub fn get_shelves(&self) -> Result<Vec<shelves::Shelf>, String> {
        Ok(self.shelves.read().map_err(|e| e.to_string())?.list().to_vec())
    }

    /// Makes an empty shelf; `false` if it already existed.
    pub fn create_shelf(&self, name: &str) -> Result<bool, String> {
        self.change_shelves(|shelves| shelves.create(name))
    }

    pub fn reorder_shelves(&self, names: &[String]) -> Result<(), String> {
        self.change_shelves(|shelves| {
            shelves.reorder(names);
            Ok(())
        })
    }

    pub fn set_shelf_icon(&self, name: &str, icon: Option<String>) -> Result<(), String> {
        self.change_shelves(|shelves| {
            shelves.set_icon(name, icon);
            Ok(())
        })
    }

    pub fn set_shelf_collapsed(&self, name: &str, collapsed: bool) -> Result<(), String> {
        self.change_shelves(|shelves| {
            shelves.set_collapsed(name, collapsed);
            Ok(())
        })
    }

    /// The shelf's stored spelling, made if it does not exist yet.
    fn shelf_for(&self, name: &str) -> Result<String, String> {
        let name = if name.trim().is_empty() { shelves::UNCATEGORIZED } else { name };
        self.change_shelves(|shelves| {
            shelves.ensure(name);
            Ok(shelves.find(name).unwrap_or(shelves::UNCATEGORIZED).to_string())
        })
    }


    /// Deletes a shelf; its notes move to "Uncategorized".
    pub fn delete_shelf(&self, name: &str) -> Result<Vec<NoteItem>, String> {
        self.change_shelves(|shelves| shelves.delete(name))?;
        let moved: Vec<NoteItem> = {
            let mut lock = self.notes.write().map_err(|e| e.to_string())?;
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;
            lock.iter_mut()
                .filter(|note| note.category.eq_ignore_ascii_case(name))
                .map(|note| {
                    note.category = shelves::UNCATEGORIZED.to_string();
                    note.last_edited = now;
                    note.clone()
                })
                .collect()
        };
        moved.into_iter().map(|note| self.upsert_note(note)).collect()
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
            let notes = self.notes.read().map_err(|e| e.to_string())?;
            for (id, p) in map.iter() {
                if p.canonicalize().map(|c| c == canon).unwrap_or(false) {
                    if let Some(n) = notes.iter().find(|n| &n.id == id) {
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
    /// Renames a shelf and moves its notes along; returns the moved notes.
    pub fn rename_shelf(&self, old: &str, new_name: &str) -> Result<Vec<NoteItem>, String> {
        let new_name = self.change_shelves(|shelves| shelves.rename(old, new_name))?;
        let moved: Vec<NoteItem> = {
            let mut lock = self.notes.write().map_err(|e| e.to_string())?;
            lock.iter_mut()
                .filter(|note| note.category.eq_ignore_ascii_case(old))
                .map(|note| {
                    note.category = new_name.clone();
                    note.clone()
                })
                .collect()
        };
        moved.into_iter().map(|note| self.upsert_note(note)).collect()
    }
    pub fn upsert_note(&self, note: NoteItem) -> Result<NoteItem, String> {
        // External files are edited in place and only ever written by an explicit Save
        if note.source_path.is_some() {
            return Ok(note);
        }
        let mut note = note;
        note.title = crate::models::clean_yaml_scalar(&note.title);
        note.category = self.shelf_for(&crate::models::clean_yaml_scalar(&note.category))?;
        if let Some(ref f) = note.font_family {
            note.font_family = Some(crate::models::clean_yaml_scalar(f));
        }

        let mut lock = self.notes.write().map_err(|e| e.to_string())?;

        let mut found = false;
        for existing in lock.iter_mut() {
            if existing.id == note.id {
                *existing = note.clone();
                found = true;
                break;
            }
        }

        if !found {
            lock.insert(0, note.clone());
        }

        // Calculate repeated title number
        let repeated_num = lock
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

        self.writer.write(&note.id, target_path, md_content, previous_path);

        Ok(note)
    }

    /// Moves a note onto another shelf (made if new).
    pub fn update_category(&self, id: &str, new_category: &str) -> Result<NoteItem, String> {
        let shelf = self.shelf_for(new_category.trim())?;
        let updated = {
            let mut lock = self.notes.write().map_err(|e| e.to_string())?;
            lock.iter_mut().find(|n| n.id == id).map(|existing| {
                existing.category = shelf;
                existing.last_edited = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as i64;
                existing.clone()
            })
        };
        match updated {
            Some(note) => self.upsert_note(note),
            None => Err("Note not found".to_string()),
        }
    }

    pub fn update_coordinates(
        &self,
        id: &str,
        coords: GridCoordinates,
    ) -> Result<NoteItem, String> {
        let mut lock = self.notes.write().map_err(|e| e.to_string())?;
        let mut updated: Option<NoteItem> = None;

        for existing in lock.iter_mut() {
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
        let mut lock = self.notes.write().map_err(|e| e.to_string())?;
        let initial_len = lock.len();
        lock.retain(|n| n.id != id);
        let removed = lock.len() < initial_len;
        drop(lock);

        let path_to_remove = {
            let mut map = self.file_map.write().map_err(|e| e.to_string())?;
            map.remove(id)
        };

        if let Some(p) = path_to_remove {
            self.writer.delete(id, p);
        }

        Ok(removed)
    }


    pub fn export_raw_json(&self) -> Result<String, String> {
        let export = AppStateData {
            notes: self.get_all_notes()?,
            categories: self
                .get_shelves()?
                .into_iter()
                .map(|s| CategoryInfo { name: s.name, collapsed: s.collapsed, color_accent: None })
                .collect(),
            search_history: vec![],
        };
        serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
    }

    pub fn import_raw_json(&self, json: &str) -> Result<bool, String> {
        let parsed: AppStateData = serde_json::from_str(json).map_err(|e| e.to_string())?;
        self.change_shelves(|shelves| {
            for category in &parsed.categories {
                shelves.ensure(&category.name);
                shelves.set_collapsed(&category.name, category.collapsed);
            }
            Ok(())
        })?;
        *self.notes.write().map_err(|e| e.to_string())? = parsed.notes.clone();
        for note in parsed.notes {
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
    /// Every .md / .txt file directly inside `dir` as a note, with how many files were looked at and
    /// how many could not be read.
    fn read_note_files(dir: &Path) -> (Vec<NoteItem>, usize, usize) {
        let mut notes = Vec::new();
        let (mut scanned, mut skipped) = (0usize, 0usize);
        for entry in fs::read_dir(dir).into_iter().flatten().flatten() {
            let path = entry.path();
            let is_note_file = path.is_file()
                && path
                    .extension()
                    .and_then(|s| s.to_str())
                    .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("txt"));
            if !is_note_file {
                continue;
            }
            scanned += 1;
            match Self::read_note_file(&path) {
                Some(note) => notes.push(note),
                None => skipped += 1,
            }
        }
        (notes, scanned, skipped)
    }

    /// The notes in `dir`, all filed on one shelf: a folder imports as a shelf.
    fn notes_for_shelf(dir: &Path, shelf: &str) -> (Vec<NoteItem>, usize, usize) {
        let (mut notes, scanned, skipped) = Self::read_note_files(dir);
        for note in &mut notes {
            note.category = shelf.to_string();
        }
        (notes, scanned, skipped)
    }

    /// Imports the .md / .txt files in `dir` as the shelf `shelf`, or, when that is empty, a shelf
    /// named after the folder. The shelf is created even when the folder holds no notes.
    pub fn import_folder_as_shelf(&self, dir: &str, shelf: Option<&str>) -> Result<FolderImport, String> {
        let dir = PathBuf::from(dir.trim());
        if !dir.is_dir() {
            return Err(format!("Directory does not exist: {}", dir.to_string_lossy()));
        }
        let shelf = shelf
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .or_else(|| dir.file_name().map(|n| n.to_string_lossy().trim().to_string()))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Imported".to_string());
        let (notes, total_scanned, skipped_count) = Self::notes_for_shelf(&dir, &shelf);
        self.create_shelf(&shelf)?;
        let imported_count = notes.len();
        for note in notes {
            self.upsert_note(note)?;
        }
        Ok(FolderImport {
            shelf,
            total_scanned,
            imported_count,
            skipped_count,
            notes: self.get_all_notes()?,
        })
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

        let (valid_notes, total_scanned, skipped_count) = Self::read_note_files(&target_dir);
        let imported_count = valid_notes.len();
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

/// `current` with every field named in `patch` replaced; `null` clears an optional field.
fn merge_settings(current: &AppSettings, patch: serde_json::Map<String, serde_json::Value>) -> Result<AppSettings, String> {
    let mut fields = match serde_json::to_value(current).map_err(|e| e.to_string())? {
        serde_json::Value::Object(map) => map,
        _ => return Err("settings are not an object".to_string()),
    };
    fields.extend(patch);
    serde_json::from_value(serde_json::Value::Object(fields)).map_err(|e| format!("Invalid settings: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{merge_settings, StorageManager};
    use crate::models::AppSettings;

    #[test]
    fn a_settings_patch_changes_only_the_fields_it_names() {
        let mut current = AppSettings::default();
        current.is_maximized = true;
        current.shelf_order = Some(vec!["Work".into()]);
        let patch = |json: &str| serde_json::from_str(json).unwrap();

        // Two windows each saving their own field: both survive, and backend-owned fields stay put.
        let once = merge_settings(&current, patch(r#"{"category_icons":{"work":"briefcase"}}"#)).unwrap();
        let twice = merge_settings(&once, patch(r#"{"design":"modern"}"#)).unwrap();
        assert_eq!(twice.shelf_order, Some(vec!["Work".to_string()]));
        assert_eq!(twice.category_icons.unwrap().get("work").map(String::as_str), Some("briefcase"));
        assert_eq!(twice.design.as_deref(), Some("modern"));
        assert!(twice.is_maximized);

        assert!(merge_settings(&current, patch(r#"{"is_maximized":"yes"}"#)).is_err());
    }

    #[test]
    fn a_folder_imports_as_one_shelf_whatever_its_files_say() {
        let dir = std::env::temp_dir().join(format!("doit-shelf-import-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("plain.md"), "# Plain\nno front matter").unwrap();
        // A file DoIT exported from another shelf still lands on the folder's shelf.
        std::fs::write(dir.join("Work - Plan - 2026-11-07 - 0.md"), "---\ncategory: \"Work\"\n---\nship it").unwrap();
        std::fs::write(dir.join("todo.txt"), "- [ ] call").unwrap();
        std::fs::write(dir.join("photo.png"), [0u8, 1, 2]).unwrap();

        let (notes, scanned, skipped) = StorageManager::notes_for_shelf(&dir, "Recipes");
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!((scanned, skipped, notes.len()), (3, 0, 3));
        assert!(notes.iter().all(|n| n.category == "Recipes"));
    }
}
