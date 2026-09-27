/**
 * Motion policy for ASCII scenes, kept free of DOM access so it can be unit
 * tested. `useAsciiMotion` is the thin browser adapter that feeds it
 * media-query, intersection and page-visibility signals.
 *
 * Policy:
 * - `prefers-reduced-motion: reduce` → draw one representative frame, no loop.
 * - off-screen or document hidden     → stop the loop, keep the last frame.
 * - otherwise                          → animate at `frameMs`.
 */

export type MotionMode = "animate" | "static" | "paused";

export interface MotionSignals {
  prefersReducedMotion: boolean;
  inViewport: boolean;
  documentVisible: boolean;
}

export function resolveMotionMode(signals: MotionSignals): MotionMode {
  if (signals.prefersReducedMotion) return "static";
  if (!signals.inViewport || !signals.documentVisible) return "paused";
  return "animate";
}

/** Frame scheduling boundary (requestAnimationFrame in the browser). */
export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

export interface MotionControllerOptions {
  /** Minimum time between scene ticks. */
  frameMs: number;
  /** Tick drawn under reduced motion, and the tick animation starts from. */
  staticTick: number;
  /** Paint the scene at `tick`. Must not read layout or computed style. */
  draw: (tick: number) => void;
  scheduler: FrameScheduler;
  initialSignals?: Partial<MotionSignals>;
}

const DEFAULT_SIGNALS: MotionSignals = {
  prefersReducedMotion: false,
  // Assume visible until an observer says otherwise, so a first frame shows
  // even where IntersectionObserver is unavailable.
  inViewport: true,
  documentVisible: true,
};

export class AsciiMotionController {
  private signals: MotionSignals;
  private mode: MotionMode;
  private tick: number;
  private lastAdvance: number | null = null;
  private handle: number | null = null;
  private disposed = false;

  constructor(private readonly options: MotionControllerOptions) {
    this.signals = { ...DEFAULT_SIGNALS, ...options.initialSignals };
    this.tick = options.staticTick;
    this.mode = resolveMotionMode(this.signals);
  }

  get currentMode(): MotionMode {
    return this.mode;
  }

  get currentTick(): number {
    return this.tick;
  }

  /** Paint the first frame and start the loop if the policy allows it. */
  start(): void {
    this.redraw();
    this.applyMode();
  }

  /** Feed a changed signal (media query, intersection, visibility). */
  update(partial: Partial<MotionSignals>): void {
    if (this.disposed) return;
    this.signals = { ...this.signals, ...partial };
    const next = resolveMotionMode(this.signals);
    if (next === this.mode) return;
    this.mode = next;
    if (next === "static") {
      this.tick = this.options.staticTick;
      this.redraw();
    }
    this.applyMode();
  }

  /** Repaint the current frame, e.g. after the container was resized. */
  redraw(): void {
    if (this.disposed) return;
    this.options.draw(
      this.mode === "static" ? this.options.staticTick : this.tick,
    );
  }

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
  }

  private applyMode(): void {
    if (this.mode === "animate") this.startLoop();
    else this.stopLoop();
  }

  private startLoop(): void {
    if (this.handle !== null || this.disposed) return;
    this.lastAdvance = null;
    this.handle = this.options.scheduler.request(this.onFrame);
  }

  private stopLoop(): void {
    if (this.handle === null) return;
    this.options.scheduler.cancel(this.handle);
    this.handle = null;
  }

  private onFrame = (now: number): void => {
    this.handle = null;
    if (this.disposed || this.mode !== "animate") return;
    if (this.lastAdvance === null) {
      this.lastAdvance = now;
    } else if (now - this.lastAdvance >= this.options.frameMs) {
      this.lastAdvance = now;
      this.tick += 1;
      this.options.draw(this.tick);
    }
    this.handle = this.options.scheduler.request(this.onFrame);
  };
}
