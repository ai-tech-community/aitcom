import { storylineSlugSchema } from "./storylines";
import { storylineTopicKey } from "./research-brief";

/** Headlines from the last seven days. `at` is the story's own timestamp. */
export type WeeklyNewsItem = {
  id: string;
  title: string;
  at: Date;
};

export type WeeklyTopic = {
  /** A collected article's own headline. Never rewritten or invented. */
  title: string;
  topicKey: string;
  articleIds: string[];
  newestAt: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOPIC_LIMIT = 5;

const STOP = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "to",
  "in",
  "on",
  "for",
  "with",
  "from",
  "by",
  "at",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "new",
  "its",
  "it",
  "this",
  "that",
  "after",
  "over",
  "into",
  "their",
  "how",
  "why",
  "what",
  "who",
  "will",
  "has",
  "have",
  "had",
  "but",
  "not",
  "via",
  "per",
  "than",
  "then",
  "about",
]);

function tokens(title: string): string[] {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function phraseOk(words: string[]): boolean {
  if (words.length < 2 || words.length > 4) return false;
  if (words.some((word) => word.length < 2)) return false;
  if (STOP.has(words[0]!) || STOP.has(words.at(-1)!)) return false;
  const content = words.filter((word) => !STOP.has(word));
  return content.some((word) => word.length >= 4) || content.length >= 2;
}

function usableKey(
  title: string,
  occupied: ReadonlySet<string>,
): string | null {
  const topicKey = storylineTopicKey(title);
  if (!storylineSlugSchema.safeParse(topicKey).success) return null;
  if (occupied.has(topicKey)) return null;
  return topicKey;
}

type Candidate = WeeklyTopic & { score: number };

function storedHeadline(title: string): string | null {
  const headline = title.trim().replace(/\s+/g, " ");
  if (headline.length < 12 || headline.length > 200) return null;
  return headline;
}

/**
 * Up to five topics taken from this week's headlines.
 * Articles that share a phrase are one cluster. The topic title is the
 * newest article's own headline in that cluster, never the phrase itself.
 * Remaining slots use other stored headlines. Returns nothing when the week
 * has no usable headline.
 */
export function suggestWeeklyTopics(
  items: readonly WeeklyNewsItem[],
  occupied: ReadonlySet<string>,
  now: Date,
): WeeklyTopic[] {
  const weekAgo = now.getTime() - WEEK_MS;
  const fresh = items.filter((item) => {
    const at = item.at.getTime();
    return (
      item.title.trim().length > 0 &&
      Number.isFinite(at) &&
      at >= weekAgo &&
      at <= now.getTime()
    );
  });
  if (fresh.length === 0) return [];

  const groups = new Map<
    string,
    { words: string[]; articles: Map<string, WeeklyNewsItem> }
  >();
  for (const item of fresh) {
    const words = tokens(item.title);
    const seen = new Set<string>();
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index + size <= words.length; index += 1) {
        const slice = words.slice(index, index + size);
        if (!phraseOk(slice)) continue;
        const key = slice.join(" ");
        if (seen.has(key)) continue;
        seen.add(key);
        const group = groups.get(key) ?? {
          words: slice,
          articles: new Map<string, WeeklyNewsItem>(),
        };
        group.articles.set(item.id, item);
        groups.set(key, group);
      }
    }
  }

  const shared: Candidate[] = [];
  for (const group of groups.values()) {
    if (group.articles.size < 2) continue;
    const articles = [...group.articles.values()].sort(
      (a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id),
    );
    let chosen: WeeklyNewsItem | null = null;
    let title = "";
    let topicKey: string | null = null;
    for (const article of articles) {
      const headline = storedHeadline(article.title);
      if (!headline) continue;
      const key = usableKey(headline, occupied);
      if (!key) continue;
      chosen = article;
      title = headline;
      topicKey = key;
      break;
    }
    if (!chosen || !topicKey) continue;
    shared.push({
      title,
      topicKey,
      articleIds: articles.map((article) => article.id),
      newestAt: chosen.at.toISOString(),
      score: articles.length * 10 + group.words.length,
    });
  }
  shared.sort(
    (a, b) =>
      b.score - a.score ||
      b.newestAt.localeCompare(a.newestAt) ||
      a.topicKey.localeCompare(b.topicKey),
  );

  const picked: Candidate[] = [];
  const usedArticles = new Set<string>();
  const usedKeys = new Set<string>();
  for (const candidate of shared) {
    if (picked.length >= TOPIC_LIMIT) break;
    if (usedKeys.has(candidate.topicKey)) continue;
    if (candidate.articleIds.every((id) => usedArticles.has(id))) continue;
    if (
      picked.some(
        (topic) =>
          topic.title.toLowerCase().includes(candidate.title.toLowerCase()) ||
          candidate.title.toLowerCase().includes(topic.title.toLowerCase()),
      )
    ) {
      continue;
    }
    picked.push(candidate);
    usedKeys.add(candidate.topicKey);
    for (const id of candidate.articleIds) usedArticles.add(id);
  }

  const singles = [...fresh].sort(
    (a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id),
  );
  for (const item of singles) {
    if (picked.length >= TOPIC_LIMIT) break;
    if (usedArticles.has(item.id)) continue;
    const title = storedHeadline(item.title);
    if (!title) continue;
    const topicKey = usableKey(title, occupied);
    if (!topicKey || usedKeys.has(topicKey)) continue;
    picked.push({
      title,
      topicKey,
      articleIds: [item.id],
      newestAt: item.at.toISOString(),
      score: 1,
    });
    usedKeys.add(topicKey);
    usedArticles.add(item.id);
  }

  return picked
    .slice(0, TOPIC_LIMIT)
    .map(({ score: _score, ...topic }) => topic);
}
