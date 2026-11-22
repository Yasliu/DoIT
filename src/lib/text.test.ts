import { describe, expect, it } from "vitest";
import type { NoteItem } from "../api/tauriBridge";
import { titleMatches } from "./text";

const note = (title: string, body: string) =>
  ({ title, category: "Work", content: [{ id: "1", text: body, is_todo: false, completed: false }] }) as unknown as NoteItem;

describe("titleMatches", () => {
  it("finds a note by its title, in any case", () => {
    expect(titleMatches(note("Git tricks", ""), "git")).toBe(true);
    expect(titleMatches(note("Notes", ""), "  GIT ")).toBe(false);
  });

  it("does not bring up a note only because its text or shelf mentions the query", () => {
    expect(titleMatches(note("Mohajon", "remember to git pull"), "git")).toBe(false);
    expect(titleMatches(note("Plans", ""), "work")).toBe(false);
  });

  it("lists everything for an empty query, and finds an untitled note as 'untitled'", () => {
    expect(titleMatches(note("Anything", ""), "")).toBe(true);
    expect(titleMatches(note("", ""), "untit")).toBe(true);
  });
});
