import type { ItemKindId } from "./item-views";

/** A content reference shared by the item strategies and the builder. */
export function itemReference(kind: ItemKindId, id: string | number): string {
  return `${kind}:${id}`;
}

/** Input identities live here so client and server always name the same content. */
export function articleInputReference(input: { articleId: number }): string {
  return itemReference("article", Number(input.articleId));
}

export function storylineInputReference(input: {
  storylineId: string;
}): string {
  return itemReference("storyline", input.storylineId);
}

export function newsItemInputReference(input: { newsItemId: string }): string {
  return itemReference("newsItem", input.newsItemId);
}

export function eventInputReference(input: { eventId: number }): string {
  return itemReference("event", Number(input.eventId));
}

export function forumThreadInputReference(input: { threadId: number }): string {
  return itemReference("forumThread", Number(input.threadId));
}

export function launchpadProjectInputReference(input: {
  projectId: number;
}): string {
  return itemReference("launchpadProject", Number(input.projectId));
}
