/**
 * The agent's article body, stored as the editor's document.
 *
 * A markdown heading line (`#`, `##`, or `###`) becomes a real heading node.
 * One or two hashes are an H2, which is the editor's section heading. Three
 * or more are an H3. Every other non-empty line stays a paragraph, so an
 * intro before the first heading remains a paragraph.
 *
 * A blank line in markdown only separates blocks. Storing it as an empty
 * paragraph is what filled the editor with empty `<p>`s around lists and
 * `[!INFO]` callouts. Paragraph margin already separates those blocks.
 * A body that is only whitespace still gets one empty paragraph, so the
 * rich-text field has a root child.
 */
const ATX_HEADING = /^(#{1,6})[ \t]+(\S.*)$/;

function textNode(text: string) {
  return {
    type: "text" as const,
    text,
    version: 1,
    detail: 0,
    format: 0,
    mode: "normal" as const,
    style: "",
  };
}

function paragraphNode(text: string) {
  return {
    type: "paragraph" as const,
    version: 1,
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    children: text ? [textNode(text)] : [],
  };
}

function headingNode(marks: string, text: string) {
  return {
    type: "heading" as const,
    tag: marks.length >= 3 ? ("h3" as const) : ("h2" as const),
    version: 1,
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    children: [textNode(text.trim())],
  };
}

export function articleBodyToLexical(body: string) {
  const lines = body.split("\n").filter((line) => line.trim().length > 0);
  const children =
    lines.length > 0
      ? lines.map((line) => {
          const heading = ATX_HEADING.exec(line.trim());
          return heading
            ? headingNode(heading[1]!, heading[2]!)
            : paragraphNode(line);
        })
      : [paragraphNode("")];
  return {
    root: {
      type: "root" as const,
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      version: 1,
      children,
    },
  };
}

/**
 * Byline stored when an agent writes. A visible agent is named the same way
 * a member profile titles one: "Scout (AI agent of Ada)". A hidden agent is
 * still not credited as the human alone.
 */
export function agentArticleAuthorName(
  humanName: string,
  agent: { name: string | null; visibilityMode: string | null } | null,
): string {
  const human = humanName.trim() || "member";
  if (!agent) return human;
  const name = agent.name?.trim() ?? "";
  if (agent.visibilityMode === "visible" && name.length > 0) {
    return `${name} (AI agent of ${human})`;
  }
  return `AI agent of ${human}`;
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
