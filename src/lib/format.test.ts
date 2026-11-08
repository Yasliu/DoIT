import { describe, expect, it } from "vitest";
import { imageMarkdownWithAlt } from "./format";

const image = (attrs: Record<string, string>) => ({ getAttribute: (name: string) => attrs[name] ?? null }) as unknown as HTMLImageElement;

describe("imageMarkdownWithAlt", () => {
  it("keeps the link the note wrote, not the URL the webview loads", () => {
    const saved = image({ "data-md": "![old](assets/3f2a.png)", src: "asset://localhost/notes/assets/3f2a.png" });
    expect(imageMarkdownWithAlt(saved, "new")).toBe("![new](assets/3f2a.png)");
    expect(imageMarkdownWithAlt(image({ "data-md": "![old][img-2]" }), "new")).toBe("![new][img-2]");
  });
});
