import { describe, expect, it } from "vitest";
import { canvasShortcut } from "./shortcuts";

const key = (k: string, extra: Partial<Parameters<typeof canvasShortcut>[0]> = {}) => ({
  key: k,
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  ...extra,
});

describe("canvasShortcut", () => {
  it("leaves a key that a dialog already handled alone, so Ctrl+O opens one file picker", () => {
    expect(canvasShortcut(key("o"))).toBe("import-file");
    expect(canvasShortcut(key("o", { defaultPrevented: true }))).toBeNull();
    expect(canvasShortcut(key("n", { defaultPrevented: true }))).toBeNull();
  });
});
