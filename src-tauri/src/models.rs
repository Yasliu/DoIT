use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridCoordinates {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Default for GridCoordinates {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            w: 320.0,
            h: 220.0,
        }
    }
}

/// Unified content element supporting regular text lines, lists, and checkboxes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentItem {
    pub id: String,
    pub text: String,
    pub is_todo: bool,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteItem {
    pub id: String,
    pub title: String,
    /// Mixed string arrays/items for checkboxes and lists
    pub content: Vec<ContentItem>,
    pub category: String,
    /// Timestamp in milliseconds
    pub last_edited: i64,
    pub grid_coordinates: GridCoordinates,
    #[serde(default)]
    pub font_family: Option<String>,
    #[serde(default)]
    pub is_bold: Option<bool>,
    #[serde(default)]
    pub is_italic: Option<bool>,
    #[serde(default)]
    pub media_url: Option<String>,
    #[serde(default)]
    pub media_urls: Vec<String>,
    #[serde(default)]
    pub is_collapsed: Option<bool>,
    #[serde(default)]
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryInfo {
    pub name: String,
    pub collapsed: bool,
    #[serde(default)]
    pub color_accent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub storage_path: String,
    pub hotkey_new_note: String,
    pub hotkey_toggle_tray: String,
    pub hotkey_search: String,
    pub hotkey_settings: String,
    #[serde(default = "default_hotkey_open_file")]
    pub hotkey_open_file: String,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default)]
    pub is_maximized: bool,
}

fn default_hotkey_open_file() -> String {
    "Ctrl+O".to_string()
}

fn default_theme_mode() -> String {
    "glass".to_string()
}

pub fn default_note_storage_path() -> String {
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        let mut p = std::path::PathBuf::from(profile);
        p.push("Documents");
        p.push("DoIT");
        p.push("Notes");
        p.to_string_lossy().to_string()
    } else if let Some(home) = std::env::var_os("HOME") {
        let mut p = std::path::PathBuf::from(home);
        p.push("Documents");
        p.push("DoIT");
        p.push("Notes");
        p.to_string_lossy().to_string()
    } else if let Some(app_data) = std::env::var_os("APPDATA") {
        let mut p = std::path::PathBuf::from(app_data);
        p.push("DoIT");
        p.push("Notes");
        p.to_string_lossy().to_string()
    } else {
        "./DoIT/Notes".to_string()
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            storage_path: default_note_storage_path(),
            hotkey_new_note: "Ctrl+N".to_string(),
            hotkey_toggle_tray: "Ctrl+J".to_string(),
            hotkey_search: "Ctrl+F".to_string(),
            hotkey_settings: "Ctrl+,".to_string(),
            hotkey_open_file: "Ctrl+O".to_string(),
            theme_mode: "glass".to_string(),
            is_maximized: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStateData {
    pub notes: Vec<NoteItem>,
    pub categories: Vec<CategoryInfo>,
    pub search_history: Vec<String>,
}

pub fn format_date(timestamp_ms: i64) -> String {
    let secs = if timestamp_ms <= 0 { 0 } else { timestamp_ms / 1000 };
    let days = secs / 86400;
    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!("{year:04}-{m:02}-{d:02}")
}

pub fn clean_yaml_scalar(s: &str) -> String {
    let mut val = s.trim();
    let unescaped = val.replace("\\\"", "").replace("\\\\", "").replace('\\', "");
    val = unescaped.trim();
    for _ in 0..10 {
        let prev = val;
        val = val.trim();
        while (val.starts_with('"') && val.ends_with('"') && val.len() >= 2)
            || (val.starts_with('\'') && val.ends_with('\'') && val.len() >= 2)
        {
            val = val[1..val.len() - 1].trim();
        }
        val = val.trim_matches(|c| c == '"' || c == '\'' || c == '\\');
        if val == prev {
            break;
        }
    }
    val.trim_matches(|c| c == '"' || c == '\'' || c == '\\').to_string()
}
pub fn sanitize_filename(name: &str) -> String {
    let cleaned_name = clean_yaml_scalar(name);
    let mut clean = String::new();
    for c in cleaned_name.chars() {
        if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\n' | '\r') {
            clean.push('_');
        } else {
            clean.push(c);
        }
    }
    let trimmed = clean.trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Strict structural naming pattern:
/// Category_Name - Title - Date - Repeated_Title_Num.md
pub fn compute_markdown_filename(
    category: &str,
    title: &str,
    timestamp: i64,
    repeated_num: usize,
) -> String {
    let cat_clean = sanitize_filename(if category.trim().is_empty() { "Uncategorized" } else { category.trim() });
    let title_clean = sanitize_filename(if title.trim().is_empty() { "Untitled" } else { title.trim() });
    let date_str = format_date(timestamp);
    format!("{cat_clean} - {title_clean} - {date_str} - {repeated_num}.md")
}

pub const MAX_FILE_SIZE_BYTES: u64 = 30 * 1024 * 1024; // 30 MB

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanSummary {
    pub total_scanned: usize,
    pub imported_count: usize,
    pub skipped_count: usize,
    pub imported_notes: Vec<NoteItem>,
}

impl NoteItem {
    pub fn to_markdown(&self, repeated_num: usize) -> String {
        let is_checkbox = self.content.iter().any(|c| c.is_todo);
        let note_type = if is_checkbox { "checkbox" } else { "text" };
        let order_val = self.grid_coordinates.x as i64;
        let date_str = format_date(self.last_edited);

        let cat_clean = clean_yaml_scalar(&self.category);
        let title_clean = clean_yaml_scalar(&self.title);

        let mut md = String::new();
        md.push_str("---\n");
        md.push_str("app: \"DoIT\"\n");
        md.push_str("version: \"1.0.0\"\n");
        md.push_str(&format!("id: \"{}\"\n", self.id));
        md.push_str(&format!("category: \"{}\"\n", cat_clean.replace('\n', " ")));
        md.push_str(&format!("date: \"{}\"\n", date_str));
        md.push_str(&format!("order: {}\n", order_val));
        md.push_str(&format!("type: \"{}\"\n", note_type));
        md.push_str(&format!("title: \"{}\"\n", title_clean.replace('\n', " ")));
        md.push_str(&format!("last_edited: {}\n", self.last_edited));
        md.push_str(&format!("repeated_num: {}\n", repeated_num));
        if let Some(ref font) = self.font_family {
            let font_clean = clean_yaml_scalar(font);
            md.push_str(&format!("font_family: \"{}\"\n", font_clean));
        }
        if let Some(bold) = self.is_bold {
            md.push_str(&format!("is_bold: {}\n", bold));
        }
        if let Some(italic) = self.is_italic {
            md.push_str(&format!("is_italic: {}\n", italic));
        }
        if let Some(pinned) = self.is_pinned {
            md.push_str(&format!("is_pinned: {}\n", pinned));
        }
        if !self.media_urls.is_empty() {
            let combined = self.media_urls.join("|||");
            md.push_str(&format!("media_urls: \"{}\"\n", combined));
            if let Some(first) = self.media_urls.first() {
                md.push_str(&format!("media_url: \"{}\"\n", first));
            }
        } else if let Some(ref media) = self.media_url {
            if !media.is_empty() {
                md.push_str(&format!("media_url: \"{}\"\n", media));
            }
        }
        md.push_str("---\n\n");

        for item in &self.content {
            if item.is_todo {
                let mark = if item.completed { "x" } else { " " };
                md.push_str(&format!("- [{mark}] {}\n", item.text));
            } else {
                md.push_str(&format!("{}\n", item.text));
            }
        }

        md
    }

    /// Strict parser and validator for DoIT Markdown notes with robust boundary checks
    pub fn parse_and_validate_doit_markdown(content: &str, fallback_id: &str) -> Result<Self, String> {
        let mut lines = content.lines();
        let first_line = lines.next().ok_or_else(|| "File is empty".to_string())?;

        // 1. Check opening delimiter
        if first_line.trim() != "---" {
            return Err("Invalid DoIT note: File must begin with '---' YAML frontmatter block.".to_string());
        }

        let mut frontmatter_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        let mut closed = false;
        let mut line_count = 1usize;

        // Bounded scanning: maximum 60 lines for frontmatter
        for line in lines.by_ref() {
            line_count += 1;
            if line_count > 60 {
                return Err("Invalid DoIT note: Frontmatter header exceeds boundary limit (maximum 60 lines without closing '---').".to_string());
            }

            let trimmed = line.trim();
            if trimmed == "---" {
                closed = true;
                break;
            }
            if let Some((k, v)) = trimmed.split_once(':') {
                let key = k.trim().to_lowercase();
                let mut val = v.trim();
                if (val.starts_with('"') && val.ends_with('"') && val.len() >= 2)
                    || (val.starts_with('\'') && val.ends_with('\'') && val.len() >= 2)
                {
                    val = &val[1..val.len() - 1];
                }
                frontmatter_map.insert(key, val.to_string());
            }
        }

        if !closed {
            return Err("Invalid DoIT note: Unclosed frontmatter block (missing terminating '---').".to_string());
        }

        // 2. Strict Validation Rule: File header must contain exactly app: "DoIT"
        let app_val = frontmatter_map.get("app").map(|s| s.as_str()).unwrap_or("");
        if app_val != "DoIT" {
            return Err(format!(
                "Invalid DoIT note format: Missing or invalid 'app' signature (expected 'app: \"DoIT\"', found '{app_val}')."
            ));
        }

        // 3. Validate version format: version must not be empty
        let version_val = frontmatter_map.get("version").map(|s| s.trim()).unwrap_or("");
        if version_val.is_empty() {
            return Err("Invalid DoIT note: Missing required 'version' field in header.".to_string());
        }

        // 4. Reject files missing critical identifiers: id and category must be non-empty strings
        let id = match frontmatter_map.get("id").map(|s| clean_yaml_scalar(s)).filter(|s| !s.is_empty()) {
            Some(val) => val,
            None => {
                if fallback_id.trim().is_empty() {
                    return Err("Invalid DoIT note: Missing required 'id' field in header.".to_string());
                }
                clean_yaml_scalar(fallback_id)
            }
        };

        let category = match frontmatter_map.get("category").map(|s| clean_yaml_scalar(s)).filter(|s| !s.is_empty()) {
            Some(val) => val,
            None => return Err("Invalid DoIT note: Missing required 'category' field in header.".to_string()),
        };

        // 5. Validate order: order must parse to a valid integer
        let order_val: i64 = match frontmatter_map.get("order") {
            Some(s) => match clean_yaml_scalar(s).parse::<i64>() {
                Ok(n) => n,
                Err(_) => return Err(format!("Invalid DoIT note: 'order' must be a valid integer, found '{s}'.")),
            },
            None => 0, // Fallback gracefully if order is omitted or default
        };

        // 6. Validate type: type must strictly be either "text" or "checkbox"
        let note_type = match frontmatter_map.get("type").map(|s| clean_yaml_scalar(s).to_lowercase()) {
            Some(ref t) if t == "text" || t == "checkbox" => t.clone(),
            Some(other) => return Err(format!("Invalid DoIT note: 'type' must be 'text' or 'checkbox', found '{other}'.")),
            None => "text".to_string(),
        };

        let title = frontmatter_map
            .get("title")
            .map(|s| clean_yaml_scalar(s))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| clean_yaml_scalar(fallback_id));

        let mut last_edited: i64 = frontmatter_map
            .get("last_edited")
            .and_then(|s| clean_yaml_scalar(s).parse().ok())
            .unwrap_or(0);

        if last_edited == 0 {
            last_edited = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
        }

        let font_family = frontmatter_map.get("font_family").map(|s| clean_yaml_scalar(s)).or_else(|| Some("Instrument Sans".to_string()));
        let is_bold = frontmatter_map.get("is_bold").map(|s| clean_yaml_scalar(s).eq_ignore_ascii_case("true")).or(Some(false));
        let is_italic = frontmatter_map.get("is_italic").map(|s| clean_yaml_scalar(s).eq_ignore_ascii_case("true")).or(Some(false));
        let is_pinned = frontmatter_map.get("is_pinned").map(|s| clean_yaml_scalar(s).eq_ignore_ascii_case("true")).or(Some(false));

        // Media URLs parsing (Uses strict '|||' delimiter to preserve base64 data URIs)
        let mut media_urls: Vec<String> = Vec::new();
        if let Some(urls_str) = frontmatter_map.get("media_urls").filter(|s| !s.trim().is_empty()) {
            let cleaned_urls = clean_yaml_scalar(urls_str);
            if cleaned_urls.contains("|||") {
                for u in cleaned_urls.split("|||") {
                    let trimmed = clean_yaml_scalar(u);
                    if !trimmed.is_empty() && !media_urls.contains(&trimmed) {
                        media_urls.push(trimmed);
                    }
                }
            } else if cleaned_urls.contains("data:") || cleaned_urls.contains(";base64,") {
                // Single base64 data URI must never be split on commas
                if !media_urls.contains(&cleaned_urls) {
                    media_urls.push(cleaned_urls);
                }
            } else {
                for u in cleaned_urls.split(',') {
                    let trimmed = clean_yaml_scalar(u);
                    if !trimmed.is_empty() && !media_urls.contains(&trimmed) {
                        media_urls.push(trimmed);
                    }
                }
            }
        }
        if let Some(single) = frontmatter_map.get("media_url").filter(|s| !s.trim().is_empty()) {
            let cleaned_single = clean_yaml_scalar(single);
            if !cleaned_single.is_empty() && !media_urls.contains(&cleaned_single) {
                media_urls.insert(0, cleaned_single);
            }
        }
        let media_url = media_urls.first().cloned();

        // 7. Parse content items literally to avoid injections
        // Skip leading empty lines right below the frontmatter block
        let mut content_items = Vec::new();
        let mut body_lines: Vec<&str> = lines.collect();
        while let Some(first) = body_lines.first() {
            if first.trim().is_empty() {
                body_lines.remove(0);
            } else {
                break;
            }
        }
        while let Some(last) = body_lines.last() {
            if last.trim().is_empty() {
                body_lines.pop();
            } else {
                break;
            }
        }
        while let Some(last) = body_lines.last() {
            if last.trim().is_empty() {
                body_lines.pop();
            } else {
                break;
            }
        }

        for (idx, line) in body_lines.into_iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with("- [x] ") || trimmed.starts_with("- [X] ") {
                content_items.push(ContentItem {
                    id: format!("item_{idx}"),
                    text: trimmed[6..].to_string(),
                    is_todo: true,
                    completed: true,
                });
            } else if trimmed.starts_with("- [ ] ") {
                content_items.push(ContentItem {
                    id: format!("item_{idx}"),
                    text: trimmed[6..].to_string(),
                    is_todo: true,
                    completed: false,
                });
            } else {
                if trimmed.is_empty() {
                    continue;
                }
                let is_todo = note_type == "checkbox";
                content_items.push(ContentItem {
                    id: format!("item_{idx}"),
                    text: line.to_string(),
                    is_todo,
                    completed: false,
                });
            }
        }

        if content_items.is_empty() {
            content_items.push(ContentItem {
                id: "item_0".to_string(),
                text: "".to_string(),
                is_todo: note_type == "checkbox",
                completed: false,
            });
        }

        Ok(NoteItem {
            id,
            title,
            content: content_items,
            category,
            last_edited,
            grid_coordinates: GridCoordinates {
                x: order_val as f64,
                y: 0.0,
                w: 320.0,
                h: 220.0,
            },
            font_family,
            is_bold,
            is_italic,
            media_url,
            media_urls,
            is_collapsed: Some(false),
            is_pinned,
        })
    }

    /// Backwards compatibility fallback for pre-existing markdown files
    fn parse_legacy_doit_markdown(content: &str, fallback_id: &str) -> Option<Self> {
        let mut id = fallback_id.to_string();
        let mut title = "Untitled".to_string();
        let mut category = "Uncategorized".to_string();
        let mut last_edited = 0i64;
        let mut font_family = Some("Instrument Sans".to_string());
        let mut is_bold = Some(false);
        let mut is_italic = Some(false);
        let mut is_pinned = Some(false);
        let mut media_url = None;
        let mut order_num = 0.0f64;

        let mut lines = content.lines();
        let mut body_lines = Vec::new();

        if let Some(first_line) = lines.next() {
            if first_line.trim() == "---" {
                for line in lines.by_ref() {
                    let trimmed = line.trim();
                    if trimmed == "---" {
                        break;
                    }
                    if let Some((k, v)) = trimmed.split_once(':') {
                        let key = k.trim();
                        let val = v.trim();
                        match key {
                            "id" => id = clean_yaml_scalar(val),
                            "title" => title = clean_yaml_scalar(val),
                            "category" => category = clean_yaml_scalar(val),
                            "last_edited" => last_edited = clean_yaml_scalar(val).parse().unwrap_or(0),
                            "font_family" => font_family = Some(clean_yaml_scalar(val)),
                            "is_bold" => is_bold = Some(clean_yaml_scalar(val).eq_ignore_ascii_case("true")),
                            "is_italic" => is_italic = Some(clean_yaml_scalar(val).eq_ignore_ascii_case("true")),
                            "is_pinned" => is_pinned = Some(clean_yaml_scalar(val).eq_ignore_ascii_case("true")),
                            "order" => order_num = clean_yaml_scalar(val).parse().unwrap_or(0.0),
                            "media_url" => {
                                let c = clean_yaml_scalar(val);
                                if !c.is_empty() { media_url = Some(c); }
                            },
                            _ => {}
                        }
                    }
                }
            } else {
                body_lines.push(first_line);
            }
        }

        for line in lines {
            body_lines.push(line);
        }

        while let Some(first) = body_lines.first() {
            if first.trim().is_empty() {
                body_lines.remove(0);
            } else {
                break;
            }
        }
        while let Some(last) = body_lines.last() {
            if last.trim().is_empty() {
                body_lines.pop();
            } else {
                break;
            }
        }

        let mut content_items = Vec::new();
        for (idx, line) in body_lines.into_iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with("- [x] ") || trimmed.starts_with("- [X] ") {
                content_items.push(ContentItem {
                    id: format!("item_{idx}"),
                    text: trimmed[6..].to_string(),
                    is_todo: true,
                    completed: true,
                });
            } else if trimmed.starts_with("- [ ] ") {
                content_items.push(ContentItem {
                    id: format!("item_{idx}"),
                    text: trimmed[6..].to_string(),
                    is_todo: true,
                    completed: false,
                });
            } else {
                if trimmed.is_empty() {
                    continue;
                }
                content_items.push(ContentItem {
                    id: format!("item_{idx}"),
                    text: line.to_string(),
                    is_todo: false,
                    completed: false,
                });
            }
        }

        if content_items.is_empty() {
            content_items.push(ContentItem {
                id: "item_0".to_string(),
                text: "".to_string(),
                is_todo: false,
                completed: false,
            });
        }

        if last_edited == 0 {
            last_edited = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
        }

        let media_urls = if let Some(ref m) = media_url {
            vec![m.clone()]
        } else {
            vec![]
        };

        Some(NoteItem {
            id,
            title,
            content: content_items,
            category,
            last_edited,
            grid_coordinates: GridCoordinates { x: order_num, y: 0.0, w: 320.0, h: 220.0 },
            font_family,
            is_bold,
            is_italic,
            media_url,
            media_urls,
            is_collapsed: Some(false),
            is_pinned,
        })
    }

    pub fn from_markdown(content: &str, fallback_id: &str) -> Option<Self> {
        Self::parse_and_validate_doit_markdown(content, fallback_id)
            .ok()
            .or_else(|| Self::parse_legacy_doit_markdown(content, fallback_id))
    }
}

impl Default for AppStateData {
    fn default() -> Self {
        Self {
            notes: vec![],
            categories: vec![
                CategoryInfo {
                    name: "Uncategorized".to_string(),
                    collapsed: false,
                    color_accent: Some("#ffffff".to_string()),
                },
            ],
            search_history: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strict_doit_frontmatter_generation() {
        let note = NoteItem {
            id: "test-note-1".to_string(),
            title: "Test Note".to_string(),
            content: vec![
                ContentItem {
                    id: "c1".to_string(),
                    text: "Check item".to_string(),
                    is_todo: true,
                    completed: false,
                },
            ],
            category: "Architecture".to_string(),
            last_edited: 1793290000000,
            grid_coordinates: GridCoordinates { x: 3.0, y: 0.0, w: 320.0, h: 220.0 },
            font_family: Some("Instrument Sans".to_string()),
            is_bold: Some(false),
            is_italic: Some(false),
            media_url: None,
            media_urls: vec![],
            is_collapsed: Some(false),
            is_pinned: Some(false),
        };

        let md = note.to_markdown(0);
        assert!(md.starts_with("---\n"));
        assert!(md.contains("app: \"DoIT\"\n"));
        assert!(md.contains("version: \"1.0.0\"\n"));
        assert!(md.contains("id: \"test-note-1\"\n"));
        assert!(md.contains("category: \"Architecture\"\n"));
        assert!(md.contains("order: 3\n"));
        assert!(md.contains("type: \"checkbox\"\n"));
    }

    #[test]
    fn test_strict_validation_rejects_non_doit_file() {
        let non_doit = r#"---
title: Standard Jekyll Post
date: 2026-10-29
---
Hello world from standard markdown
"#;
        let res = NoteItem::parse_and_validate_doit_markdown(non_doit, "fallback");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Missing or invalid 'app' signature"));
    }

    #[test]
    fn test_strict_validation_boundary_limits() {
        // Exceeds 60 lines before closing delimiter
        let mut excessive_lines = String::from("---\n");
        for i in 0..65 {
            excessive_lines.push_str(&format!("field_{i}: value\n"));
        }
        excessive_lines.push_str("---\nbody\n");
        let res = NoteItem::parse_and_validate_doit_markdown(&excessive_lines, "fallback");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("boundary limit"));
    }

    #[test]
    fn test_strict_validation_accepts_doit_file() {
        let doit_md = r#"---
app: "DoIT"
version: "1.0.0"
id: "note-portability-1"
category: "Projects"
date: "2026-10-29"
order: 4
type: "text"
title: "Portability Test"
media_urls: "data:image/png;base64,abc|||data:image/png;base64,def"
---

This is verified DoIT content.
"#;
        let res = NoteItem::parse_and_validate_doit_markdown(doit_md, "fallback");
        assert!(res.is_ok());
        let note = res.unwrap();
        assert_eq!(note.id, "note-portability-1");
        assert_eq!(note.title, "Portability Test");
        assert_eq!(note.category, "Projects");
        assert_eq!(note.grid_coordinates.x, 4.0);
        assert_eq!(note.media_urls.len(), 2);
    }
}
