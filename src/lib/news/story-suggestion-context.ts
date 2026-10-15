/** Story context shares the suggestion's existing 500-character storage budget. */
export const STORY_SUGGESTION_BODY_LIMIT = 500;

export function storySuggestionContext(storySlug?: string) {
  return storySlug ? `\n\nStory: /news/stories/${storySlug}` : "";
}

export function storySuggestionTextLimit(storySlug?: string) {
  return STORY_SUGGESTION_BODY_LIMIT - storySuggestionContext(storySlug).length;
}
