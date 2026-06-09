import confetti from "canvas-confetti";

/**
 * Fire a celebratory confetti burst. Cosmetic only. No-ops during SSR and for
 * users who prefer reduced motion. Call from event handlers / effects, never
 * during render.
 */
export function fireConfetti(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  void confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 35,
    origin: { y: 0.7 },
    scalar: 0.9,
  });
}
