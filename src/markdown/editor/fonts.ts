const MONO = '"Geist Mono Variable", "Geist Mono", "JetBrains Mono", ui-monospace, monospace';

/** Under ILOVEMARKDOWN every note is set in a monospace face; these come first, then installed mono fonts. */
export const NOTE_FONTS: Array<{ name: string; label: string; stack: string }> = [
  { name: "Geist Mono", label: "Geist Mono", stack: MONO },
  { name: "JetBrains Mono", label: "JetBrains Mono", stack: `"JetBrains Mono", ${MONO}` },
];

/** Whether an installed font reads as monospace from its name. */
export function isMonoFont(name: string): boolean {
  return /mono|code|courier|consol|menlo|hack|iosevka|fira|terminal|typewriter|plex mono|inconsolata/i.test(name);
}

/** The CSS stack for a note's font. A proportional face chosen in the default design reads as the default here. */
export function fontStack(name?: string): string {
  if (!name) return MONO;
  const found = NOTE_FONTS.find((font) => font.name.toLowerCase() === name.toLowerCase());
  if (found) return found.stack;
  return isMonoFont(name) ? `"${name}", ${MONO}` : MONO;
}
