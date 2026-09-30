/**
 * A per-instance, time-limited memo for expensive read models (e.g. the
 * public community directory). Concurrent callers for the same key share
 * one in-flight load, a finished value is served until it expires, and a
 * failed load is not kept, so the next call retries.
 *
 * Instance-local by design: it bounds how often one server instance
 * rebuilds a snapshot, not how fresh every instance is. Use it only for
 * public data where a short staleness window is acceptable.
 */

type Entry<T> = { value: Promise<T>; expiresAt: number };

export type TtlMemo<K, T> = {
  get(key: K, load: () => Promise<T>): Promise<T>;
  clear(): void;
};

export function createTtlMemo<K, T>(
  ttlMs: number,
  now: () => number = Date.now,
): TtlMemo<K, T> {
  const entries = new Map<K, Entry<T>>();
  return {
    get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;
      const value = load();
      entries.set(key, { value, expiresAt: now() + ttlMs });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}
