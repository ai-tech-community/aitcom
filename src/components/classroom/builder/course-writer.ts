/**
 * The one door for every write to a course from the builder.
 *
 * A course save must name the version it was based on (`expectedUpdatedAt`)
 * so a stale tab is refused instead of overwriting newer edits. Several parts
 * of the builder write to the same course — the details pane's autosave, the
 * publish control — so they must share one version and must not race: two
 * writes in flight with the same expected version would make the second one
 * look like a conflict with ourselves.
 *
 * The writer is a queue: writes run one at a time in call order, each gets the
 * version the previous successful write returned, and a failed write leaves
 * the version unchanged without blocking later writes.
 */
export type CourseWrite = (expectedUpdatedAt: string) => Promise<string>;

export type CourseWriter = {
  /** Queue a write. `write` receives the expected version and resolves with the new one. */
  run: (write: CourseWrite) => Promise<void>;
};

export function createCourseWriter(initialUpdatedAt: string): CourseWriter {
  let version = initialUpdatedAt;
  let tail: Promise<void> = Promise.resolve();

  return {
    run(write) {
      const next = tail.then(async () => {
        version = await write(version);
      });
      tail = next.catch(() => undefined);
      return next;
    },
  };
}
