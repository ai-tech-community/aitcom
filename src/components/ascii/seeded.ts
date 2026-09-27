/**
 * Deterministic randomness for ASCII scenes. Scenes are pure functions of
 * their inputs, so they never call Math.random: every "random" choice is a
 * hash of a seed plus a small integer key naming the decision.
 */

/** 32-bit hash of integer parts (FNV-1a mix + murmur3 finaliser). */
export function hash(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x01000193);
    h ^= h >>> 15;
  }
  // murmur3 finaliser for good avalanche on small integer keys
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable pseudo-random number in [0, 1) for the given key. */
export function rand(...parts: number[]): number {
  return hash(...parts) / 4294967296;
}

/** A stable 32-bit seed for a string key such as a slug. */
export function seedFromString(key: string): number {
  const codes: number[] = [];
  for (let i = 0; i < key.length; i++) codes.push(key.charCodeAt(i));
  return hash(key.length, ...codes);
}
