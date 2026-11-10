import { editStaysInBlock, joinMarkdown, normalizeEditor, readMarkdown, readsAsOwnLines, type MarkdownPiece } from "../lib/format";

export interface BodyReader {
  /** Tidies the body after an edit and returns its Markdown. */
  read(): string;
  disconnect(): void;
}

/**
 * Reads the rich body back into Markdown, doing work only for the blocks that changed since the
 * last read. Typing in a 3,000-line note used to walk all of its DOM on every keystroke.
 */
export function createBodyReader(body: HTMLElement): BodyReader {
  const pieces = new WeakMap<Node, MarkdownPiece>();
  /** Blocks edited since the last read, unless blocks were added to or removed from the body. */
  const changed = new Set<Node>();
  let reshaped = false;

  const blockOf = (node: Node | null): Node | null => {
    let current = node;
    while (current && current.parentNode !== body) current = current.parentNode;
    return current;
  };

  const forget = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.target === body) {
        reshaped = true;
        changed.clear();
        continue;
      }
      const block = blockOf(record.target);
      if (!block) continue;
      pieces.delete(block);
      if (!reshaped) changed.add(block);
    }
  };

  // The browser hands records to this callback as soon as no script is running, which for a real
  // keystroke is before the input handler calls `read`. They must count here: `takeRecords` only
  // returns the ones not handed over yet, and a read that misses an edit answers from the cache.
  const observer = new MutationObserver(forget);
  observer.observe(body, { subtree: true, childList: true, characterData: true, attributes: true });

  const pieceOf = (block: Node): MarkdownPiece => {
    let piece = pieces.get(block);
    if (!piece) {
      piece = readMarkdown(body, [block]);
      pieces.set(block, piece);
    }
    return piece;
  };

  return {
    read() {
      forget(observer.takeRecords());
      const [only] = changed;
      if (!reshaped && changed.size === 1 && only instanceof HTMLElement && editStaysInBlock(only)) normalizeEditor(body, only);
      else normalizeEditor(body);
      forget(observer.takeRecords());
      changed.clear();
      reshaped = false;

      const blocks = Array.from(body.childNodes);
      if (blocks.every(readsAsOwnLines)) return joinMarkdown(blocks.map(pieceOf));
      return joinMarkdown([readMarkdown(body, blocks)]);
    },
    disconnect() {
      observer.disconnect();
    },
  };
}
