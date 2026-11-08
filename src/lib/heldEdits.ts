/** Edits a component is still debouncing, handed to the workspace when it is asked to flush. */
const holders = new Set<() => void>();

/** Registers a callback that commits this component's unsaved edits; returns the unregister. */
export function holdEdits(commit: () => void): () => void {
  holders.add(commit);
  return () => holders.delete(commit);
}

export function drainHeldEdits(): void {
  holders.forEach((commit) => commit());
}
