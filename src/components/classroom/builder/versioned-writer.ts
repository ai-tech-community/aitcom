/**
 * The one door for every write to a versioned record (a course, or one lesson)
 * from the builder.
 *
 * A save must name the version it was based on (`expectedUpdatedAt`) so a
 * stale tab is refused instead of overwriting newer edits. Several parts of
 * the builder write to the same record — the details pane's autosave and the
 * publish control write the course; a lesson's autosave and outline changes
 * that rewrite the lesson — so they must share one version and must not race:
 * two writes in flight with the same expected version would make the second
 * one look like a conflict with ourselves.
 *
 * The writer is a queue: writes run one at a time in call order, each gets the
 * version the previous successful write returned, and a failed write leaves
 * the version unchanged without blocking later writes.
 */
export type VersionedWrite = (expectedUpdatedAt: string) => Promise<string>;

export type VersionedWriter = {
  /** Queue a write. `write` receives the expected version and resolves with the new one. */
  run: (write: VersionedWrite) => Promise<void>;
  /** Resolves once every queued write has settled, including writes queued while waiting. */
  whenIdle: () => Promise<void>;
};

export function createVersionedWriter(
  initialUpdatedAt: string,
): VersionedWriter {
  let version = initialUpdatedAt;
  let tail: Promise<void> = Promise.resolve();

  const whenIdle = (): Promise<void> => {
    const seen = tail;
    return seen.then(() => (tail === seen ? undefined : whenIdle()));
  };

  return {
    run(write) {
      const next = tail.then(async () => {
        version = await write(version);
      });
      tail = next.catch(() => undefined);
      return next;
    },
    whenIdle,
  };
}
