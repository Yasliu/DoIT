//! Images pasted into notes, kept as files in `<notes>/assets/` and named after their content. A note
//! holds only a short relative link, so its text stays small wherever it is copied (editor, undo
//! history, IPC, memory) and the same image pasted twice is stored once.

use std::fs;
use std::path::Path;

use crate::models::MAX_FILE_SIZE_BYTES;

const DIR: &str = "assets";

/// Stores `bytes` in `notes_dir` and returns the path a note should link to, relative to `notes_dir`.
pub fn save(notes_dir: &Path, bytes: &[u8], mime: &str) -> Result<String, String> {
    if bytes.len() as u64 > MAX_FILE_SIZE_BYTES {
        return Err("Image is larger than the 30 MB limit.".to_string());
    }
    let extension = extension_for(mime).ok_or_else(|| format!("Not a supported image type: {mime}"))?;
    let dir = notes_dir.join(DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create the assets folder: {e}"))?;

    let hash = content_hash(bytes);
    // Different images sharing a hash must not overwrite each other, however unlikely that is.
    let name = (0u32..)
        .map(|n| if n == 0 { format!("{hash:016x}.{extension}") } else { format!("{hash:016x}-{n}.{extension}") })
        .find(|name| fs::read(dir.join(name)).map_or(true, |existing| existing == bytes))
        .expect("an unused name exists");

    let target = dir.join(&name);
    if !target.exists() {
        let temp = target.with_extension("tmp");
        fs::write(&temp, bytes).map_err(|e| format!("Cannot write the image: {e}"))?;
        fs::rename(&temp, &target).map_err(|e| format!("Cannot finalise the image: {e}"))?;
    }
    Ok(format!("{DIR}/{name}"))
}

fn extension_for(mime: &str) -> Option<&'static str> {
    match mime {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/bmp" => Some("bmp"),
        "image/avif" => Some("avif"),
        "image/svg+xml" => Some("svg"),
        _ => None,
    }
}

/// FNV-1a: stable across Rust versions, so an image keeps its name from one build to the next.
fn content_hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ *byte as u64).wrapping_mul(0x0000_0100_0000_01b3))
}

#[cfg(test)]
mod tests {
    use super::save;

    #[test]
    fn the_same_image_is_stored_once_and_other_types_are_refused() {
        let dir = std::env::temp_dir().join(format!("doit-attachments-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let first = save(&dir, b"pixels", "image/png").unwrap();
        assert!(first.starts_with("assets/") && first.ends_with(".png"), "{first}");
        assert_eq!(save(&dir, b"pixels", "image/png").unwrap(), first);
        assert_ne!(save(&dir, b"other pixels", "image/png").unwrap(), first);
        assert_eq!(std::fs::read(dir.join(&first)).unwrap(), b"pixels");
        assert!(save(&dir, b"text", "text/plain").is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
