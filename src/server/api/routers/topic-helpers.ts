export const MAX_TOPICS_PER_COMMUNITY = 10;

/** Derive a URL-safe slug from a topic label (drops emoji/punctuation). */
export function topicSlugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isAtTopicCap(currentCount: number): boolean {
  return currentCount >= MAX_TOPICS_PER_COMMUNITY;
}
