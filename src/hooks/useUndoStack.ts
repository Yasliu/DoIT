import { useCallback, useEffect, useRef } from "react";

const COALESCE_MS = 600;
const MAX_DEPTH = 150;

/**
 * Independent undo/redo history for one editable field (title or body).
 * Rapid changes (typing bursts) collapse into a single undo step.
 * `resetKey` (e.g. the note id) starts a fresh history.
 */
export function useUndoStack<T>(resetKey: string | null, value: T, apply: (v: T) => void) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef<T>(value);
  const keyRef = useRef<string | null>(resetKey);
  const lastChangeAt = useRef(0);
  const applying = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey;
      past.current = [];
      future.current = [];
      last.current = value;
      lastChangeAt.current = 0;
      applying.current = false;
      return;
    }
    if (applying.current) {
      applying.current = false;
      last.current = value;
      return;
    }
    if (JSON.stringify(value) === JSON.stringify(last.current)) return;

    const now = Date.now();
    if (now - lastChangeAt.current > COALESCE_MS) {
      past.current.push(last.current);
      if (past.current.length > MAX_DEPTH) past.current.shift();
    }
    lastChangeAt.current = now;
    future.current = [];
    last.current = value;
  }, [resetKey, value]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(last.current);
    applying.current = true;
    last.current = prev;
    lastChangeAt.current = 0;
    applyRef.current(prev);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(last.current);
    applying.current = true;
    last.current = next;
    lastChangeAt.current = 0;
    applyRef.current(next);
  }, []);

  return { undo, redo };
}
