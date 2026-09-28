import type { VersionedWriter } from "./versioned-writer";

/** A lesson's version after a write (what the server returns for each lesson it rewrote). */
export type LessonVersion = { id: number; updatedAt: string };

/**
 * Runs an outline change that rewrites lessons on the server (a reorder, the
 * first module's wrap, removing modules) and resolves with its result.
 */
export type RewriteLessons = <T extends { lessons: readonly LessonVersion[] }>(
  write: () => Promise<T>,
) => Promise<T>;

/**
 * Where the builder finds the save queue of each lesson being edited.
 *
 * Outline changes rewrite lessons, and the server gives every rewritten lesson
 * a new version. A lesson editor that kept saving with its old version would
 * be refused as stale — a conflict with ourselves. So an outline change that
 * rewrites lessons is treated as one more write to each open lesson:
 *
 * - it joins that lesson's save queue, so it is sent only once a save in
 *   flight has settled, and a save asked for meanwhile waits for it (the two
 *   never race on the server);
 * - when it succeeds, each open lesson it touched takes the new version from
 *   the result; when it fails, the old version stands.
 *
 * Lesson editors register their writer while they are open. A closed editor
 * stays reachable until its last saves settle, so a change made just after
 * closing still reaches the version its final save will be based on.
 */
export type LessonVersionRegistry = {
  /** Make a lesson's writer reachable. Returns the call that releases it. */
  register: (lessonId: number, writer: VersionedWriter) => () => void;
  rewrite: RewriteLessons;
};

export function createLessonVersionRegistry(): LessonVersionRegistry {
  // One entry per registration: a later registration of the same lesson
  // replaces it, and the earlier one's release then leaves it alone.
  const entries = new Map<number, { writer: VersionedWriter }>();

  const register = (lessonId: number, writer: VersionedWriter) => {
    const entry = { writer };
    entries.set(lessonId, entry);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      void writer.whenIdle().then(() => {
        if (entries.get(lessonId) === entry) entries.delete(lessonId);
      });
    };
  };

  const rewrite: RewriteLessons = async (write) => {
    type Result = { lessons: readonly LessonVersion[] };
    let settle!: { resolve: (r: Result) => void; reject: (e: unknown) => void };
    const outcome = new Promise<Result>((resolve, reject) => {
      settle = { resolve, reject };
    });
    // Each queued turn below handles the failure; this only keeps an
    // unobserved rejection from being reported when no lesson is open.
    outcome.catch(() => undefined);

    // Take a turn in every open lesson's queue. A turn starts once that
    // lesson's earlier saves have settled and holds its later ones until the
    // outline change is done; it then leaves the lesson on its new version.
    const turns = [...entries].map(
      ([lessonId, { writer }]) =>
        new Promise<void>((turnStarted) => {
          writer
            .run(async (current) => {
              turnStarted();
              const result = await outcome;
              return (
                result.lessons.find((l) => l.id === lessonId)?.updatedAt ??
                current
              );
            })
            .catch(() => undefined);
        }),
    );
    await Promise.all(turns);

    try {
      const result = await write();
      settle.resolve(result);
      return result;
    } catch (err) {
      settle.reject(err);
      throw err;
    }
  };

  return { register, rewrite };
}
