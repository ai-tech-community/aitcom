import type { SlashCommand } from "./types";
import { SLASH_COMMANDS } from "./types";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { slugify } from "@/lib/text-utils";

export function extractPlainText(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";

  return nodes
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      const n = node as Record<string, unknown>;
      if (typeof n.text === "string") return n.text;
      return extractPlainText(n.children);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasCodeNode(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false;

  return nodes.some((node) => {
    if (!node || typeof node !== "object") return false;
    const n = node as Record<string, unknown>;
    if (n.type === "code" || n.type === "code-block") return true;
    const fields = n.fields;
    if (
      n.type === "block" &&
      fields &&
      typeof fields === "object" &&
      "blockType" in fields &&
      (fields as { blockType?: unknown }).blockType === "Code"
    ) {
      return true;
    }
    if (Array.isArray(n.children) && hasCodeNode(n.children)) return true;
    if (typeof n.text === "string" && n.text.includes("```")) return true;
    return false;
  });
}

export function getHeadingOutline(
  nodes: unknown,
): Array<{ tag: string; text: string }> {
  if (!Array.isArray(nodes)) return [];

  return nodes
    .filter((node) => {
      if (!node || typeof node !== "object") return false;
      const n = node as Record<string, unknown>;
      return n.type === "heading" && (n.tag === "h2" || n.tag === "h3");
    })
    .map((node) => {
      const n = node as Record<string, unknown>;
      return {
        tag: String(n.tag),
        text: extractPlainText(n.children) || "(untitled heading)",
      };
    });
}

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter((command) => {
    return (
      command.label.toLowerCase().includes(q) ||
      command.id.toLowerCase().includes(q) ||
      command.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });
}

export function generateSlug(title: string): string {
  return slugify(title);
}

export function preprocessEditorState(
  content: SerializedEditorState | undefined,
): string | undefined {
  if (!content) return undefined;
  type MutableSerializedNode = {
    type?: string;
    fields?: {
      blockType?: string;
      id?: string;
      src?: string;
      alt?: string;
      blockName?: string;
    };
    children?: MutableSerializedNode[];
    src?: string;
    alt?: string;
  };
  type MutableSerializedState = {
    root?: {
      children?: MutableSerializedNode[];
    };
  };

  const json = JSON.parse(JSON.stringify(content)) as MutableSerializedState;

  function walkNodes(nodes: MutableSerializedNode[]): void {
    for (const node of nodes) {
      if (node.type === "block" && node.fields?.blockType === "Code") {
        node.type = "code-block"; // remap for our CodeBlockNode
      }
      if (node.type === "block" && node.fields?.blockType === "Image") {
        node.type = "image"; // remap for our ImageNode
      }
      if (Array.isArray(node.children)) walkNodes(node.children);
    }
  }

  if (Array.isArray(json.root?.children)) walkNodes(json.root.children);
  return JSON.stringify(json);
}

export function postprocessEditorState(
  state: SerializedEditorState,
): SerializedEditorState {
  type MutableSerializedNode = {
    type?: string;
    fields?: {
      blockType?: string;
      id?: string;
      src?: string;
      alt?: string;
      blockName?: string;
    };
    children?: MutableSerializedNode[];
    src?: string;
    alt?: string;
  };
  type MutableSerializedState = {
    root?: {
      children?: MutableSerializedNode[];
    };
  };

  const json = JSON.parse(JSON.stringify(state)) as MutableSerializedState;

  function walkNodes(nodes: MutableSerializedNode[]): void {
    for (const node of nodes) {
      if (node.type === "code-block" && node.fields?.blockType) {
        node.type = "block";
      }
      if (node.type === "image") {
        node.type = "block";
        // Ensure fields wrapper exists (handles old-format images with top-level src/alt)
        if (!node.fields?.blockType) {
          node.fields = {
            id:
              node.fields?.id ??
              crypto.randomUUID().replace(/-/g, "").substring(0, 12),
            blockType: "Image",
            src: node.fields?.src ?? node.src ?? "",
            alt: node.fields?.alt ?? node.alt ?? "",
            blockName: "",
          };
          delete node.src;
          delete node.alt;
        }
      }
      if (Array.isArray(node.children)) walkNodes(node.children);
    }
  }

  if (Array.isArray(json.root?.children)) walkNodes(json.root.children);
  return json as SerializedEditorState;
}
