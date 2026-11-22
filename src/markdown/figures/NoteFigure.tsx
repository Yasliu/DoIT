import { Component, useEffect, useState, type ReactNode } from "react";
import { parseMarkdown, type MarkdownDocument as Parsed } from "comark";
import { MarkdownDocument } from "@comark/react";
import { graphComponents } from "@/registry/default/graph-comark/graph-comark";

/** Parsed figures by source: typing elsewhere in the note re-renders without re-parsing. */
const parsed = new Map<string, Promise<Parsed>>();

function parse(source: string): Promise<Parsed> {
  let doc = parsed.get(source);
  if (!doc) {
    doc = parseMarkdown(source);
    parsed.set(source, doc);
    if (parsed.size > 200) parsed.delete(parsed.keys().next().value!);
  }
  return doc;
}

class Contain extends Component<{ source: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { source: string }) {
    if (prev.source !== this.props.source && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <FigureError source={this.props.source} /> : this.props.children;
  }
}

function FigureError({ source }: { source: string }) {
  return (
    <div className="graph-frame px-5 py-4 text-[13px]">
      <div className="text-destructive">This figure could not be drawn. Click to edit its source.</div>
      <pre className="mt-2 whitespace-pre-wrap text-graph-muted">{source}</pre>
    </div>
  );
}

/** One figure, drawn from its `::tag … ::` source. */
export function NoteFigure({ source }: { source: string }) {
  const [doc, setDoc] = useState<Parsed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    parse(source).then(
      (next) => live && setDoc(next),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [source]);

  if (failed) return <FigureError source={source} />;
  if (!doc) return <div className="graph-frame h-24" aria-hidden="true" />;
  return (
    <Contain source={source}>
      <MarkdownDocument value={doc} components={graphComponents} />
    </Contain>
  );
}
