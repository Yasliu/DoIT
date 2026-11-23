/** The app's full version. */
export const APP_VERSION = "1.2.4";

/** `1.2.4`, `v1.2.4` or `1.2.5-beta.1` as numbers; a pre-release tag is ignored. */
function parts(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(/[-+]/)[0]
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
}

/** Whether `current` is older than `target`. No `current` counts as older. */
export function isVersionLower(current: string | null, target: string): boolean {
  if (!current) return true;
  const c = parts(current);
  const t = parts(target);
  for (let i = 0; i < Math.max(c.length, t.length, 4); i++) {
    if ((c[i] || 0) < (t[i] || 0)) return true;
    if ((c[i] || 0) > (t[i] || 0)) return false;
  }
  return false;
}

/**
 * What to show on the first run of `current` after `previous`: the full "What's new" dialog for a
 * major or minor bump, a small toast for a patch, nothing on a fresh install or a downgrade.
 */
export function whatsNewAfter(previous: string | null, current: string): "dialog" | "toast" | null {
  if (!previous || !isVersionLower(previous, current)) return null;
  const [pMajor = 0, pMinor = 0] = parts(previous);
  const [cMajor = 0, cMinor = 0] = parts(current);
  return pMajor !== cMajor || pMinor !== cMinor ? "dialog" : "toast";
}
