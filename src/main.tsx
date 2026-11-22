import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import { isMarkdown, markPlatform, pick } from "./platform";

markPlatform();

// Block browser-level page zoom from touchpad pinch and Ctrl+wheel anywhere in the app chrome;
// open note editors handle zoom locally on the note body.
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  },
  { passive: false },
);
for (const type of ["gesturestart", "gesturechange", "gestureend"] as const) {
  window.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Force absolute transparency on root elements
document.documentElement.style.background = "transparent";
document.documentElement.style.backgroundColor = "transparent";
document.body.style.background = "transparent";
document.body.style.backgroundColor = "transparent";
const rootEl = document.getElementById("root");
if (rootEl) {
  rootEl.style.background = "transparent";
  rootEl.style.backgroundColor = "transparent";
}

const isTrayWindow = window.location.search.includes("window=tray");

// One design per run: each module brings its own styles, so the other's never reach the page.
// One loader per design: an if/else or ternary over two imports gets merged into one preload with
// a single (wrong) stylesheet, so they stay separate functions.
const designs = {
  markdown: () => import("./markdown"),
  modern: () => import("./defaultDesign"),
};

void designs[isMarkdown ? "markdown" : "modern"]().then(({ Canvas, Dock }) => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      {/* The modern design honours the system's reduced-motion setting for spring animations too. */}
      <MotionConfig reducedMotion={pick("never", "user")}>{isTrayWindow ? <Dock /> : <Canvas />}</MotionConfig>
    </React.StrictMode>,
  );
});
