/**
 * Figures inside notes: `::tag … ::` blocks in the note's Markdown, drawn with the registry's
 * components. The editor reads and writes the blocks (lib/format); this module knows which figures
 * exist, how a new one starts, and draws them.
 */
export { FIGURES, enableFigureBlocks, figureOpening, foldFigures, isFigureClosing, type FigureKind } from "./catalog";
export { NoteFigure } from "./NoteFigure";
export { useFigureMounts } from "./mount";
