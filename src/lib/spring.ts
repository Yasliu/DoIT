import { useEffect, useRef, useState } from "react";

/**
 * One spring for the whole application.
 * 0   → zeta ≈ 0.85, heavy landing with no ring
 * 50  → zeta ≈ 0.41, the standard fluid feel
 * 100 → zeta ≈ 0.20, lively rebound with two visible bounds
 */
export const springOf = (tune: number) => ({
  k: 0.08 + (tune / 100) * 0.16,
  d: 0.62 + (tune / 100) * 0.2,
});

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const calm = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * A single integration step. `dt` is expressed in sixtieths of a second and the
 * damping coefficient is raised to dt, so a dropped frame bleeds exactly the
 * same energy as sixty clean ones.
 */
export function integrate(value: number, vel: number, target: number, tune: number, dt: number) {
  const { k, d } = springOf(tune);
  const nextVel = (vel + (target - value) * k * dt) * Math.pow(d, dt);
  return { value: value + nextVel * dt, vel: nextVel };
}

export interface SpringRun {
  from: number;
  to: number;
  tune?: number;
  eps?: number;
  onFrame: (value: number) => void;
  onDone?: () => void;
}

/** Imperative runner: writes straight to the DOM, never re-renders React. */
export function springTo({ from, to, tune = 55, eps = 0.02, onFrame, onDone }: SpringRun) {
  if (calm()) {
    onFrame(to);
    onDone?.();
    return () => {};
  }

  let value = from;
  let vel = 0;
  let raf = 0;
  let prev = 0;
  let alive = true;

  const tick = (now: number) => {
    if (!alive) return;
    const dt = prev ? clamp((now - prev) / 16.6667, 0.15, 2.2) : 1;
    prev = now;

    const step = integrate(value, vel, to, tune, dt);
    value = step.value;
    vel = step.vel;

    if (Math.abs(to - value) < eps && Math.abs(vel) < eps) {
      onFrame(to);
      onDone?.();
      return;
    }

    onFrame(value);
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
  };
}

/** React-state spring used for small, isolated properties (hover, tray). */
export function useSpring(target: number, tune = 50, instant = false): number {
  const [at, setAt] = useState(target);
  const cur = useRef(target);
  const vel = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    if (instant) {
      cur.current = target;
      vel.current = 0;
      setAt(target);
      return;
    }

    let prev = 0;
    const tick = (now: number) => {
      const dt = prev ? clamp((now - prev) / 16.6667, 0.15, 2.2) : 1;
      prev = now;

      const step = integrate(cur.current, vel.current, target, tune, dt);
      cur.current = step.value;
      vel.current = step.vel;

      if (Math.abs(target - cur.current) < 0.02 && Math.abs(vel.current) < 0.02) {
        cur.current = target;
        vel.current = 0;
        setAt(target);
        raf.current = 0;
        return;
      }

      setAt(cur.current);
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [target, tune, instant]);

  return at;
}

/**
 * Intent buffering: a press yields/compresses for a 90ms beat before the
 * expansion is allowed to start. Returns whether the press is armed and a
 * trigger that runs the callback after the beat.
 */
export function usePressBeat(beatMs = 90) {
  const [pressed, setPressed] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const arm = (run: () => void) => {
    setPressed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => {
        setPressed(false);
        run();
      },
      calm() ? 0 : beatMs,
    );
  };

  const release = () => {
    window.clearTimeout(timer.current);
    setPressed(false);
  };

  return { pressed, arm, release };
}
