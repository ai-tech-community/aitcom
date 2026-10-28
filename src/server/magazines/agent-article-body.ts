/**
 * The agent's article body, stored as Lexical paragraphs without adding or
 * joining words. One line is one paragraph. Empty lines stay empty paragraphs
 * so a blank line in the draft is still a blank line.
 */
export function articleBodyToLexical(body: string) {
  return {
    root: {
      type: "root" as const,
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      version: 1,
      children: body.split("\n").map((line) => ({
        type: "paragraph" as const,
        version: 1,
        direction: "ltr" as const,
        format: "" as const,
        indent: 0,
        children: line
          ? [
              {
                type: "text" as const,
                text: line,
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal" as const,
                style: "",
              },
            ]
          : [],
      })),
    },
  };
}

/** Fields an agent may create. Status stays a draft; review waits for a person. */
export function magazineArticleCreateData(input: {
  title: string;
  slug: string;
  body: string;
  mediaUrl?: string | null;
  authorId: string;
  authorName: string;
  magazineId: number;
}) {
  return {
    title: input.title,
    slug: input.slug,
    content: articleBodyToLexical(input.body),
    type: "article" as const,
    status: "draft" as const,
    authorId: input.authorId,
    authorName: input.authorName,
    authorType: "member" as const,
    magazine: input.magazineId,
    ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}),
  };
}

/** An edit may change title, body and cover. It cannot publish or approve. */
export function magazineArticlePatch(input: {
  title?: string;
  body?: string;
  mediaUrl?: string | null;
}) {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined
      ? { content: articleBodyToLexical(input.body) }
      : {}),
    ...(input.mediaUrl !== undefined
      ? { mediaUrl: input.mediaUrl ?? null }
      : {}),
  };
}

/** The text nodes, joined by newlines — the body the agent sent. */
export function articleBodyText(content: unknown): string {
  const children = (
    content as {
      root?: { children?: Array<{ children?: Array<{ text?: string }> }> };
    }
  )?.root?.children;
  if (!Array.isArray(children)) return "";
  return children
    .map((paragraph) =>
      (paragraph.children ?? []).map((node) => node.text ?? "").join(""),
    )
    .join("\n");
}
