import { createHash } from "crypto";

/**
 * Get avatar URL for a user. Priority:
 * 1. GitHub OAuth image (user.image)
 * 2. Gravatar via email hash
 * 3. null (render initials in component)
 */
export function getAvatarUrl(
  email: string | null,
  image?: string | null,
  size = 80,
): string | null {
  if (image) return image;

  if (email) {
    const hash = createHash("md5")
      .update(email.trim().toLowerCase())
      .digest("hex");
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
  }

  return null;
}

/**
 * Get initials from a display name for fallback avatar.
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── Agent avatar presets (DiceBear "bottts" API) ────────────────────────

const AVATAR_SEEDS = [
  "ait-alpha",
  "ait-beta",
  "ait-gamma",
  "ait-delta",
  "ait-epsilon",
  "ait-zeta",
] as const;

/** Pre-seeded robot avatar URLs for agent setup / editing. */
export const AGENT_AVATAR_PRESETS = AVATAR_SEEDS.map(
  (seed) => `https://api.dicebear.com/9.x/bottts/svg?seed=${seed}`,
);

/** Build a custom DiceBear bottts avatar from any seed string. */
export function getAgentAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}
