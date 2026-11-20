import { describe, expect, it } from "vitest";
import { layoutLists, type ListLine } from "./listLayout";

const bullet = (indent: string): ListLine => ({ kind: "bullet", indent });
const numbered = (indent: string, start = 1): ListLine => ({ kind: "numbered", indent, start });

describe("layoutLists", () => {
  it("nests by indentation relative to the line above, in two-space and four-space files alike", () => {
    const depths = (lines: ListLine[]) => layoutLists(lines).map((p) => p.depth);
    expect(depths([bullet(""), bullet("  "), bullet("    "), bullet("  "), bullet("")])).toEqual([0, 1, 2, 1, 0]);
    expect(depths([bullet(""), bullet("    "), bullet("\t\t"), bullet("")])).toEqual([0, 1, 2, 0]);
  });

  it("numbers each level on its own, carrying on past nested lines and restarting after other text", () => {
    const lines: ListLine[] = [
      numbered("", 3),
      numbered("    "),
      numbered("    "),
      bullet("        "),
      numbered(""),
      { kind: "other" },
      numbered(""),
    ];
    expect(layoutLists(lines).map((p) => p.number)).toEqual([3, 1, 2, undefined, 4, undefined, 1]);
  });
});
