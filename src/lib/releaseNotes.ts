/** A run of text in a release note line. */
export interface NoteSpan {
  text: string;
  strong?: boolean;
  code?: boolean;
}

/** One line of a release's notes: a heading, a bullet, or plain text. */
export interface NoteLine {
  kind: "heading" | "item" | "text";
  spans: NoteSpan[];
}

/**
 * Reads a GitHub release body (Markdown) as short lines for a popover: headings, bullets and
 * paragraphs with **bold** and `code`; links keep their text. GitHub's "Full Changelog" footer,
 * HTML comments and images are left out.
 */
export function readReleaseNotes(body: string): NoteLine[] {
  const lines: NoteLine[] = [];
  for (const raw of body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,})$/.test(line) || /^\**full changelog\**:/i.test(line) || /^!\[/.test(line)) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (heading) lines.push({ kind: "heading", spans: spans(heading[1]) });
    else if (item) lines.push({ kind: "item", spans: spans(item[1]) });
    else lines.push({ kind: "text", spans: spans(line) });
  }
  return lines;
}

function spans(text: string): NoteSpan[] {
  const plain = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  const out: NoteSpan[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__/g;
  let at = 0;
  for (const match of plain.matchAll(pattern)) {
    if (match.index > at) out.push({ text: plain.slice(at, match.index) });
    if (match[1] != null) out.push({ text: match[1], code: true });
    else out.push({ text: match[2] ?? match[3], strong: true });
    at = match.index + match[0].length;
  }
  if (at < plain.length) out.push({ text: plain.slice(at) });
  return out;
}
