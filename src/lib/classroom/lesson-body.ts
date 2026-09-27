import { resolveEmbed } from "./embed-providers";

/**
 * Pure helpers over a lesson's stored Lexical JSON. Stored Embed blocks use
 * Payload's BlocksFeature shape (spec 2026-09-27 §3.2) and hold only the
 * author's link — the embed address is resolved when rendering.
 */
export type EmbedBlockNode = {
  type: "block";
  version: 2;
  format: "";
  fields: { id: string; blockName: ""; blockType: "Embed"; url: string };
};

type AnyNode = {
  type?: unknown;
  fields?: { blockType?: unknown; url?: unknown };
  children?: unknown;
};

export function embedBlockNode(url: string, id: string): EmbedBlockNode {
  return {
    type: "block",
    version: 2,
    format: "",
    fields: { id, blockName: "", blockType: "Embed", url },
  };
}

function parseBody(body: unknown): { root?: { children?: unknown } } | null {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as { root?: { children?: unknown } };
    } catch {
      return null;
    }
  }
  return body && typeof body === "object"
    ? (body as { root?: { children?: unknown } })
    : null;
}

export function collectEmbedUrls(body: unknown): string[] {
  const urls: string[] = [];
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const raw of nodes) {
      const node = raw as AnyNode;
      if (node?.type === "block" && node.fields?.blockType === "Embed") {
        urls.push(typeof node.fields.url === "string" ? node.fields.url : "");
      }
      walk(node?.children);
    }
  };
  walk(parseBody(body)?.root?.children);
  return urls;
}

export function invalidEmbedUrls(body: unknown): string[] {
  return collectEmbedUrls(body).filter((url) => resolveEmbed(url) === null);
}

function isEmptyEmbed(node: AnyNode): boolean {
  if (node?.type !== "block" || node.fields?.blockType !== "Embed") return false;
  const url = node.fields.url;
  return typeof url !== "string" || url.trim() === "";
}

/**
 * Drop Embed blocks the author inserted but never gave a link, at any
 * depth, so an abandoned placeholder doesn't block saving the lesson. Returns
 * a new body; input that isn't a Lexical body comes back unchanged. The
 * server still rejects an empty Embed sent by any other client.
 */
export function stripEmptyEmbeds(body: unknown): unknown {
  const parsed = parseBody(body);
  const rootNode = parsed?.root as AnyNode | undefined;
  if (!rootNode || typeof rootNode !== "object" || !Array.isArray(rootNode.children))
    return body;
  const prune = (nodes: unknown): unknown => {
    if (!Array.isArray(nodes)) return nodes;
    return nodes
      .filter((raw) => !isEmptyEmbed(raw as AnyNode))
      .map((raw) => {
        const node = raw as AnyNode;
        return node && typeof node === "object" && Array.isArray(node.children)
          ? { ...node, children: prune(node.children) }
          : raw;
      });
  };
  return { ...parsed, root: { ...rootNode, children: prune(rootNode.children) } };
}

export function prependEmbedBlock(
  body: unknown,
  url: string,
  id: string,
): { root: Record<string, unknown> } {
  const parsed = parseBody(body);
  const copy = parsed
    ? (JSON.parse(JSON.stringify(parsed)) as { root?: Record<string, unknown> })
    : {};
  // A corrupt stored root (string, number, array) is replaced, not kept:
  // one bad row must not abort a whole data migration.
  const rootNode: Record<string, unknown> =
    copy.root && typeof copy.root === "object" && !Array.isArray(copy.root)
      ? copy.root
      : { type: "root", format: "", indent: 0, version: 1, direction: null };
  const children = Array.isArray(rootNode.children) ? rootNode.children : [];
  rootNode.children = [embedBlockNode(url, id), ...children];
  return { root: rootNode };
}

export type YoutubeMigrationStep =
  | { kind: "skip" }
  | { kind: "embed"; body: { root: Record<string, unknown> } }
  | { kind: "resource"; label: string; url: string };

/** What to do with one lesson's legacy youtubeUrl. Idempotent. */
export function planYoutubeMigration(input: {
  body: unknown;
  youtubeUrl: string | null;
  resourceUrls: string[];
  blockId: string;
}): YoutubeMigrationStep {
  const url = input.youtubeUrl?.trim() ?? "";
  if (!url) return { kind: "skip" };
  if (resolveEmbed(url)) {
    if (collectEmbedUrls(input.body).includes(url)) return { kind: "skip" };
    return { kind: "embed", body: prependEmbedBlock(input.body, url, input.blockId) };
  }
  if (input.resourceUrls.includes(url)) return { kind: "skip" };
  return { kind: "resource", label: "Video", url };
}
