import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TrayCompanion } from "./components/TrayCompanion";
import { TrayPill } from "./components/TrayPill";
import "./styles/globals.css";

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

const isPillWindow = window.location.search.includes("window=pill");
const isTrayWindow = window.location.search.includes("window=tray");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPillWindow ? <TrayPill /> : isTrayWindow ? <TrayCompanion /> : <App />}
  </React.StrictMode>,
);
