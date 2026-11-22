import { describe, expect, it } from "vitest";
import { cleanCut, type Block } from "./previewFit";

const LINE = 21.45;
/** A task that wraps over `count` lines, starting at `top`. */
const text = (top: number, count: number): Block => ({ top, bottom: top + count * LINE, lines: { start: top, height: LINE } });

describe("cleanCut", () => {
  // The "Upcoming Exams" card: two wrapped tasks, then a third that ran past a 120px preview.
  const exams = [text(0, 2), text(2 * LINE, 3), text(5 * LINE, 2)];

  it("ends before a line that would show cut in half", () => {
    expect(cleanCut(exams, 120)).toBeCloseTo(5 * LINE);
  });

  it("keeps the whole lines of a task that runs past the edge", () => {
    expect(cleanCut(exams, 6 * LINE + 4)).toBeCloseTo(6 * LINE);
  });

  it("leaves out a figure that does not fit, and cuts nothing when all fits", () => {
    const withFigure = [text(0, 1), { top: LINE, bottom: LINE + 90, lines: null }];
    expect(cleanCut(withFigure, 80)).toBeCloseTo(LINE);
    expect(cleanCut(exams, 7 * LINE)).toBeNull();
  });
});
