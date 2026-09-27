import { describe, expect, it, vi } from "vitest";
import {
  AsciiMotionController,
  resolveMotionMode,
  type FrameScheduler,
} from "./motion-controller";

function fakeScheduler() {
  let next = 1;
  const pending = new Map<number, (now: number) => void>();
  const scheduler: FrameScheduler = {
    request: vi.fn((cb: (now: number) => void) => {
      const id = next++;
      pending.set(id, cb);
      return id;
    }),
    cancel: vi.fn((id: number) => {
      pending.delete(id);
    }),
  };
  return {
    scheduler,
    get pendingCount() {
      return pending.size;
    },
    /** Run every pending frame callback once at `now`. */
    flush(now: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(now);
    },
  };
}

function setup(
  initialSignals?: ConstructorParameters<
    typeof AsciiMotionController
  >[0]["initialSignals"],
) {
  const frames = fakeScheduler();
  const draw = vi.fn();
  const controller = new AsciiMotionController({
    frameMs: 100,
    staticTick: 42,
    draw,
    scheduler: frames.scheduler,
    initialSignals,
  });
  return { frames, draw, controller };
}

describe("resolveMotionMode", () => {
  it("prefers a static frame whenever reduced motion is requested", () => {
    expect(
      resolveMotionMode({
        prefersReducedMotion: true,
        inViewport: true,
        documentVisible: true,
      }),
    ).toBe("static");
    expect(
      resolveMotionMode({
        prefersReducedMotion: true,
        inViewport: false,
        documentVisible: false,
      }),
    ).toBe("static");
  });

  it("pauses when off-screen or when the document is hidden", () => {
    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        inViewport: false,
        documentVisible: true,
      }),
    ).toBe("paused");
    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        inViewport: true,
        documentVisible: false,
      }),
    ).toBe("paused");
  });

  it("animates only when visible, on-screen and motion is allowed", () => {
    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        inViewport: true,
        documentVisible: true,
      }),
    ).toBe("animate");
  });
});

describe("AsciiMotionController", () => {
  it("draws the representative frame on start and advances on schedule", () => {
    const { frames, draw, controller } = setup();
    controller.start();
    expect(draw).toHaveBeenLastCalledWith(42);
    expect(frames.pendingCount).toBe(1);

    frames.flush(0); // first frame only sets the clock
    frames.flush(50); // too soon
    expect(draw).toHaveBeenCalledTimes(1);
    frames.flush(100);
    expect(draw).toHaveBeenLastCalledWith(43);
    frames.flush(200);
    expect(draw).toHaveBeenLastCalledWith(44);
  });

  it("renders one static frame and never loops under reduced motion", () => {
    const { frames, draw, controller } = setup({ prefersReducedMotion: true });
    controller.start();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenLastCalledWith(42);
    expect(frames.pendingCount).toBe(0);
    expect(controller.currentMode).toBe("static");
  });

  it("reacts to reduced motion being switched on and off at runtime", () => {
    const { frames, draw, controller } = setup();
    controller.start();
    frames.flush(0);
    frames.flush(100);
    frames.flush(200);
    expect(draw).toHaveBeenLastCalledWith(44);

    controller.update({ prefersReducedMotion: true });
    expect(draw).toHaveBeenLastCalledWith(42);
    expect(frames.pendingCount).toBe(0);

    controller.update({ prefersReducedMotion: false });
    expect(frames.pendingCount).toBe(1);
    frames.flush(1000);
    frames.flush(1100);
    expect(draw).toHaveBeenLastCalledWith(43);
  });

  it("stops the loop off-screen and resumes from the same tick", () => {
    const { frames, draw, controller } = setup();
    controller.start();
    frames.flush(0);
    frames.flush(100);
    expect(controller.currentTick).toBe(43);

    controller.update({ inViewport: false });
    expect(controller.currentMode).toBe("paused");
    expect(frames.pendingCount).toBe(0);
    const drawsWhilePaused = draw.mock.calls.length;

    controller.update({ inViewport: true });
    frames.flush(5000);
    frames.flush(5100);
    expect(draw.mock.calls.length).toBe(drawsWhilePaused + 1);
    expect(draw).toHaveBeenLastCalledWith(44);
  });

  it("stops the loop while the document is hidden", () => {
    const { frames, controller } = setup();
    controller.start();
    controller.update({ documentVisible: false });
    expect(frames.pendingCount).toBe(0);
    controller.update({ documentVisible: true });
    expect(frames.pendingCount).toBe(1);
  });

  it("redraw repaints the current frame without advancing", () => {
    const { draw, controller } = setup({ inViewport: false });
    controller.start();
    controller.redraw();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenLastCalledWith(42);
  });

  it("does nothing after dispose", () => {
    const { frames, draw, controller } = setup();
    controller.start();
    controller.dispose();
    expect(frames.pendingCount).toBe(0);
    controller.update({ inViewport: false });
    controller.update({ inViewport: true });
    controller.redraw();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(frames.pendingCount).toBe(0);
  });
});
