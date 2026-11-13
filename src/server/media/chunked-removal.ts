import { RemoveObjectsError, type ObjectStorage } from "./object-storage";

/** S3 deletes at most 1,000 keys per request. */
const REMOVE_BATCH = 1000;

/**
 * Collects keys to delete and removes them in requests S3 accepts, for the
 * reachability sweeps that stream a bucket listing. A request that fails is
 * reported through `onFailure` with the keys still left — only the ones S3
 * refused when it says which (`RemoveObjectsError`), all of them otherwise —
 * and the removal goes on with the next request.
 */
export function chunkedRemoval(
  storage: Pick<ObjectStorage, "remove">,
  onFailure: (keys: readonly string[], error: unknown) => void,
): {
  add(key: string): Promise<void>;
  finish(): Promise<{ removed: number; failed: number }>;
} {
  let pending: string[] = [];
  let removed = 0;
  let failed = 0;
  const flush = async () => {
    if (pending.length === 0) return;
    const keys = pending;
    pending = [];
    try {
      await storage.remove(keys);
      removed += keys.length;
    } catch (error) {
      // S3 deletes what it can; only the keys it refused are left.
      const left =
        error instanceof RemoveObjectsError ? error.failedKeys : keys;
      removed += keys.length - left.length;
      failed += left.length;
      onFailure(left, error);
    }
  };
  return {
    async add(key) {
      pending.push(key);
      if (pending.length >= REMOVE_BATCH) await flush();
    },
    async finish() {
      await flush();
      return { removed, failed };
    },
  };
}
