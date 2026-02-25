# Editor Rich Blocks — Custom Lexical Nodes

**Date**: 2026-02-25
**Status**: Approved
**Scope**: `src/components/article-editor/`, `src/lib/lexical.tsx`

## Problem

The article editor inserts raw text markers (`[TABS]`, `[!INFO]`, `` ```ts ``) instead of structured blocks. Content looks like plain text in the editor despite rendering correctly on the blog read page.

## Solution

Add 4 custom Lexical DecoratorNodes to make the editor WYSIWYG:

### 1. CodeBlockNode

- **Editor**: Editable `<textarea>` with monospace font, language dropdown (top-right), Shiki syntax highlighting via existing `CodeBlock` component
- **Slash command**: `/code`
- **Serialization**: `{ type: "code", language: string, code: string }` — already handled by `LexicalRenderer`
- **Tab key**: Inserts 2 spaces instead of changing focus

### 2. ImageNode

- **Editor**: URL input field + live `<img>` preview below. Dashed placeholder when empty/invalid.
- **Slash command**: `/image`
- **Serialization**: `{ type: "image", src: string, alt: string }` — add to `LexicalRenderer`
- **Alt text**: Editable text field below image

### 3. HorizontalRuleNode

- **Editor**: Thin `<hr>` line, non-editable
- **Slash command**: `/divider`
- **Serialization**: `{ type: "horizontalrule" }` — already handled by `LexicalRenderer`
- **Source**: Already available in `@payloadcms/richtext-lexical` — just register it

### 4. AdmonitionNode

- **Editor**: Styled callout box with colored left border (blue=info, orange=warning, green=success), editable text content
- **Slash commands**: `/info`, `/warning`, `/success`
- **Serialization**: `{ type: "admonition", variant: "info" | "warning" | "success", text: string }` — add to `LexicalRenderer`

## File Structure

```
src/components/article-editor/
  nodes/
    code-block-node.tsx     # CodeBlockNode DecoratorNode
    image-node.tsx          # ImageNode DecoratorNode
    admonition-node.tsx     # AdmonitionNode DecoratorNode
```

HorizontalRuleNode comes from the package — no custom file needed.

## Compatibility

- Existing articles with text markers (`[!INFO]`, `[TABS]`, etc.) continue to work — LexicalRenderer still handles them
- New articles use structured nodes for proper WYSIWYG editing
- Serialized content works with both the editor and the blog reader

## What's NOT Changing

- Slash command menu UI and keyboard navigation
- Autosave and save/submit flow
- Lexical editor theme/config (beyond adding new nodes)
- Existing text-based nodes (headings, paragraphs, quotes, lists)
