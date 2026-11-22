/** The default design's windows and styles, loaded by main.tsx when ILOVEMARKDOWN is off. */
import "./styles/globals.css";
import "./platform/modern/modern.css";

export { default as Canvas } from "./App";
export { TrayCompanion as Dock } from "./components/TrayCompanion";
