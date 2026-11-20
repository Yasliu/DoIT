import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TrayCompanion } from "./components/TrayCompanion";
import "./styles/globals.css";
import "./platform/modern/modern.css";
import { MotionConfig } from "motion/react";
import { markPlatform, pick } from "./platform";

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* The modern design honours the system's reduced-motion setting for spring animations too. */}
    <MotionConfig reducedMotion={pick("never", "user")}>
      {isTrayWindow ? <TrayCompanion /> : <App />}
    </MotionConfig>
  </React.StrictMode>,
);
