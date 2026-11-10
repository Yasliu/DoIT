// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { NoteItem } from "../api/tauriBridge";
import { useWorkspace, type Workspace } from "./useWorkspace";

const { api } = vi.hoisted(() => ({
  api: {
    getNotes: vi.fn(async (): Promise<unknown[]> => []),
    getShelves: vi.fn(async () => []),
    saveNote: vi.fn(async (note: unknown) => note),
    deleteNote: vi.fn(async () => undefined),
  },
}));
vi.mock("../api/tauriBridge", () => ({ tauriApi: api }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ listen: async () => () => undefined }) }));

it("does not save a deleted note again when its editor closes", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const note = { id: "n1", title: "Standup", content: [], category: "Work", last_edited: 1 } as unknown as NoteItem;
  api.getNotes.mockResolvedValue([note]);
  let workspace!: Workspace;
  const Probe = () => {
    workspace = useWorkspace();
    return null;
  };
  await act(async () => createRoot(document.createElement("div")).render(<Probe />));
  expect(workspace.notes).toEqual([note]);

  vi.useFakeTimers();
  act(() => workspace.remove(note.id));
  // The open sheet hands over its draft as it unmounts.
  act(() => workspace.patch({ ...note, title: "Standup, edited" }));
  vi.runAllTimers();
  expect(api.saveNote).not.toHaveBeenCalled();

  // Undo is the way back.
  act(() => workspace.restore(note));
  expect(api.saveNote).toHaveBeenCalledWith(note);
  vi.useRealTimers();
});
