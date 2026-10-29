import { parseInlineMarkdown } from "@/lib/articles/inline-markdown";
import { resolveArticleVideo } from "@/lib/articles/video-embed";

/**
 * The agent's article body, stored as the editor's document.
 *
 * A markdown heading line (`#`, `##`, or `###`) becomes a real heading node.
 * One or two hashes are an H2, which is the editor's section heading. Three
 * or more are an H3. Every other non-empty line stays a paragraph, so an
 * intro before the first heading remains a paragraph.
 *
 * Inline markdown links and emphasis become link and text-format nodes, the
 * same marks the editor stores when someone pastes them. A line that is only
 * a YouTube, Vimeo, or Schooltv URL becomes a video block, and so does
 * `videoUrl` when the agent sends one.
 *
 * A blank line in markdown only separates blocks. Storing it as an empty
 * paragraph is what filled the editor with empty `<p>`s around lists and
 * `[!INFO]` callouts. Paragraph margin already separates those blocks.
 * A body that is only whitespace still gets one empty paragraph, so the
 * rich-text field has a root child.
 */
const ATX_HEADING = /^(#{1,6})[ \t]+(\S.*)$/;

function textNode(text: string, format = 0) {
  return {
    type: "text" as const,
    text,
    version: 1,
    detail: 0,
    format,
    mode: "normal" as const,
    style: "",
  };
}

function linkNode(label: string, url: string) {
  return {
    type: "link" as const,
    version: 3,
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    fields: {
      url,
      newTab: true,
      linkType: "custom" as const,
    },
    children: [textNode(label)],
  };
}

function inlineChildren(source: string) {
  const children: Array<
    ReturnType<typeof textNode> | ReturnType<typeof linkNode>
  > = [];
  for (const piece of parseInlineMarkdown(source)) {
    if (piece.kind === "link") {
      children.push(linkNode(piece.text, piece.url));
      continue;
    }
    if (!piece.text) continue;
    children.push(textNode(piece.text, piece.format));
  }
  return children;
}

function paragraphNode(text: string) {
  return {
    type: "paragraph" as const,
    version: 1,
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    children: inlineChildren(text),
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
    children: inlineChildren(text.trim()),
  };
}

function videoBlockId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function videoBlockNode(url: string) {
  return {
    type: "block" as const,
    version: 1,
    fields: {
      id: videoBlockId(),
      blockType: "Video" as const,
      blockName: "",
      url,
    },
  };
}

type ArticleChild =
  | ReturnType<typeof paragraphNode>
  | ReturnType<typeof headingNode>
  | ReturnType<typeof videoBlockNode>;

function videoIdentity(url: string): string {
  const resolved = resolveArticleVideo(url);
  if (!resolved) return url.trim();
  return resolved.kind === "embed" ? resolved.embedSrc : resolved.href;
}

function blockUrl(node: {
  type?: string;
  fields?: { url?: unknown };
}): string | null {
  if (node.type !== "block" || typeof node.fields?.url !== "string")
    return null;
  return node.fields.url;
}

/** A line that is only a YouTube, Vimeo, or Schooltv address. */
function standaloneVideoLine(trimmed: string): string | null {
  if (/\s/.test(trimmed)) return null;
  const video = resolveArticleVideo(trimmed);
  if (!video) return null;
  if (video.kind === "embed" || video.provider === "schooltv") return trimmed;
  return null;
}

function pushVideo(children: ArticleChild[], url: string) {
  const trimmed = url.trim();
  if (!trimmed || !resolveArticleVideo(trimmed)) return;
  const key = videoIdentity(trimmed);
  const already = children.some((node) => {
    const existing = blockUrl(node);
    return existing !== null && videoIdentity(existing) === key;
  });
  if (!already) children.push(videoBlockNode(trimmed));
}

export function articleBodyToLexical(body: string, videoUrl?: string) {
  const lines = body.split("\n").filter((line) => line.trim().length > 0);
  const children: ArticleChild[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const heading = ATX_HEADING.exec(trimmed);
    if (heading) {
      children.push(headingNode(heading[1]!, heading[2]!));
      continue;
    }
    const video = standaloneVideoLine(trimmed);
    if (video) {
      pushVideo(children, video);
      continue;
    }
    children.push(paragraphNode(line));
  }
  if (videoUrl) pushVideo(children, videoUrl);
  if (children.length === 0) children.push(paragraphNode(""));
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

/** Add a video block to stored article JSON. The other blocks stay as they are. */
export function appendArticleVideo(
  content: unknown,
  videoUrl: string,
): ReturnType<typeof articleBodyToLexical> {
  const root = (
    content && typeof content === "object"
      ? (content as { root?: { children?: ArticleChild[] } }).root
      : undefined
  )?.children;
  const children: ArticleChild[] = Array.isArray(root) ? [...root] : [];
  pushVideo(children, videoUrl);
  return {
    root: {
      type: "root",
      direction: "ltr",
      format: "",
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
  videoUrl?: string;
  authorId: string;
  authorName: string;
  magazineId: number;
}) {
  return {
    title: input.title,
    slug: input.slug,
    content: articleBodyToLexical(input.body, input.videoUrl),
    type: "article" as const,
    status: "draft" as const,
    authorId: input.authorId,
    authorName: input.authorName,
    authorType: "member" as const,
    magazine: input.magazineId,
    ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}),
  };
}

/** An edit may change title, body, cover, and video. It cannot publish or approve. */
export function magazineArticlePatch(input: {
  title?: string;
  body?: string;
  mediaUrl?: string | null;
  videoUrl?: string;
  existingContent?: unknown;
}) {
  const content =
    input.body !== undefined
      ? articleBodyToLexical(input.body, input.videoUrl)
      : input.videoUrl
        ? appendArticleVideo(input.existingContent, input.videoUrl)
        : undefined;
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(input.mediaUrl !== undefined
      ? { mediaUrl: input.mediaUrl ?? null }
      : {}),
  };
}

function nestedText(node: { text?: string; children?: unknown }): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.children)) return "";
  return node.children
    .map((child) => nestedText(child as { text?: string; children?: unknown }))
    .join("");
}

/** The text nodes, joined by newlines — the words the agent sent. */
export function articleBodyText(content: unknown): string {
  const children = (
    content as {
      root?: { children?: Array<{ text?: string; children?: unknown }> };
    }
  )?.root?.children;
  if (!Array.isArray(children)) return "";
  return children
    .map((node) => nestedText(node))
    .filter((line) => line.length > 0)
    .join("\n");
}
