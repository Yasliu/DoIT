//! Writes note files on one background thread, in the order the edits happened.
//!
//! Each note has at most one pending job. A newer save of a note that is still waiting replaces
//! the waiting one, so a burst of edits (typing a title renames the file on every save) costs one
//! write, and an older version can never land on disk after a newer one.

use std::collections::{HashMap, VecDeque};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};

pub struct NoteWriter {
    shared: Arc<Shared>,
}

impl NoteWriter {
    pub fn new() -> Self {
        let shared = Arc::new(Shared::default());
        let worker = shared.clone();
        std::thread::Builder::new()
            .name("doit-notes".into())
            .spawn(move || worker.run())
            .expect("note writer thread");
        Self { shared }
    }

    /// Writes the note `id` to `path`, then removes `previous` (its old file name) if that differs.
    pub fn write(&self, id: &str, path: PathBuf, content: String, previous: Option<PathBuf>) {
        self.shared.enqueue(id, previous, Some((path, content)));
    }

    /// Removes the note `id`, whose file is `path`.
    pub fn delete(&self, id: &str, path: PathBuf) {
        self.shared.enqueue(id, Some(path), None);
    }

    /// Blocks until every queued job is on disk.
    pub fn flush(&self) {
        let mut queue = self.shared.lock();
        while !queue.order.is_empty() || queue.busy {
            queue = self.shared.wake.wait(queue).unwrap_or_else(|e| e.into_inner());
        }
    }
}

#[derive(Default)]
struct Shared {
    queue: Mutex<Queue>,
    wake: Condvar,
}

#[derive(Default)]
struct Queue {
    order: VecDeque<String>,
    pending: HashMap<String, Job>,
    busy: bool,
}

struct Job {
    /// The note's file as it is on disk now; removed once the new state is written.
    on_disk: Option<PathBuf>,
    /// Where the note goes and what it says; `None` deletes it.
    target: Option<(PathBuf, String)>,
}

impl Shared {
    fn lock(&self) -> MutexGuard<'_, Queue> {
        self.queue.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn enqueue(&self, id: &str, on_disk: Option<PathBuf>, target: Option<(PathBuf, String)>) {
        let mut queue = self.lock();
        match queue.pending.get_mut(id) {
            // The waiting job never reached the disk, so its `on_disk` is still the real file.
            Some(waiting) => waiting.target = target,
            None => {
                queue.pending.insert(id.to_string(), Job { on_disk, target });
                queue.order.push_back(id.to_string());
            }
        }
        self.wake.notify_all();
    }

    fn run(&self) {
        loop {
            let job = {
                let mut queue = self.lock();
                loop {
                    if let Some(id) = queue.order.pop_front() {
                        queue.busy = true;
                        break queue.pending.remove(&id);
                    }
                    queue = self.wake.wait(queue).unwrap_or_else(|e| e.into_inner());
                }
            };
            if let Some(job) = job {
                apply(job);
            }
            self.lock().busy = false;
            self.wake.notify_all();
        }
    }
}

fn apply(mut job: Job) {
    // A change of capitals only ("plan" to "Plan"): where the file system ignores case both names
    // are one file, and removing the old name afterwards would remove the note. Rename it instead.
    if let (Some(old), Some((new, _))) = (&job.on_disk, &job.target) {
        let lower = |path: &Path| path.to_string_lossy().to_lowercase();
        if old != new && lower(old) == lower(new) {
            let _ = fs::rename(old, new);
            job.on_disk = None;
        }
    }
    let written = match &job.target {
        Some((path, content)) => write_atomically(path, content).then_some(path.as_path()),
        None => None,
    };
    let Some(old) = job.on_disk else { return };
    // Keep the old file when the new one could not be written.
    let replaced = job.target.is_none() || written.is_some_and(|new| new != old);
    if replaced {
        let _ = fs::remove_file(old);
    }
}

fn write_atomically(path: &Path, content: &str) -> bool {
    let temp = path.with_extension("tmp");
    let Ok(mut file) = File::create(&temp) else { return false };
    if file.write_all(content.as_bytes()).is_err() {
        return false;
    }
    let _ = file.sync_all();
    drop(file);
    fs::rename(&temp, path).is_ok()
}

#[cfg(test)]
mod tests {
    use super::NoteWriter;

    #[test]
    fn a_burst_of_renames_leaves_one_file_with_the_latest_text() {
        let dir = std::env::temp_dir().join(format!("doit-writer-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = |name: &str| dir.join(name);
        let writer = NoteWriter::new();

        writer.write("n1", file("Pl.md"), "v1".into(), None);
        writer.flush();
        // Typing a title renames the note on every save; none of the old names may survive.
        writer.write("n1", file("Pla.md"), "v2".into(), Some(file("Pl.md")));
        writer.write("n1", file("Plan.md"), "v3".into(), Some(file("Pla.md")));
        writer.write("n2", file("Other.md"), "x".into(), None);
        writer.delete("n2", file("Other.md"));
        writer.flush();

        let mut names: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().into_string().unwrap()).collect();
        names.sort();
        let text = std::fs::read_to_string(file("Plan.md")).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(names, ["Plan.md"]);
        assert_eq!(text, "v3");
    }
}
