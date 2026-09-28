import { resolveEmbed } from "./embed-providers";

/**
 * Pure helpers over a lesson's stored Lexical JSON. Stored material blocks
 * use Payload's BlocksFeature shape (spec 2026-09-27 §3.2) and hold
 * references only: an Embed holds the author's link, a HostedFile holds a
 * hosted-materials id. Everything else is resolved when rendering.
 */
export type EmbedBlockNode = {
  type: "block";
  version: 2;
  format: "";
  fields: { id: string; blockName: ""; blockType: "Embed"; url: string };
};

export type HostedFileBlockNode = {
  type: "block";
  version: 2;
  format: "";
  fields: {
    id: string;
    blockName: "";
    blockType: "HostedFile";
    materialId: number;
  };
};

type BlockFields = { blockType?: unknown; url?: unknown; materialId?: unknown };

type AnyNode = {
  type?: unknown;
  fields?: BlockFields;
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

export function hostedFileBlockNode(
  materialId: number,
  id: string,
): HostedFileBlockNode {
  return {
    type: "block",
    version: 2,
    format: "",
    fields: { id, blockName: "", blockType: "HostedFile", materialId },
  };
}

/** A usable material id: a positive safe integer (Payload ids start at 1). */
export function isMaterialId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
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

/** Visit the fields of every block node, at any depth, in document order. */
function walkBlocks(body: unknown, visit: (fields: BlockFields) => void): void {
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const raw of nodes) {
      const node = raw as AnyNode | null;
      if (node?.type === "block" && node.fields) visit(node.fields);
      walk(node?.children);
    }
  };
  walk(parseBody(body)?.root?.children);
}

export function collectEmbedUrls(body: unknown): string[] {
  const urls: string[] = [];
  walkBlocks(body, (fields) => {
    if (fields.blockType === "Embed") {
      urls.push(typeof fields.url === "string" ? fields.url : "");
    }
  });
  return urls;
}

/**
 * The material id of every HostedFile block, at any depth, in order (repeats
 * kept). A block without a usable id contributes 0, which is never a valid
 * id: the server refuses it on save and the renderer shows nothing for it.
 */
export function collectMaterialIds(body: unknown): number[] {
  const ids: number[] = [];
  walkBlocks(body, (fields) => {
    if (fields.blockType === "HostedFile") {
      ids.push(isMaterialId(fields.materialId) ? fields.materialId : 0);
    }
  });
  return ids;
}

export function invalidEmbedUrls(body: unknown): string[] {
  return collectEmbedUrls(body).filter((url) => resolveEmbed(url) === null);
}

function isIncompleteMaterial(node: AnyNode | null): boolean {
  if (node?.type !== "block") return false;
  const fields = node.fields;
  if (fields?.blockType === "Embed") {
    return typeof fields.url !== "string" || fields.url.trim() === "";
  }
  if (fields?.blockType === "HostedFile") {
    return !isMaterialId(fields.materialId);
  }
  return false;
}

/**
 * Drop material blocks the author inserted but never completed — an Embed
 * without a link, a HostedFile without a file — at any depth, so an
 * abandoned placeholder doesn't block saving the lesson. Returns a new body;
 * input that isn't a Lexical body comes back unchanged. The server still
 * rejects incomplete blocks sent by any other client.
 */
export function stripIncompleteMaterials(body: unknown): unknown {
  const parsed = parseBody(body);
  const rootNode = parsed?.root as AnyNode | undefined;
  if (
    !rootNode ||
    typeof rootNode !== "object" ||
    !Array.isArray(rootNode.children)
  )
    return body;
  const prune = (nodes: readonly unknown[]): unknown[] =>
    nodes
      .filter((raw) => !isIncompleteMaterial(raw as AnyNode | null))
      .map((raw: unknown) => {
        const node = raw as AnyNode;
        return node && typeof node === "object" && Array.isArray(node.children)
          ? { ...node, children: prune(node.children as unknown[]) }
          : raw;
      });
  return {
    ...parsed,
    root: { ...rootNode, children: prune(rootNode.children as unknown[]) },
  };
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
    return {
      kind: "embed",
      body: prependEmbedBlock(input.body, url, input.blockId),
    };
  }
  if (input.resourceUrls.includes(url)) return { kind: "skip" };
  return { kind: "resource", label: "Video", url };
}
