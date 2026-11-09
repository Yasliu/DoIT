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
  const observer = new MutationObserver(() => undefined);
  observer.observe(body, { subtree: true, childList: true, characterData: true, attributes: true });

  const blockOf = (node: Node | null): Node | null => {
    let current = node;
    while (current && current.parentNode !== body) current = current.parentNode;
    return current;
  };

  /** Forgets what changed; true when blocks were added to or removed from the body itself. */
  const invalidate = (records: MutationRecord[], changed: Set<Node>): boolean => {
    let reshaped = false;
    for (const record of records) {
      if (record.target === body) {
        reshaped = true;
        continue;
      }
      const block = blockOf(record.target);
      if (block) {
        pieces.delete(block);
        changed.add(block);
      }
    }
    return reshaped;
  };

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
      const changed = new Set<Node>();
      const reshaped = invalidate(observer.takeRecords(), changed);
      const [only] = changed;
      if (!reshaped && changed.size === 1 && only instanceof HTMLElement && editStaysInBlock(only)) normalizeEditor(body, only);
      else normalizeEditor(body);
      invalidate(observer.takeRecords(), changed);

      const blocks = Array.from(body.childNodes);
      if (blocks.every(readsAsOwnLines)) return joinMarkdown(blocks.map(pieceOf));
      return joinMarkdown([readMarkdown(body, blocks)]);
    },
    disconnect() {
      observer.disconnect();
    },
  };
}
