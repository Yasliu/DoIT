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
    /// Source file format: "md" (default) or "txt"
    #[serde(default)]
    pub format: Option<String>,
    /// Absolute path when the note is an external file opened in place (never copied into the repository)
    #[serde(default)]
    pub source_path: Option<String>,
    /// Verbatim YAML frontmatter of an external .md file, re-written untouched on save
    #[serde(default)]
    pub external_header: Option<String>,
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
    #[serde(default = "default_hotkey_h1")]
    pub hotkey_h1: String,
    #[serde(default = "default_hotkey_h2")]
    pub hotkey_h2: String,
    #[serde(default = "default_hotkey_h3")]
    pub hotkey_h3: String,
    #[serde(default = "default_hotkey_bold")]
    pub hotkey_bold: String,
    #[serde(default = "default_hotkey_italic")]
    pub hotkey_italic: String,
    #[serde(default = "default_hotkey_table")]
    pub hotkey_table: String,
    #[serde(default = "default_hotkey_table_col")]
    pub hotkey_table_col: String,
    #[serde(default = "default_hotkey_table_row")]
    pub hotkey_table_row: String,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default)]
    pub is_maximized: bool,
}

fn default_hotkey_open_file() -> String {
    "Ctrl+O".to_string()
}

fn default_hotkey_h1() -> String {
    "Ctrl+1".to_string()
}
fn default_hotkey_h2() -> String {
    "Ctrl+2".to_string()
}
fn default_hotkey_h3() -> String {
    "Ctrl+3".to_string()
}
fn default_hotkey_bold() -> String {
    "Ctrl+B".to_string()
}
fn default_hotkey_italic() -> String {
    "Ctrl+I".to_string()
}
fn default_hotkey_table() -> String {
    "Ctrl+T".to_string()
}

fn default_hotkey_table_col() -> String {
    "Ctrl+Alt+ArrowRight".to_string()
}
fn default_hotkey_table_row() -> String {
    "Ctrl+Alt+ArrowDown".to_string()
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
            hotkey_h1: default_hotkey_h1(),
            hotkey_h2: default_hotkey_h2(),
            hotkey_h3: default_hotkey_h3(),
            hotkey_bold: default_hotkey_bold(),
            hotkey_italic: default_hotkey_italic(),
            hotkey_table: default_hotkey_table(),
            hotkey_table_col: default_hotkey_table_col(),
            hotkey_table_row: default_hotkey_table_row(),
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

/// Parses "- [ ] text" / "- [x] text" (also the bare "- [ ]" an empty checklist item is written as).
fn parse_todo_line(trimmed: &str) -> Option<(bool, String)> {
    for (prefix, completed) in [("- [x]", true), ("- [X]", true), ("- [ ]", false)] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            if rest.is_empty() {
                return Some((completed, String::new()));
            }
            if let Some(text) = rest.strip_prefix(' ') {
                return Some((completed, text.to_string()));
            }
        }
    }
    None
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
pub fn compute_note_filename(
    category: &str,
    title: &str,
    timestamp: i64,
    repeated_num: usize,
    ext: &str,
) -> String {
    let md = compute_markdown_filename(category, title, timestamp, repeated_num);
    if ext == "md" {
        md
    } else {
        format!("{}.{ext}", md.trim_end_matches(".md"))
    }
}

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
        let order_val = self.grid_coordinates.x as i64;
        let date_str = format_date(self.last_edited);

        let cat_clean = clean_yaml_scalar(&self.category);
        let title_clean = clean_yaml_scalar(&self.title);

        let mut md = String::new();
        md.push_str("---\n");
        md.push_str(&format!("id: \"{}\"\n", self.id));
        md.push_str(&format!("category: \"{}\"\n", cat_clean.replace('\n', " ")));
        md.push_str(&format!("date: \"{}\"\n", date_str));
        md.push_str(&format!("order: {}\n", order_val));
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

    /// Universal ingestion: accepts ANY .md / .txt document (plain markdown, Jekyll posts, notepad text,
    /// DoIT notes, broken files). No signature or required keys; optional frontmatter is read leniently.
    pub fn from_file(content: &str, file_stem: &str, ext: &str, modified_ms: i64) -> Self {
        Self::parse_generic_document(content, file_stem, &ext.to_ascii_lowercase(), modified_ms)
    }

    pub fn parse_generic_document(content: &str, file_stem: &str, ext: &str, modified_ms: i64) -> Self {
        let all: Vec<&str> = content.lines().collect();
        let mut fm: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        let mut body_idx = 0usize;
        if ext == "md" && all.first().map(|l| l.trim()) == Some("---") {
            if let Some(end) = all.iter().skip(1).take(60).position(|l| l.trim() == "---") {
                for l in &all[1..=end] {
                    if let Some((k, v)) = l.trim().split_once(':') {
                        fm.insert(k.trim().to_lowercase(), clean_yaml_scalar(v));
                    }
                }
                body_idx = end + 2;
            }
        }

        let body = sanitize_markdown_body(&all[body_idx.min(all.len())..].join("\n"));
        let mut body_lines: Vec<&str> = body.lines().collect();
        while body_lines.first().map(|l| l.trim().is_empty()).unwrap_or(false) {
            body_lines.remove(0);
        }
        while body_lines.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
            body_lines.pop();
        }

        let from_name = split_note_filename(file_stem);
        let heading = body_lines
            .iter()
            .find_map(|l| l.trim().strip_prefix("# ").map(|h| h.trim().to_string()))
            .filter(|h| !h.is_empty());

        let title = fm
            .get("title")
            .cloned()
            .filter(|s| !s.is_empty())
            .or_else(|| from_name.as_ref().map(|(_, t)| t.clone()))
            .or(heading)
            .unwrap_or_else(|| file_stem.to_string());
        let category = fm
            .get("category")
            .cloned()
            .filter(|s| !s.is_empty())
            .or_else(|| from_name.as_ref().map(|(c, _)| c.clone()))
            .unwrap_or_else(|| "Uncategorized".to_string());
        let id = fm
            .get("id")
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("{ext}_{}", fnv_hex(file_stem)));
        let last_edited = fm
            .get("last_edited")
            .and_then(|s| s.parse::<i64>().ok())
            .filter(|n| *n > 0)
            .unwrap_or(if modified_ms > 0 { modified_ms } else { now_ms() });
        let order = fm.get("order").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);

        // Mixed document: "- [ ]" / "- [x]" lines are tasks wherever they appear, everything else is text.
        // (A legacy `type: checkbox` key is ignored: it no longer forces other lines into tasks.)
        let mut content_items: Vec<ContentItem> = Vec::new();
        for (idx, line) in body_lines.iter().enumerate() {
            if let Some((completed, text)) = parse_todo_line(line.trim()) {
                content_items.push(ContentItem { id: format!("item_{idx}"), text, is_todo: true, completed });
            } else {
                content_items.push(ContentItem {
                    id: format!("item_{idx}"),
                    text: line.trim_end().to_string(),
                    is_todo: false,
                    completed: false,
                });
            }
        }
        if content_items.is_empty() {
            content_items.push(ContentItem { id: "item_0".to_string(), text: String::new(), is_todo: false, completed: false });
        }

        let flag = |key: &str| fm.get(key).map(|s| s.eq_ignore_ascii_case("true")).unwrap_or(false);

        // Media URLs use a "|||" delimiter so base64 data URIs survive intact
        let mut media_urls: Vec<String> = Vec::new();
        if let Some(raw) = fm.get("media_urls").filter(|s| !s.is_empty()) {
            let parts: Vec<&str> = if raw.contains("|||") {
                raw.split("|||").collect()
            } else if raw.contains("data:") {
                vec![raw.as_str()]
            } else {
                raw.split(',').collect()
            };
            for u in parts {
                let u = clean_yaml_scalar(u);
                if !u.is_empty() && !media_urls.contains(&u) {
                    media_urls.push(u);
                }
            }
        }
        if let Some(single) = fm.get("media_url").filter(|s| !s.is_empty()) {
            if !media_urls.contains(single) {
                media_urls.insert(0, single.clone());
            }
        }
        let media_url = media_urls.first().cloned();

        NoteItem {
            id,
            title,
            content: content_items,
            category,
            last_edited,
            grid_coordinates: GridCoordinates { x: order, y: 0.0, w: 320.0, h: 220.0 },
            font_family: Some(fm.get("font_family").cloned().filter(|s| !s.is_empty()).unwrap_or_else(|| "Instrument Sans".to_string())),
            is_bold: Some(flag("is_bold")),
            is_italic: Some(flag("is_italic")),
            media_url,
            media_urls,
            is_collapsed: Some(false),
            is_pinned: Some(flag("is_pinned")),
            format: Some(ext.to_string()),
            source_path: None,
            external_header: None,
        }
    }

    /// Opens an arbitrary .md/.txt file in place: nothing is copied, the path travels with the note.
    pub fn from_external_file(content: &str, path: &str, modified_ms: i64) -> Self {
        let p = std::path::Path::new(path);
        let raw_ext = p.extension().and_then(|e| e.to_str()).unwrap_or("txt").to_ascii_lowercase();
        let ext = if raw_ext == "md" || raw_ext == "markdown" { "md" } else { "txt" };
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
        let mut note = Self::parse_generic_document(content, stem, ext, modified_ms);

        let all: Vec<&str> = content.lines().collect();
        let mut header = None;
        if ext == "md" && all.first().map(|l| l.trim()) == Some("---") {
            if let Some(end) = all.iter().skip(1).take(60).position(|l| l.trim() == "---") {
                header = Some(all[..=end + 1].join("\n"));
            }
        }
        note.id = format!("ext_{}", fnv_hex(path));
        note.source_path = Some(path.to_string());
        note.external_header = header;
        note
    }

    /// Text written back to an external file: original frontmatter untouched + the edited body
    pub fn to_external_text(&self) -> String {
        let body = self.to_plain_text();
        match (&self.external_header, self.file_extension()) {
            (Some(h), "md") => format!("{h}\n\n{body}"),
            _ => body,
        }
    }

    /// Plain-text serialisation used for .txt notes (no frontmatter)
    pub fn to_plain_text(&self) -> String {
        let mut out = String::new();
        for item in &self.content {
            if item.is_todo {
                let mark = if item.completed { "x" } else { " " };
                out.push_str(&format!("- [{mark}] {}\n", item.text));
            } else {
                out.push_str(&format!("{}\n", item.text));
            }
        }
        out
    }

    pub fn file_extension(&self) -> &'static str {
        if self.format.as_deref().map(|f| f.eq_ignore_ascii_case("txt")).unwrap_or(false) {
            "txt"
        } else {
            "md"
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn fnv_hex(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

/// Recovers "Category - Title - 2026-10-31 - 0" style names written by DoIT
fn split_note_filename(stem: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = stem.split(" - ").collect();
    if parts.len() >= 4 {
        let n = parts.len();
        let date = parts[n - 2].trim();
        let date_ok = date.len() == 10 && date.chars().filter(|c| *c == '-').count() == 2;
        if date_ok && parts[n - 1].trim().parse::<usize>().is_ok() {
            let category = parts[0].trim().to_string();
            let title = parts[1..n - 2].join(" - ").trim().to_string();
            if !category.is_empty() && !title.is_empty() {
                return Some((category, title));
            }
        }
    }
    None
}

/// Defensive Markdown AST pass (pulldown-cmark). Corrupted / binary-ish text is wrapped in a fenced
/// code block (rendered as an isolated monospace block); unterminated fences are closed so one broken
/// token can never swallow or distort the rest of the note.
pub fn sanitize_markdown_body(body: &str) -> String {
    use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag};

    let is_bad = |c: char| c == '\u{FFFD}' || (c.is_control() && !matches!(c, '\n' | '\r' | '\t'));
    if body.chars().any(is_bad) {
        let cleaned: String = body.chars().map(|c| if is_bad(c) { ' ' } else { c }).collect();
        let fence = if cleaned.contains("```") { "~~~~" } else { "```" };
        return format!("{fence}text\n{}\n{fence}", cleaned.trim_end());
    }

    let opts = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let mut dangling: Option<char> = None;
    for (event, range) in Parser::new_ext(body, opts).into_offset_iter() {
        if let Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(_))) = event {
            let block = body[range].trim_end();
            let opener = block.lines().next().unwrap_or("").trim();
            let marker = opener.chars().next().unwrap_or('`');
            let last = block.lines().last().unwrap_or("").trim();
            let closed = block.lines().count() > 1 && last.len() >= 3 && last.chars().all(|c| c == marker);
            if !closed {
                dangling = Some(marker);
            }
        }
    }
    match dangling {
        Some(marker) => format!("{body}\n{}", marker.to_string().repeat(3)),
        None => body.to_string(),
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
            format: None,
            source_path: None,
            external_header: None,
        };

        let md = note.to_markdown(0);
        assert!(md.starts_with("---\n"));
        assert!(!md.contains("app:") && !md.contains("version:"));
        assert!(md.contains("id: \"test-note-1\"\n"));
        assert!(md.contains("category: \"Architecture\"\n"));
        assert!(md.contains("order: 3\n"));
        assert!(!md.contains("type:"));
    }

    #[test]
    fn test_universal_ingestion_accepts_non_doit_markdown() {
        let jekyll = "---\ntitle: Standard Jekyll Post\ndate: 2026-10-29\n---\nHello world from standard markdown\n";
        let note = NoteItem::from_file(jekyll, "jekyll-post", "md", 0);
        assert_eq!(note.title, "Standard Jekyll Post");
        assert_eq!(note.content[0].text, "Hello world from standard markdown");
        assert_eq!(note.format.as_deref(), Some("md"));
    }

    #[test]
    fn test_mixed_tasks_and_text_roundtrip() {
        let doc = "# Plan\n\nSome paragraph\n- [ ] first task\n- [x] done task\nmore text\n";
        let note = NoteItem::from_file(doc, "mixed", "md", 0);
        let todos: Vec<_> = note.content.iter().filter(|c| c.is_todo).collect();
        assert_eq!(todos.len(), 2);
        assert!(todos[1].completed);
        assert!(note.content.iter().any(|c| !c.is_todo && c.text == "Some paragraph"));
        let md = note.to_markdown(0);
        assert!(md.contains("- [ ] first task\n") && md.contains("- [x] done task\n") && md.contains("more text\n"));
        let again = NoteItem::from_file(&md, "mixed", "md", 0);
        assert_eq!(again.content.iter().filter(|c| c.is_todo).count(), 2);
        assert!(again.content.iter().any(|c| !c.is_todo && c.text == "more text"));
    }
    #[test]
    fn test_txt_and_corrupt_input_never_rejected() {
        let txt = NoteItem::from_file("line one\nline two", "Groceries", "txt", 5);
        assert_eq!(txt.title, "Groceries");
        assert_eq!(txt.content.len(), 2);
        assert_eq!(txt.file_extension(), "txt");

        let broken = NoteItem::from_file("ok\u{0}\u{1}garbage", "bad", "md", 0);
        assert!(broken.content[0].text.starts_with("```"));

        let dangling = sanitize_markdown_body("# T\n```rust\nfn main() {}\n");
        assert!(dangling.trim_end().ends_with("```"));
    }
    #[test]
    fn test_overlong_frontmatter_is_just_body_text() {
        let mut doc = String::from("---\n");
        for i in 0..65 {
            doc.push_str(&format!("field_{i}: value\n"));
        }
        doc.push_str("---\nbody\n");
        let note = NoteItem::from_file(&doc, "long", "md", 0);
        assert!(!note.content.is_empty());
    }

    #[test]
    fn test_metadata_roundtrip_without_legacy_keys() {
        let doc = r#"---
id: "note-portability-1"
category: "Projects"
date: "2026-10-29"
order: 4
type: "text"
title: "Portability Test"
media_urls: "data:image/png;base64,abc|||data:image/png;base64,def"
---

This is content.
"#;
        let note = NoteItem::from_file(doc, "fallback", "md", 0);
        assert_eq!(note.id, "note-portability-1");
        assert_eq!(note.title, "Portability Test");
        assert_eq!(note.category, "Projects");
        assert_eq!(note.grid_coordinates.x, 4.0);
        assert_eq!(note.media_urls.len(), 2);
        assert!(!note.to_markdown(0).contains("app:"));
    }
    #[test]
    fn test_external_file_keeps_path_and_header() {
        let doc = "---\ntitle: Hello\ncustom: yes\n---\n\nBody line\n- [ ] task\n";
        let note = NoteItem::from_external_file(doc, "C:\\Users\\me\\Desktop\\hello.md", 5);
        assert_eq!(note.source_path.as_deref(), Some("C:\\Users\\me\\Desktop\\hello.md"));
        assert!(note.id.starts_with("ext_"));
        let out = note.to_external_text();
        assert!(out.starts_with("---\ntitle: Hello\ncustom: yes\n---\n\nBody line\n- [ ] task"));
    }
}