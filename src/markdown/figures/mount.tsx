import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NoteFigure } from "./NoteFigure";

/**
 * Draws every figure placeholder (`div.md-figure` with its source in `data-raw`) inside
 * `container`, and keeps them drawn as the container's HTML is replaced: the editor and the card
 * previews both render notes as HTML strings, so each figure gets a React root of its own.
 */
export function useFigureMounts(container: HTMLElement | null): void {
  useEffect(() => {
    if (!container) return;
    const roots = new Map<HTMLElement, { root: Root; source: string }>();

    const sync = () => {
      for (const [node, entry] of roots) {
        if (node.isConnected && container.contains(node)) continue;
        roots.delete(node);
        // Not while React may be committing the tree that removed the node.
        window.setTimeout(() => entry.root.unmount(), 0);
      }
      container.querySelectorAll<HTMLElement>("div.md-figure").forEach((node) => {
        const source = node.getAttribute("data-raw") ?? "";
        const entry = roots.get(node);
        if (entry && entry.source === source) return;
        const root = entry?.root ?? createRoot(node);
        root.render(<NoteFigure source={source} />);
        roots.set(node, { root, source });
      });
    };

    sync();
    // Figures are top-level blocks: watching the container's own children is enough, and it
    // ignores the mutations the figures make while they draw.
    const observer = new MutationObserver(sync);
    observer.observe(container, { childList: true });
    return () => {
      observer.disconnect();
      const all = [...roots.values()];
      roots.clear();
      window.setTimeout(() => all.forEach((entry) => entry.root.unmount()), 0);
    };
  }, [container]);
}
