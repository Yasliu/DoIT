//! Shelves: the named, ordered groups notes are filed on. A shelf exists on its own (an empty shelf
//! stays), keeps its icon and collapsed state, and "Uncategorized" always exists and always comes last.
//! Names compare case-insensitively.

use std::collections::HashMap;

pub use crate::models::Shelf;
use crate::models::clean_yaml_scalar;

pub const UNCATEGORIZED: &str = "Uncategorized";

impl Shelf {
    fn named(name: &str) -> Self {
        Self { name: name.to_string(), icon: None, collapsed: false }
    }
}

fn same(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

fn is_uncategorized(name: &str) -> bool {
    same(name, UNCATEGORIZED)
}

/// A shelf name as stored: cleaned of YAML quoting and surrounding space.
fn clean(name: &str) -> String {
    clean_yaml_scalar(name).trim().to_string()
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Shelves(Vec<Shelf>);

impl Shelves {
    /// The saved list, or (before shelves were saved) one built from the old order and icon
    /// settings; plus every shelf a note is filed on that the list does not know yet.
    pub fn load<'a>(
        saved: Option<Vec<Shelf>>,
        legacy_order: &[String],
        legacy_icons: &HashMap<String, String>,
        note_shelves: impl IntoIterator<Item = &'a str>,
    ) -> Self {
        let mut shelves = Self(Vec::new());
        let migrating = saved.is_none();
        for shelf in saved.unwrap_or_default() {
            shelves.add(Shelf { name: clean(&shelf.name), ..shelf });
        }
        if migrating {
            for name in legacy_order {
                shelves.add(Shelf::named(&clean(name)));
            }
        }
        let mut found: Vec<String> = note_shelves.into_iter().map(clean).filter(|n| !is_uncategorized(n)).collect();
        found.sort_by_key(|n| n.to_lowercase());
        for name in found {
            // A user-ordered list from before shelves were saved: the rest follow alphabetically.
            if migrating && !legacy_order.is_empty() {
                shelves.add(Shelf::named(&name));
            } else {
                shelves.ensure(&name);
            }
        }
        if migrating {
            for shelf in &mut shelves.0 {
                shelf.icon = legacy_icons.get(&shelf.name.to_lowercase()).cloned();
            }
        }
        shelves.keep_uncategorized_last();
        shelves
    }

    pub fn list(&self) -> &[Shelf] {
        &self.0
    }

    /// The stored spelling of `name`, if that shelf exists.
    pub fn find(&self, name: &str) -> Option<&str> {
        self.0.iter().find(|s| same(&s.name, name)).map(|s| s.name.as_str())
    }

    fn position(&self, name: &str) -> Option<usize> {
        self.0.iter().position(|s| same(&s.name, name))
    }

    fn add(&mut self, shelf: Shelf) {
        if !shelf.name.is_empty() && self.position(&shelf.name).is_none() {
            self.0.push(shelf);
        }
    }

    fn keep_uncategorized_last(&mut self) {
        let last = self.position(UNCATEGORIZED).map(|i| self.0.remove(i)).unwrap_or_else(|| Shelf::named(UNCATEGORIZED));
        self.0.push(last);
    }

    /// Adds the shelf `name` (a note was filed on it) unless it exists. New shelves keep the list
    /// alphabetical while the user has not reordered it, and go at the end once they have.
    /// Returns whether the list changed.
    pub fn ensure(&mut self, name: &str) -> bool {
        let name = clean(name);
        if name.is_empty() || self.position(&name).is_some() {
            return false;
        }
        let named: Vec<&str> = self.0.iter().map(|s| s.name.as_str()).filter(|n| !is_uncategorized(n)).collect();
        let alphabetical = named.windows(2).all(|w| w[0].to_lowercase() <= w[1].to_lowercase());
        let end = self.position(UNCATEGORIZED).unwrap_or(self.0.len());
        let at = if alphabetical {
            self.0[..end].iter().position(|s| s.name.to_lowercase() > name.to_lowercase()).unwrap_or(end)
        } else {
            end
        };
        self.0.insert(at, Shelf::named(&name));
        true
    }

    /// Creates an empty shelf. `Ok(false)` if it already exists.
    pub fn create(&mut self, name: &str) -> Result<bool, String> {
        if clean(name).is_empty() {
            return Err("Shelf name cannot be empty".to_string());
        }
        Ok(self.ensure(name))
    }

    /// Renames `old` (keeping its place, icon and collapsed state); returns the stored new name.
    pub fn rename(&mut self, old: &str, new: &str) -> Result<String, String> {
        if is_uncategorized(old) {
            return Err("The default Uncategorized shelf cannot be renamed".to_string());
        }
        let new = clean(new);
        if new.is_empty() {
            return Err("Shelf name cannot be empty".to_string());
        }
        if is_uncategorized(&new) {
            return Err("That name is reserved".to_string());
        }
        if !same(old, &new) && self.position(&new).is_some() {
            return Err("A shelf with that name already exists".to_string());
        }
        match self.position(old) {
            Some(i) => self.0[i].name = new.clone(),
            None => {
                self.ensure(&new);
            }
        }
        Ok(new)
    }

    pub fn delete(&mut self, name: &str) -> Result<(), String> {
        if is_uncategorized(name) {
            return Err("Cannot delete the default Uncategorized shelf".to_string());
        }
        self.0.retain(|s| !same(&s.name, name));
        Ok(())
    }

    /// Puts the named shelves first, in that order; the others keep their order after them.
    pub fn reorder(&mut self, names: &[String]) {
        let mut ordered: Vec<Shelf> = names.iter().filter_map(|n| self.position(n).map(|i| self.0[i].clone())).collect();
        ordered.dedup_by(|a, b| same(&a.name, &b.name));
        let rest: Vec<Shelf> = self.0.iter().filter(|s| !ordered.iter().any(|o| same(&o.name, &s.name))).cloned().collect();
        self.0 = ordered.into_iter().chain(rest).collect();
        self.keep_uncategorized_last();
    }

    /// Returns whether anything changed.
    pub fn set_icon(&mut self, name: &str, icon: Option<String>) -> bool {
        match self.position(name) {
            Some(i) if self.0[i].icon != icon => {
                self.0[i].icon = icon;
                true
            }
            _ => false,
        }
    }

    /// Returns whether anything changed.
    pub fn set_collapsed(&mut self, name: &str, collapsed: bool) -> bool {
        match self.position(name) {
            Some(i) if self.0[i].collapsed != collapsed => {
                self.0[i].collapsed = collapsed;
                true
            }
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(shelves: &Shelves) -> Vec<&str> {
        shelves.list().iter().map(|s| s.name.as_str()).collect()
    }

    #[test]
    fn an_empty_shelf_survives_a_restart_and_uncategorized_stays_last() {
        let mut shelves = Shelves::load(None, &[], &HashMap::new(), ["Work"]);
        shelves.create("Recipes").unwrap();
        shelves.set_collapsed("work", true);

        // What settings.json holds is what the next launch loads, even with no notes on Recipes.
        let reloaded = Shelves::load(Some(shelves.list().to_vec()), &[], &HashMap::new(), ["Work"]);
        assert_eq!(names(&reloaded), ["Recipes", "Work", UNCATEGORIZED]);
        assert!(reloaded.list()[1].collapsed);
    }

    #[test]
    fn the_old_order_and_icons_settings_migrate_once() {
        let icons = HashMap::from([("work".to_string(), "Briefcase".to_string())]);
        let shelves = Shelves::load(None, &["Work".into()], &icons, ["Uncategorized", "Ideas", "Work", "Art"]);
        assert_eq!(names(&shelves), ["Work", "Art", "Ideas", UNCATEGORIZED]);
        assert_eq!(shelves.list()[0].icon.as_deref(), Some("Briefcase"));
    }

    #[test]
    fn new_shelves_stay_alphabetical_until_the_user_reorders() {
        let mut shelves = Shelves::load(None, &[], &HashMap::new(), ["Alpha", "Delta"]);
        shelves.ensure("charlie");
        assert_eq!(names(&shelves), ["Alpha", "charlie", "Delta", UNCATEGORIZED]);

        shelves.reorder(&["Delta".into(), "Uncategorized".into(), "alpha".into()]);
        assert_eq!(names(&shelves), ["Delta", "Alpha", "charlie", UNCATEGORIZED]);
        shelves.ensure("Bravo");
        assert_eq!(names(&shelves), ["Delta", "Alpha", "charlie", "Bravo", UNCATEGORIZED]);
    }

    #[test]
    fn renaming_keeps_place_and_look_and_guards_reserved_or_taken_names() {
        let mut shelves = Shelves::load(None, &[], &HashMap::new(), ["Home", "Work"]);
        shelves.set_icon("Work", Some("Briefcase".into()));
        assert_eq!(shelves.rename("work", " Job ").unwrap(), "Job");
        assert_eq!(names(&shelves), ["Home", "Job", UNCATEGORIZED]);
        assert_eq!(shelves.list()[1].icon.as_deref(), Some("Briefcase"));

        assert!(shelves.rename("Job", "home").is_err());
        assert!(shelves.rename("Job", "uncategorized").is_err());
        assert!(shelves.rename(UNCATEGORIZED, "Inbox").is_err());
        assert!(shelves.delete(UNCATEGORIZED).is_err());
    }
}
