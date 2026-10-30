import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TrayCompanion } from "./components/TrayCompanion";
import "./styles/globals.css";

const isTrayWindow = window.location.search.includes("window=tray");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isTrayWindow ? <TrayCompanion /> : <App />}
  </React.StrictMode>,
);
