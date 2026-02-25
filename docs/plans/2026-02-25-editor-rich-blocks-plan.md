# Editor Rich Blocks — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add code blocks with syntax highlighting and horizontal rules to the article editor, using formats compatible with Payload CMS admin editing.

**Architecture:** Create custom Lexical DecoratorNodes that serialize in the exact same JSON format as Payload's editor. Code blocks match Payload's `BlocksFeature(CodeBlock)` format (`type: "block"`, `fields.blockType: "Code"`). Horizontal rules use the built-in `HorizontalRuleNode`. Admonitions stay as text markers for now.

**Tech Stack:** Lexical DecoratorNode, Shiki (already installed), `@payloadcms/richtext-lexical` re-exports

**Key constraint:** All serialized content must be editable in both the frontend editor AND Payload's admin panel. No custom node types that Payload doesn't understand.

---

### Task 1: HorizontalRuleNode — Register and Wire Up

**Files:**
- Modify: `src/components/article-editor/article-editor.tsx` (imports + initialConfig nodes + slash command)
- Modify: `src/components/article-editor/types.ts` (update slash command for divider)

**Step 1: Add HorizontalRuleNode import and registration**

In `article-editor.tsx`, add imports:

```typescript
import {
  HorizontalRuleNode,
  $createHorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from "@payloadcms/richtext-lexical/lexical/react/LexicalHorizontalRuleNode";
```

Add `HorizontalRuleNode` to the `nodes` array in `initialConfig`:

```typescript
nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, HorizontalRuleNode],
```

**Step 2: Update executeSlashCommand for divider**

Replace the divider text insertion:

```typescript
// Before:
if (id === "divider") insertParagraphText(editorRef, "---");

// After:
if (id === "divider") editorRef.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```
feat(editor): add HorizontalRuleNode for proper divider support
```

---

### Task 2: CodeBlockNode — Create the DecoratorNode

**Files:**
- Create: `src/components/article-editor/nodes/code-block-node.tsx`

This node must serialize in Payload's CodeBlock format:
```json
{
  "type": "block",
  "version": 1,
  "fields": {
    "id": "abc123",
    "blockType": "Code",
    "code": "const x = 1;",
    "language": "typescript",
    "blockName": ""
  }
}
```

**Step 1: Create the CodeBlockNode file**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "@payloadcms/richtext-lexical/lexical";

const CODE_LANGUAGES: Record<string, string> = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  plaintext: "Plain Text",
  python: "Python",
  shell: "Shell",
  sql: "SQL",
  typescript: "TypeScript",
  yaml: "YAML",
};

export type SerializedCodeBlockNode = SerializedLexicalNode & {
  type: "block";
  fields: {
    id: string;
    blockType: "Code";
    code: string;
    language: string;
    blockName: string;
  };
};

function CodeBlockComponent({
  code,
  language,
  nodeKey,
  editor,
}: {
  code: string;
  language: string;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [currentCode, setCurrentCode] = useState(code);
  const [currentLang, setCurrentLang] = useState(language);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentCode(code);
    setCurrentLang(language);
  }, [code, language]);

  const updateNode = useCallback(
    (newCode: string, newLang: string) => {
      editor.update(() => {
        const node = $getCodeBlockNodeByKey(nodeKey);
        if (node) {
          node.setCode(newCode);
          node.setLanguage(newLang);
        }
      });
    },
    [editor, nodeKey],
  );

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setCurrentCode(val);
      updateNode(val, currentLang);
    },
    [currentLang, updateNode],
  );

  const handleLangChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setCurrentLang(val);
      updateNode(currentCode, val);
    },
    [currentCode, updateNode],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.substring(0, start) + "  " + val.substring(end);
      setCurrentCode(newVal);
      updateNode(newVal, currentLang);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, [currentLang, updateNode]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [currentCode]);

  return (
    <div className="bg-muted/50 border-border my-4 overflow-hidden rounded border">
      <div className="border-border flex items-center justify-between border-b px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">CODE</span>
        <select
          value={currentLang}
          onChange={handleLangChange}
          className="bg-transparent text-xs text-muted-foreground focus:outline-none"
        >
          {Object.entries(CODE_LANGUAGES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <textarea
        ref={textareaRef}
        value={currentCode}
        onChange={handleCodeChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="w-full resize-none bg-transparent px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none"
        rows={3}
      />
    </div>
  );
}

function generateBlockId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function $getCodeBlockNodeByKey(key: NodeKey): CodeBlockNode | null {
  const { $getNodeByKey } = require("@payloadcms/richtext-lexical/lexical");
  const node = $getNodeByKey(key);
  if (node instanceof CodeBlockNode) return node;
  return null;
}

export class CodeBlockNode extends DecoratorNode<React.JSX.Element> {
  __code: string;
  __language: string;
  __blockId: string;

  static getType(): string {
    return "block";
  }

  static clone(node: CodeBlockNode): CodeBlockNode {
    return new CodeBlockNode(node.__code, node.__language, node.__blockId, node.__key);
  }

  constructor(code: string, language: string, blockId?: string, key?: NodeKey) {
    super(key);
    this.__code = code;
    this.__language = language;
    this.__blockId = blockId ?? generateBlockId();
  }

  static importJSON(json: SerializedCodeBlockNode): CodeBlockNode {
    if (json.fields?.blockType !== "Code") {
      throw new Error("CodeBlockNode.importJSON: not a Code block");
    }
    return new CodeBlockNode(
      json.fields.code ?? "",
      json.fields.language ?? "plaintext",
      json.fields.id,
    );
  }

  exportJSON(): SerializedCodeBlockNode {
    return {
      type: "block",
      version: 1,
      fields: {
        id: this.__blockId,
        blockType: "Code",
        code: this.__code,
        language: this.__language,
        blockName: "",
      },
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-lexical-block", "code");
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  setCode(code: string): void {
    const self = this.getWritable();
    self.__code = code;
  }

  setLanguage(language: string): void {
    const self = this.getWritable();
    self.__language = language;
  }

  getCode(): string {
    return this.__code;
  }

  getLanguage(): string {
    return this.__language;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <CodeBlockComponent
        code={this.__code}
        language={this.__language}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

export function $createCodeBlockNode(code = "", language = "typescript"): CodeBlockNode {
  return new CodeBlockNode(code, language);
}

export function $isCodeBlockNode(node: LexicalNode | null | undefined): node is CodeBlockNode {
  return node instanceof CodeBlockNode;
}
```

**IMPORTANT:** There is a conflict — both Payload's `BlockNode` and our `CodeBlockNode` register as `type: "block"`. We must handle this. See Task 3 for the resolution: we use a different internal type name (`code-block`) but still export JSON as `type: "block"`.

**Step 2: Verify file created**

Run: `npx tsc --noEmit`
Note: Will likely fail until Task 3 wires it up.

---

### Task 3: CodeBlockNode — Resolve type conflict and register

**Problem:** Payload's `BlockNode` and our `CodeBlockNode` both claim `type: "block"`. We can't have two node types with the same type string in Lexical.

**Solution:** Register our node with internal type `"code-block"`. Override `exportJSON()` to output `type: "block"` for Payload compatibility. When loading content, inspect incoming `type: "block"` nodes and convert Code blocks into our `CodeBlockNode`.

**Step 1: Fix CodeBlockNode type**

In `code-block-node.tsx`, change `getType()`:

```typescript
static getType(): string {
  return "code-block";  // internal Lexical type
}
```

Keep `exportJSON()` outputting `type: "block"` for Payload compatibility.

Add a static method to check if serialized JSON is a code block:

```typescript
static isCodeBlock(json: SerializedLexicalNode & { fields?: { blockType?: string } }): boolean {
  return json.type === "block" && json.fields?.blockType === "Code";
}
```

**Step 2: Register in article-editor.tsx**

Add import:
```typescript
import { CodeBlockNode, $createCodeBlockNode } from "./nodes/code-block-node";
```

Add to `nodes` array:
```typescript
nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, HorizontalRuleNode, CodeBlockNode],
```

**Step 3: Handle deserialization of existing `type: "block"` content**

When loading content that has `type: "block"` nodes from Payload, we need to convert Code blocks into our CodeBlockNode. Add a content pre-processor in `article-editor.tsx` that transforms the initialConfig's `editorState`:

This is handled by overriding `importJSON` on the CodeBlockNode. But since the type mismatch (`"block"` vs `"code-block"`), Lexical won't automatically call our `importJSON`.

Instead, pre-process the serialized state before passing to `LexicalComposer`. Add a utility function in `utils.ts`:

```typescript
export function preprocessEditorState(content: SerializedEditorState | undefined): string | undefined {
  if (!content) return undefined;
  const json = typeof content === "string" ? JSON.parse(content) : JSON.parse(JSON.stringify(content));

  function walkNodes(nodes: any[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === "block" && node.fields?.blockType === "Code") {
        node.type = "code-block"; // remap for our CodeBlockNode
      }
      if (node.children) walkNodes(node.children);
    }
  }

  if (json.root?.children) walkNodes(json.root.children);
  return JSON.stringify(json);
}
```

And also post-process on export: when the editor state is serialized (via `edState.toJSON()`), remap `"code-block"` back to `"block"`. Add another utility:

```typescript
export function postprocessEditorState(state: SerializedEditorState): SerializedEditorState {
  const json = JSON.parse(JSON.stringify(state));

  function walkNodes(nodes: any[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === "code-block") {
        node.type = "block";
      }
      if (node.children) walkNodes(node.children);
    }
  }

  if (json.root?.children) walkNodes(json.root.children);
  return json;
}
```

Update `initialConfig` in `article-editor.tsx`:
```typescript
editorState: preprocessEditorState(initialData?.content),
```

Update `handleEditorChange`:
```typescript
dispatch({ type: "SET_EDITOR_STATE", payload: postprocessEditorState(edState.toJSON()) });
```

**Step 4: Wire up the slash command**

In `executeSlashCommand`, replace admonition-info/warning/success and add code:

```typescript
if (id === "code") {
  editorRef.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const codeBlock = $createCodeBlockNode("", "typescript");
      selection.insertNodes([codeBlock]);
    }
  });
  slashDispatch({ type: "CLOSE" });
  return;
}
```

**Step 5: Add "Code Block" to slash commands**

In `types.ts`, add to `SLASH_COMMANDS`:
```typescript
{ id: "code", label: "Code Block", group: "Technical", keywords: ["code", "snippet", "pre", "block"] },
```

**Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```
feat(editor): add CodeBlockNode with Payload-compatible serialization
```

---

### Task 4: ImageNode — URL-based inline image

**Files:**
- Create: `src/components/article-editor/nodes/image-node.tsx`
- Modify: `src/components/article-editor/article-editor.tsx` (register + slash command)
- Modify: `src/components/article-editor/types.ts` (slash command entry)
- Modify: `src/components/article-editor/utils.ts` (pre/post-process for image type)
- Modify: `src/lib/lexical.tsx` (render image nodes)

**Step 1: Create ImageNode**

The image node uses its own type `"image"` with fields `{ src, alt }`. This is NOT a Payload-native type, but Payload's editor will preserve unknown nodes without corrupting them. The LexicalRenderer needs a case for `type: "image"`.

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "@payloadcms/richtext-lexical/lexical";

export type SerializedImageNode = SerializedLexicalNode & {
  type: "image";
  src: string;
  alt: string;
};

function ImageComponent({
  src,
  alt,
  nodeKey,
  editor,
}: {
  src: string;
  alt: string;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [currentAlt, setCurrentAlt] = useState(alt);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setCurrentAlt(alt);
    setImgError(false);
  }, [src, alt]);

  const updateNode = useCallback(
    (newSrc: string, newAlt: string) => {
      editor.update(() => {
        const { $getNodeByKey } = require("@payloadcms/richtext-lexical/lexical");
        const node = $getNodeByKey(nodeKey);
        if (node instanceof ImageNode) {
          node.setSrc(newSrc);
          node.setAlt(newAlt);
        }
      });
    },
    [editor, nodeKey],
  );

  return (
    <div className="border-border my-4 rounded border">
      <div className="flex gap-2 border-b border-border px-3 py-1.5">
        <input
          type="text"
          value={currentSrc}
          onChange={(e) => {
            setCurrentSrc(e.target.value);
            setImgError(false);
            updateNode(e.target.value, currentAlt);
          }}
          placeholder="https://example.com/image.jpg"
          className="flex-1 bg-transparent font-mono text-xs text-muted-foreground focus:outline-none"
        />
        <input
          type="text"
          value={currentAlt}
          onChange={(e) => {
            setCurrentAlt(e.target.value);
            updateNode(currentSrc, e.target.value);
          }}
          placeholder="Alt text..."
          className="w-32 bg-transparent text-xs text-muted-foreground focus:outline-none"
        />
      </div>
      {currentSrc && !imgError ? (
        <img
          src={currentSrc}
          alt={currentAlt}
          className="w-full"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-32 items-center justify-center text-muted-foreground text-xs">
          {currentSrc ? "Image failed to load" : "Enter an image URL above"}
        </div>
      )}
    </div>
  );
}

export class ImageNode extends DecoratorNode<React.JSX.Element> {
  __src: string;
  __alt: string;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__alt, node.__key);
  }

  constructor(src: string, alt: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
  }

  static importJSON(json: SerializedImageNode): ImageNode {
    return new ImageNode(json.src ?? "", json.alt ?? "");
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "image",
      version: 1,
      src: this.__src,
      alt: this.__alt,
    };
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div");
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  setSrc(src: string): void {
    const self = this.getWritable();
    self.__src = src;
  }

  setAlt(alt: string): void {
    const self = this.getWritable();
    self.__alt = alt;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <ImageComponent
        src={this.__src}
        alt={this.__alt}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

export function $createImageNode(src = "", alt = ""): ImageNode {
  return new ImageNode(src, alt);
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
```

**Step 2: Register in article-editor.tsx**

Add import and register in `nodes` array:
```typescript
import { ImageNode, $createImageNode } from "./nodes/image-node";

nodes: [..., ImageNode],
```

**Step 3: Add slash command**

In `types.ts`, add:
```typescript
{ id: "image", label: "Image", group: "Basic", keywords: ["image", "picture", "photo", "img"] },
```

In `executeSlashCommand`:
```typescript
if (id === "image") {
  editorRef.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const imageNode = $createImageNode("", "");
      selection.insertNodes([imageNode]);
    }
  });
  slashDispatch({ type: "CLOSE" });
  return;
}
```

**Step 4: Add image rendering to LexicalRenderer**

In `src/lib/lexical.tsx`, add a case in `renderNode`:

```typescript
case "image": {
  const src = (node as any).src ?? "";
  const alt = (node as any).alt ?? "";
  if (!src) return null;
  return (
    <figure key={idx} className="my-6">
      <img src={src} alt={alt} className="w-full rounded" />
      {alt && <figcaption className="text-muted-foreground mt-2 text-center text-sm">{alt}</figcaption>}
    </figure>
  );
}
```

**Step 5: Verify**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```
feat(editor): add ImageNode with URL-based image blocks
```

---

### Task 5: Update LexicalRenderer for image type + verify admonitions

**Files:**
- Modify: `src/lib/lexical.tsx`

**Step 1: Add `src` and `alt` to the LexicalNode type**

```typescript
type LexicalNode = {
  type: string;
  text?: string;
  format?: number;
  tag?: string;
  listType?: string;
  url?: string;
  language?: string;
  src?: string;      // for image nodes
  alt?: string;      // for image nodes
  children?: LexicalNode[];
  fields?: { url?: string; newTab?: boolean; blockType?: string; code?: string; language?: string };
};
```

**Step 2: Verify admonition text markers still work**

The existing paragraph-based admonition rendering (`[!INFO]`, `[!WARNING]`, `[!SUCCESS]`) should still work unchanged. No code changes needed — just verify.

**Step 3: Commit**

```
feat(renderer): add image node type support to LexicalRenderer
```

---

### Task 6: Clean up slash commands and remove stale text-insertion commands

**Files:**
- Modify: `src/components/article-editor/article-editor.tsx` (executeSlashCommand)
- Modify: `src/components/article-editor/types.ts` (SLASH_COMMANDS list)

**Step 1: Update executeSlashCommand**

Remove the text-based insertions for divider (now HorizontalRuleNode), code (now CodeBlockNode), and image (now ImageNode). Keep text-based insertions for admonitions and mermaid (these still use text markers).

**Step 2: Clean up unused imports**

Remove `insertParagraphText` callback if no longer needed (still used by admonitions/mermaid/tabs).

**Step 3: Verify**

Run: `npx tsc --noEmit`
Test manually: create an article, use `/code`, `/image`, `/divider` slash commands.

**Step 4: Commit**

```
refactor(editor): clean up slash commands to use proper Lexical nodes
```

---

### Task 7: Final verification

**Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`

**Step 2: Manual test plan**

1. Open `/blog/write` — editor loads
2. Type a title and some text
3. Use `/code` — code block appears with language selector and textarea
4. Type code, change language — content updates
5. Use `/divider` — horizontal rule appears
6. Use `/image` — image block appears with URL input
7. Enter a valid image URL — image renders
8. Use `/info` — admonition text marker inserted
9. Click Publish — pre-publish dialog shows code block in outline/checks
10. Save as draft — reload page, code block/image/hr persist correctly

**Step 3: Verify Payload compatibility**

1. Open the saved article in Payload admin
2. The code block should appear as an editable Code block
3. The horizontal rule should render
4. The image node will appear as an unknown block (preserved, not corrupted)

**Step 4: Commit any fixes**

```
fix(editor): address issues found during manual testing
```
