import { useCallback, useEffect, useRef } from "react";

const MAX_DEPTH = 50;
const SNAPSHOT_PAUSE_MS = 300;

function isWordOrStructuralBoundary(prev: unknown, next: unknown): boolean {
  if (typeof next === "string" && typeof prev === "string") {
    // Large jump (paste, block delete)
    if (Math.abs(next.length - prev.length) > 1) return true;
    // Punctuation or space or newline boundary at edge
    if (/[ \t\n.,;:!?'"()\[\]{}\-–—]$/.test(next)) return true;
    return false;
  }
  if (Array.isArray(next) && Array.isArray(prev)) {
    // Array length change (line added / deleted)
    if (next.length !== prev.length) return true;
    // Check if any line has changed status or reached boundary
    for (let i = 0; i < next.length; i++) {
      const nItem = next[i];
      const pItem = prev[i];
      if (!pItem) return true;
      if (nItem.is_todo !== pItem.is_todo || nItem.completed !== pItem.completed) return true;
      const nText = typeof nItem.text === "string" ? nItem.text : "";
      const pText = typeof pItem.text === "string" ? pItem.text : "";
      if (Math.abs(nText.length - pText.length) > 1) return true;
      if (/[ \t\n.,;:!?'"()\[\]{}\-–—]$/.test(nText)) return true;
    }
    return false;
  }
  return false;
}

/**
 * Independent deep undo/redo history for editable fields (title or body).
 * Tracks and stores up to 50 distinct structural state mutations chronologically.
 * Replaces coalesce locks with responsive snapshot tracking on word boundaries,
 * spaces, punctuation, lines, and typing pauses.
 */
export function useUndoStack<T>(resetKey: string | null, value: T, apply: (v: T) => void) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef<T>(value);
  const keyRef = useRef<string | null>(resetKey);
  const lastSnapshotAt = useRef(Date.now());
  const applying = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey;
      past.current = [];
      future.current = [];
      last.current = value;
      lastSnapshotAt.current = Date.now();
      applying.current = false;
      return;
    }
    if (applying.current) {
      applying.current = false;
      last.current = value;
      return;
    }
    const prevJson = JSON.stringify(last.current);
    const nextJson = JSON.stringify(value);
    if (prevJson === nextJson) return;

    const now = Date.now();
    const shouldSnapshot =
      now - lastSnapshotAt.current >= SNAPSHOT_PAUSE_MS ||
      isWordOrStructuralBoundary(last.current, value);

    if (shouldSnapshot) {
      past.current.push(last.current);
      if (past.current.length > MAX_DEPTH) {
        past.current.shift();
      }
      lastSnapshotAt.current = now;
    }
    future.current = [];
    last.current = value;
  }, [resetKey, value]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(last.current);
    applying.current = true;
    last.current = prev;
    lastSnapshotAt.current = Date.now();
    applyRef.current(prev);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(last.current);
    if (past.current.length > MAX_DEPTH) {
      past.current.shift();
    }
    applying.current = true;
    last.current = next;
    lastSnapshotAt.current = Date.now();
    applyRef.current(next);
  }, []);

  return { undo, redo };
}
