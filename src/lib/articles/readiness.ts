/**
 * The article dialog's readiness checks. The editor and mark-article-ready
 * both use this, so a heading the dialog would reject is rejected here too.
 */

export const ARTICLE_BLOCKING_MESSAGE = {
  missing_title: "Add a title",
  missing_content: "Add content",
  missing_h2: "Add at least one H2 heading",
  missing_intro: "Add an intro paragraph before first heading",
} as const;

export const ARTICLE_WARNING_MESSAGE = {
  tutorial_no_code: "Tutorial should include at least one code example",
  mermaid: "Mermaid block looks incomplete",
  too_short: "Article is very short",
} as const;

export type ArticleBlockingCode = keyof typeof ARTICLE_BLOCKING_MESSAGE;
export type ArticleWarningCode = keyof typeof ARTICLE_WARNING_MESSAGE;

export type ArticleOutlineItem = { tag: string; text: string };

export type ArticleReadiness = {
  blocking: ArticleBlockingCode[];
  warnings: ArticleWarningCode[];
  outline: ArticleOutlineItem[];
};

type Node = {
  type?: unknown;
  tag?: unknown;
  text?: unknown;
  children?: unknown;
  fields?: { blockType?: unknown };
};

function nodesOf(content: unknown): Node[] {
  const children = (content as { root?: { children?: unknown } } | null)?.root
    ?.children;
  return Array.isArray(children) ? (children as Node[]) : [];
}

function asNode(value: unknown): Node | null {
  return value && typeof value === "object" ? (value as Node) : null;
}

/** Same plain text the editor counts: text leaves, spaces collapsed. */
export function articlePlainText(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  return nodes
    .map((node) => {
      const n = asNode(node);
      if (!n) return "";
      if (typeof n.text === "string") return n.text;
      return articlePlainText(n.children);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCodeNode(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => {
    const n = asNode(node);
    if (!n) return false;
    if (n.type === "code" || n.type === "code-block") return true;
    if (n.type === "block" && n.fields?.blockType === "Code") return true;
    if (Array.isArray(n.children) && hasCodeNode(n.children)) return true;
    return typeof n.text === "string" && n.text.includes("```");
  });
}

function outlineOf(nodes: Node[]): ArticleOutlineItem[] {
  return nodes
    .filter((node) => {
      return (
        node.type === "heading" && (node.tag === "h2" || node.tag === "h3")
      );
    })
    .map((node) => ({
      tag: String(node.tag),
      text: articlePlainText(node.children) || "(untitled heading)",
    }));
}

export function articleReadiness(input: {
  title: string;
  content: unknown;
  type?: string | null;
}): ArticleReadiness {
  const nodes = nodesOf(input.content);
  const plainText = articlePlainText(nodes);
  const wordCount = plainText ? plainText.split(/\s+/).length : 0;
  const blocking: ArticleBlockingCode[] = [];
  if (!input.title.trim()) blocking.push("missing_title");
  if (!plainText.trim()) blocking.push("missing_content");

  const hasH2 = nodes.some(
    (node) => node.type === "heading" && node.tag === "h2",
  );
  if (!hasH2) blocking.push("missing_h2");

  const firstHeading = nodes.findIndex((node) => node.type === "heading");
  const introBeforeHeading =
    firstHeading > 0 &&
    nodes.slice(0, firstHeading).some((node) => {
      return (
        node.type === "paragraph" &&
        articlePlainText(node.children).trim().length > 0
      );
    });
  if (!introBeforeHeading) blocking.push("missing_intro");

  const warnings: ArticleWarningCode[] = [];
  const containsCode = hasCodeNode(nodes) || plainText.includes("```");
  if (input.type === "tutorial" && !containsCode) {
    warnings.push("tutorial_no_code");
  }
  if (plainText.includes("[MERMAID]") && !/graph\s+[A-Z]{2}/.test(plainText)) {
    warnings.push("mermaid");
  }
  if (wordCount > 0 && wordCount < 120) warnings.push("too_short");

  return { blocking, warnings, outline: outlineOf(nodes) };
}

export type ArticleReadyStep =
  | "blocked"
  | "ready"
  | "awaiting_editor"
  | "forbidden"
  | "submit";

/**
 * What mark-article-ready may do. A failing check writes nothing. An article
 * already approved stays approved. One waiting on an editor is not approved
 * by the agent. A published or rejected article is left alone.
 */
export function articleReadyStep(input: {
  blocking: readonly unknown[];
  reviewStatus: string | null | undefined;
  status: string | null | undefined;
}): ArticleReadyStep {
  if (input.blocking.length > 0) return "blocked";
  if (input.reviewStatus === "approved") return "ready";
  if (input.reviewStatus === "pending_review") return "awaiting_editor";
  if (input.status === "published" || input.reviewStatus === "rejected") {
    return "forbidden";
  }
  return "submit";
}
