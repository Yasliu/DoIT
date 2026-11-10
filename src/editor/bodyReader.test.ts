// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { createBodyReader } from "./bodyReader";

it("reads an edit the browser reported before the read", async () => {
  const body = document.createElement("div");
  body.innerHTML = "<div>ddd</div>";
  document.body.append(body);
  const reader = createBodyReader(body);
  expect(reader.read()).toBe("ddd");

  body.firstChild!.firstChild!.textContent = "dddwdwd";
  // A real keystroke: the observer is told about the edit before the input handler reads.
  await new Promise((resolve) => setTimeout(resolve));

  expect(reader.read()).toBe("dddwdwd");
  reader.disconnect();
});
