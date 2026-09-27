/**
 * In-memory Web Storage for tests. Node 25+ ships its own global
 * localStorage/sessionStorage that shadows jsdom's and has no methods unless
 * started with --localstorage-file, so tests that touch storage install this.
 */
export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}
