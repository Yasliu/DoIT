import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const media = () => (typeof window === "undefined" ? null : (window.matchMedia?.(QUERY) ?? null));

/** Whether the OS asks for less motion, following the setting while the app runs. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = media();
      query?.addEventListener("change", changed);
      return () => query?.removeEventListener("change", changed);
    },
    () => media()?.matches ?? false,
  );
}
