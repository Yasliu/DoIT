const FADE_MS = 140;

/** Fades out the launch screen from index.html once the canvas has something to show. */
export function dismissBootScreen(): void {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.style.opacity = "0";
  window.setTimeout(() => boot.remove(), FADE_MS + 20);
}
