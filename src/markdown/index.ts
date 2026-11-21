/**
 * ILOVEMARKDOWN: a monospace, text-mode UI with figures inside notes. main.tsx loads this module
 * instead of the default design when the flag is on; its styles and figure blocks come with it.
 */
import "./styles/app.css";
import { enableFigureBlocks } from "./figures";

enableFigureBlocks();

export { default as Canvas } from "./canvas/Canvas";
export { Dock } from "./dock/Dock";
