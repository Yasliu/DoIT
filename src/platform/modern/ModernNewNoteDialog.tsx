import { FileDown, SquarePen } from "lucide-react";
import { ModernShelfPicker } from "./ModernShelfPicker";

interface ModernNewNoteDialogProps {
  shelves: string[];
  /** The shelf being viewed, which starts highlighted. */
  current: string | null;
  onClose: () => void;
  /** `created` is true when the shelf is new and has to be made first. */
  onCreate: (shelf: string, created: boolean) => void;
  onImportFile: (shelf: string, created: boolean) => void;
}

/** New note: pick its shelf from the keyboard, or import a file onto that shelf instead. */
export function ModernNewNoteDialog({ shelves, current, onClose, onCreate, onImportFile }: ModernNewNoteDialogProps) {
  return (
    <ModernShelfPicker
      label="New note"
      placeholder="New note in…"
      icon={<SquarePen size={17} />}
      enterLabel="create"
      shelves={shelves}
      current={current}
      onClose={onClose}
      onPick={({ shelf, created }) => onCreate(shelf, created)}
      secondary={{
        label: "Import a file here",
        icon: <FileDown size={14} />,
        key: "o",
        run: ({ shelf, created }) => onImportFile(shelf, created),
      }}
    />
  );
}
