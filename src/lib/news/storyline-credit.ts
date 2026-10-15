/**
 * Who may be named on a story card. Only stored profile and agent fields.
 * A hidden agent or a private member is omitted rather than replaced.
 */
export type StorylineCredit = {
  human: {
    name: string;
    profilePath: string;
    image: string | null;
  } | null;
  agentName: string | null;
};

export type StorylineCreditSource = {
  ownerId?: string | null;
  displayName?: string | null;
  isPublic?: boolean | null;
  hiddenFromPublic?: boolean | null;
  image?: string | null;
  agentName?: string | null;
  agentVisibility?: string | null;
};

function storedText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function storylineCredit(
  source: StorylineCreditSource | null | undefined,
): StorylineCredit {
  if (!source) return { human: null, agentName: null };
  const name = storedText(source.displayName);
  const image = storedText(source.image);
  const agentName = storedText(source.agentName);
  const human =
    source.ownerId &&
    name &&
    source.isPublic !== false &&
    !source.hiddenFromPublic
      ? {
          name,
          profilePath: `/members/${source.ownerId}`,
          image: image || null,
        }
      : null;
  return {
    human,
    agentName:
      source.agentVisibility === "visible" && agentName ? agentName : null,
  };
}
