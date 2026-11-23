import { expect, it } from "vitest";
import { whatsNewAfter } from "./version";

it("shows the full what's new for a major or minor bump and a toast for a patch", () => {
  expect(whatsNewAfter("1.2.4", "1.3.0")).toBe("dialog");
  expect(whatsNewAfter("1.9.3", "2.0.0")).toBe("dialog");
  expect(whatsNewAfter("1.2.4", "1.3.2")).toBe("dialog");
  expect(whatsNewAfter("1.2.4", "1.2.5")).toBe("toast");
  expect(whatsNewAfter("v1.2.4", "1.2.5-beta.1")).toBe("toast");
  // Nothing on a fresh install, the same version, or a downgrade.
  expect(whatsNewAfter(null, "1.2.5")).toBeNull();
  expect(whatsNewAfter("1.2.5", "1.2.5")).toBeNull();
  expect(whatsNewAfter("1.3.0", "1.2.5")).toBeNull();
});
