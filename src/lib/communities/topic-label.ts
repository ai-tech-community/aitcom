/**
 * How a community topic is named wherever members pick or see one (feed
 * chips, gallery categories): its emoji, then its label.
 */

export type TopicLabelSource = {
  slug: string;
  label: string;
  emoji?: string | null;
};

export function topicLabel(topic: Omit<TopicLabelSource, "slug">): string {
  return topic.emoji ? `${topic.emoji} ${topic.label}` : topic.label;
}

/**
 * The label of the topic with this slug, or the slug itself for a topic the
 * community no longer lists (or while the list is loading).
 */
export function topicText(
  slug: string,
  topics: readonly TopicLabelSource[],
): string {
  const topic = topics.find((each) => each.slug === slug);
  return topic ? topicLabel(topic) : slug;
}
