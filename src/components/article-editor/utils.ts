import type { SlashCommand } from "./types";
import { SLASH_COMMANDS } from "./types";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";

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
    if (n.type === "block" && (n as Record<string, any>).fields?.blockType === "Code") return true;
    if (Array.isArray(n.children) && hasCodeNode(n.children)) return true;
    if (typeof n.text === "string" && n.text.includes("```")) return true;
    return false;
  });
}

export function getHeadingOutline(nodes: unknown): Array<{ tag: string; text: string }> {
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
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function preprocessEditorState(content: SerializedEditorState | undefined): string | undefined {
  if (!content) return undefined;
  const json = JSON.parse(JSON.stringify(content));

  function walkNodes(nodes: any[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === "block" && node.fields?.blockType === "Code") {
        node.type = "code-block"; // remap for our CodeBlockNode
      }
      if (node.type === "block" && node.fields?.blockType === "Image") {
        node.type = "image"; // remap for our ImageNode
      }
      if (node.children) walkNodes(node.children);
    }
  }

  if (json.root?.children) walkNodes(json.root.children);
  return JSON.stringify(json);
}

export function postprocessEditorState(state: SerializedEditorState): SerializedEditorState {
  const json = JSON.parse(JSON.stringify(state));

  function walkNodes(nodes: any[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === "code-block" && node.fields?.blockType) {
        node.type = "block";
      }
      if (node.type === "image") {
        node.type = "block";
        // Ensure fields wrapper exists (handles old-format images with top-level src/alt)
        if (!node.fields?.blockType) {
          node.fields = {
            id: node.fields?.id ?? crypto.randomUUID().replace(/-/g, "").substring(0, 12),
            blockType: "Image",
            src: node.fields?.src ?? node.src ?? "",
            alt: node.fields?.alt ?? node.alt ?? "",
            blockName: "",
          };
          delete node.src;
          delete node.alt;
        }
      }
      if (node.children) walkNodes(node.children);
    }
  }

  if (json.root?.children) walkNodes(json.root.children);
  return json;
}
