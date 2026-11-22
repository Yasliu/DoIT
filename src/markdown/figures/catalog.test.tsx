// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { FIGURES, enableFigureBlocks, foldFigures } from "./catalog";
import { NoteFigure } from "./NoteFigure";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("foldFigures", () => {
  it("counts a figure as one line, so a short note with one stays a small card", () => {
    enableFigureBlocks();
    const lines = ["Yesterday: fixed it.", "Blocked: nothing.", '::callout{type="tip"}', "Worth pulling out.", "::", "::callout"];
    const content = lines.map((text, i) => ({ id: String(i), text, is_todo: false, completed: false }));

    const folded = foldFigures(content);

    expect(folded.figures).toEqual([2]);
    // The unclosed opener at the end is still being typed, so it stays a line of its own.
    expect(folded.content.map((item) => item.text)).toEqual(["Yesterday: fixed it.", "Blocked: nothing.", "Worth pulling out.", "::callout"]);
  });
});

describe("figure templates", () => {
  it.each(FIGURES.map((f) => [f.tag, f.template]))("%s draws its content", async (_tag, template) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<NoteFigure source={template} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const text = host.textContent ?? "";
    expect(text).not.toContain("could not be drawn");
    expect(text).not.toContain("· · ·");
    expect(host.querySelector("figure")).not.toBeNull();
    expect(text.replace(/\s+/g, " ").length).toBeGreaterThan(20);

    act(() => root.unmount());
    host.remove();
  });
});
