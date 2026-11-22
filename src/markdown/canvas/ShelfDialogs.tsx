import { useState } from "react";
import { SHELF_MARKS, removeShelfMark, renameShelfMark, setShelfMark, shelfMark, suggestShelfMark } from "../../lib/shelfMarks";
import { cleanText } from "../../lib/text";
import { cn } from "@/lib/utils";
import { Btn, Dialog, Field, Kbd } from "../ui";

/** Every mark as a grid of one-character cells. */
function MarkGrid({ value, onChange }: { value: string; onChange: (mark: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Mark" className="grid grid-cols-12 gap-px">
      {SHELF_MARKS.map((mark) => {
        const on = mark === value;
        return (
          <button
            key={mark}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={mark}
            onClick={() => onChange(mark)}
            className={cn("grid h-7 place-items-center transition-colors", on ? "bg-invert text-background" : "text-graph-muted hover:bg-hover hover:text-foreground")}
          >
            {mark}
          </button>
        );
      })}
    </div>
  );
}

interface NewShelfDialogProps {
  shelves: string[];
  onClose: () => void;
  /** `mark` is null when nobody picked one: the shelf keeps a mark suggested from its name. */
  onCreate: (name: string, mark: string | null) => void;
  /** Import a folder as a shelf, named `name` or, when empty, after the folder. */
  onImportFolder: (name: string, mark: string | null) => void;
}

/** mkdir: name an empty shelf, or bring in a folder of Markdown and text files as one. */
export function NewShelfDialog({ shelves, onClose, onCreate, onImportFolder }: NewShelfDialogProps) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const trimmed = name.trim();
  const mark = picked ?? suggestShelfMark(trimmed);
  const taken = shelves.some((s) => s.toLowerCase() === trimmed.toLowerCase());

  const create = () => {
    if (trimmed && !taken) onCreate(trimmed, picked);
  };

  return (
    <Dialog title="new shelf" onClose={onClose} width={460} placement="top">
      <div className="flex items-center gap-[1.5ch]">
        <span className="grid size-8 shrink-0 place-items-center bg-invert text-[15px] text-background">{mark}</span>
        <Field
          data-autofocus
          value={name}
          maxLength={24}
          placeholder="name"
          aria-label="Shelf name"
          invalid={taken}
          wrapClassName="flex-1"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
            if (e.key.toLowerCase() === "o" && e.ctrlKey) {
              e.preventDefault();
              onImportFolder(trimmed, picked);
            }
          }}
        />
      </div>
      <div className="mt-5">
        <div className="tm-label mb-2">mark</div>
        <MarkGrid value={mark} onChange={setPicked} />
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-graph-muted">
        {taken ? <span className="text-destructive">A shelf with this name already exists.</span> : "Importing a folder turns its .md and .txt files into this shelf's notes."}
      </p>
      <div className="mt-6 flex items-center justify-between gap-[2ch]">
        <Btn onClick={() => onImportFolder(trimmed, picked)}>
          import folder <Kbd keys="Ctrl+O" />
        </Btn>
        <Btn variant="primary" onClick={create} disabled={!trimmed || taken}>
          create
        </Btn>
      </div>
    </Dialog>
  );
}

interface EditShelfDialogProps {
  shelf: string;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => Promise<string | null>;
  onDelete: (shelf: string) => void;
}

/** Rename a shelf and choose its mark. */
export function EditShelfDialog({ shelf, onClose, onRename, onDelete }: EditShelfDialogProps) {
  const [name, setName] = useState(cleanText(shelf));
  const [initialMark] = useState(() => shelfMark(shelf));
  const [mark, setMark] = useState(initialMark);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const next = name.trim();
    if (!next) return setError("A shelf needs a name.");
    setBusy(true);
    let target = shelf;
    if (next !== cleanText(shelf)) {
      const err = await onRename(shelf, next);
      if (err) {
        setError(err);
        setBusy(false);
        return;
      }
      renameShelfMark(shelf, next);
      target = next;
    }
    // Saved only when picked: an untouched mark may be a suggestion or the default design's icon,
    // which a rename already carries over.
    if (mark !== initialMark) setShelfMark(target, mark);
    onClose();
  };

  return (
    <Dialog title="edit shelf" onClose={onClose} width={460} placement="top">
      <div className="flex items-center gap-[1.5ch]">
        <span className="grid size-8 shrink-0 place-items-center bg-invert text-[15px] text-background">{mark}</span>
        <Field
          data-autofocus
          value={name}
          maxLength={28}
          aria-label="Shelf name"
          invalid={!!error}
          wrapClassName="flex-1"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && void save()}
        />
      </div>
      {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
      <div className="mt-5">
        <div className="tm-label mb-2">mark</div>
        <MarkGrid value={mark} onChange={setMark} />
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Btn
          variant="danger"
          onClick={() => {
            removeShelfMark(shelf);
            onDelete(shelf);
          }}
        >
          delete shelf
        </Btn>
        <Btn variant="primary" onClick={() => void save()} disabled={busy}>
          done
        </Btn>
      </div>
    </Dialog>
  );
}
