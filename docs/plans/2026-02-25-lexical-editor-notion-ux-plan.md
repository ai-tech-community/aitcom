# Lexical Editor Notion UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a Notion-style Lexical editor experience for member articles with slash commands, technical blocks, autosave confidence states, and submit guardrails.

**Architecture:** Extend the current `ArticleEditor` incrementally. Move editor logic into small testable modules (slash commands, validation, metrics, autosave status), wire new UI plugins into Lexical, and keep the existing tRPC mutations (`create`, `update`, `submit`) as the persistence boundary.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Payload Lexical, tRPC, next-intl, Vitest + Testing Library.

---

### Task 1: Add Test Harness For Editor Logic

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/components/article-editor/__tests__/sanity.test.ts`

**Step 1: Write the failing test**

```ts
// src/components/article-editor/__tests__/sanity.test.ts
import { describe, expect, it } from "vitest";

describe("article editor test harness", () => {
  it("runs unit tests", () => {
    expect(true).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run src/components/article-editor/__tests__/sanity.test.ts`  
Expected: FAIL (`Missing script: test` or Vitest not installed)

**Step 3: Write minimal implementation**

- Add scripts in `package.json`:
  - `"test": "vitest"`
  - `"test:run": "vitest run"`
- Add dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- Add `vitest.config.ts` with `environment: "jsdom"` and setup file
- Add `src/test/setup.ts` with `import "@testing-library/jest-dom/vitest";`

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/sanity.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add package.json vitest.config.ts src/test/setup.ts src/components/article-editor/__tests__/sanity.test.ts
git commit -m "test(editor): add vitest harness for article editor"
```

### Task 2: Extract Editor Metrics Helpers (Word Count + Reading Time)

**Files:**
- Create: `src/components/article-editor/lib/metrics.ts`
- Create: `src/components/article-editor/__tests__/metrics.test.ts`
- Modify: `src/components/article-editor.tsx`

**Step 1: Write the failing test**

```ts
// src/components/article-editor/__tests__/metrics.test.ts
import { describe, expect, it } from "vitest";
import { estimateReadingMinutes, countWords } from "../lib/metrics";

describe("metrics", () => {
  it("counts words from plain text", () => {
    expect(countWords("Hello world from AIT")).toBe(4);
  });

  it("estimates reading minutes with floor of 1", () => {
    expect(estimateReadingMinutes(20)).toBe(1);
    expect(estimateReadingMinutes(520)).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/article-editor/__tests__/metrics.test.ts`  
Expected: FAIL (`Cannot find module ../lib/metrics`)

**Step 3: Write minimal implementation**

```ts
// src/components/article-editor/lib/metrics.ts
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function estimateReadingMinutes(wordCount: number, wpm = 220): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / wpm));
}
```

Use these helpers in `article-editor.tsx` to display live word count + reading time in the new sticky status strip.

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/metrics.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/article-editor/lib/metrics.ts src/components/article-editor/__tests__/metrics.test.ts src/components/article-editor.tsx
git commit -m "feat(editor): add word count and reading time metrics"
```

### Task 3: Build Slash Command Registry + Fuzzy Filter

**Files:**
- Create: `src/components/article-editor/lib/slash-commands.ts`
- Create: `src/components/article-editor/__tests__/slash-commands.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { filterSlashCommands, SLASH_COMMANDS } from "../lib/slash-commands";

describe("slash commands", () => {
  it("includes technical commands", () => {
    expect(SLASH_COMMANDS.some((c) => c.id === "admonition-warning")).toBe(true);
    expect(SLASH_COMMANDS.some((c) => c.id === "mermaid")).toBe(true);
  });

  it("filters by fuzzy text", () => {
    const result = filterSlashCommands("warn").map((c) => c.id);
    expect(result).toContain("admonition-warning");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/article-editor/__tests__/slash-commands.test.ts`  
Expected: FAIL (`Cannot find module ../lib/slash-commands`)

**Step 3: Write minimal implementation**

Create `slash-commands.ts` with:
- `SlashCommand` type
- grouped command list (`Basic`, `Technical`, `Media`, `Structure`)
- `filterSlashCommands(query)` with case-insensitive includes matching on id/title/keywords

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/slash-commands.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/article-editor/lib/slash-commands.ts src/components/article-editor/__tests__/slash-commands.test.ts
git commit -m "feat(editor): add slash command registry and fuzzy filter"
```

### Task 4: Add Validation Rules Engine (Blocking + Warnings)

**Files:**
- Create: `src/components/article-editor/lib/validation.ts`
- Create: `src/components/article-editor/__tests__/validation.test.ts`
- Modify: `src/components/article-editor.tsx`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { validateArticleDraft } from "../lib/validation";

describe("article validation", () => {
  it("blocks when no h2 exists", () => {
    const result = validateArticleDraft({
      title: "Test",
      type: "article",
      lexical: { root: { children: [{ type: "paragraph" }] } },
    });
    expect(result.blocking.some((x) => x.code === "missing_h2")).toBe(true);
  });

  it("warns tutorial without code", () => {
    const result = validateArticleDraft({
      title: "Tutorial",
      type: "tutorial",
      lexical: { root: { children: [{ type: "heading", tag: "h2" }] } },
    });
    expect(result.warnings.some((x) => x.code === "tutorial_no_code")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/article-editor/__tests__/validation.test.ts`  
Expected: FAIL (`Cannot find module ../lib/validation`)

**Step 3: Write minimal implementation**

Implement `validateArticleDraft` in `validation.ts` for:
- Blocking: missing title, empty content, missing H2, missing intro before first heading
- Warnings: tutorial without code, empty/invalid mermaid block heuristic

Wire validation into submit path in `article-editor.tsx`.

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/validation.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/article-editor/lib/validation.ts src/components/article-editor/__tests__/validation.test.ts src/components/article-editor.tsx
git commit -m "feat(editor): add pre-submit validation and warning rules"
```

### Task 5: Implement Autosave State Machine

**Files:**
- Create: `src/components/article-editor/lib/autosave.ts`
- Create: `src/components/article-editor/__tests__/autosave.test.ts`
- Modify: `src/components/article-editor.tsx`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { nextSaveStatus } from "../lib/autosave";

describe("autosave state machine", () => {
  it("transitions dirty -> saving -> saved", () => {
    expect(nextSaveStatus("idle", "change")).toBe("dirty");
    expect(nextSaveStatus("dirty", "save_start")).toBe("saving");
    expect(nextSaveStatus("saving", "save_success")).toBe("saved");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/article-editor/__tests__/autosave.test.ts`  
Expected: FAIL (`Cannot find module ../lib/autosave`)

**Step 3: Write minimal implementation**

Create `autosave.ts` with:
- Save statuses: `idle | dirty | saving | saved | error`
- `nextSaveStatus` reducer
- debounce helper for save trigger (~1200ms)

Integrate into `article-editor.tsx`:
- set dirty on metadata/content changes
- autosave via existing `create/update` mutations
- maintain `lastSavedAt` timestamp

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/autosave.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/article-editor/lib/autosave.ts src/components/article-editor/__tests__/autosave.test.ts src/components/article-editor.tsx
git commit -m "feat(editor): add debounced autosave and save status states"
```

### Task 6: Add Slash Menu UI Plugin + Keyboard Navigation

**Files:**
- Create: `src/components/article-editor/components/slash-menu.tsx`
- Modify: `src/components/article-editor.tsx`
- Modify: `src/components/article-editor/lib/slash-commands.ts`

**Step 1: Write the failing component test**

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlashMenu } from "../components/slash-menu";

describe("SlashMenu", () => {
  it("renders matching command labels", () => {
    render(<SlashMenu query="warn" commands={[{ id: "admonition-warning", label: "Warning", group: "Technical", keywords: ["warn"] }]} activeIndex={0} onPick={() => {}} />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/article-editor/__tests__/slash-menu.test.tsx`  
Expected: FAIL (component missing)

**Step 3: Write minimal implementation**

- Add `SlashMenu` presentational component
- Add keyboard handler for arrows/enter/escape
- Hook into Lexical editor via plugin in `article-editor.tsx`
- Keep top toolbar as fallback

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/slash-menu.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/article-editor/components/slash-menu.tsx src/components/article-editor.tsx src/components/article-editor/lib/slash-commands.ts src/components/article-editor/__tests__/slash-menu.test.tsx
git commit -m "feat(editor): add Notion-style slash command menu"
```

### Task 7: Add Technical Blocks (Balanced)

**Files:**
- Modify: `src/components/article-editor.tsx`
- Modify: `src/lib/lexical.tsx`
- Create: `src/components/article-editor/lib/block-templates.ts`
- Create: `src/components/article-editor/__tests__/block-templates.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { makeAdmonitionBlock, makeMermaidBlock } from "../lib/block-templates";

describe("block templates", () => {
  it("creates admonition with type and title", () => {
    const node = makeAdmonitionBlock("warning");
    expect(node.type).toBe("admonition");
    expect(node.variant).toBe("warning");
  });

  it("creates mermaid source container", () => {
    const node = makeMermaidBlock("graph TD; A-->B");
    expect(node.type).toBe("mermaid");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/article-editor/__tests__/block-templates.test.ts`  
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

- Add JSON template builders for:
  - admonition (`info|warning|success|note`)
  - mermaid source block
  - tabs/snippets schema
- Insert these via slash command actions in `article-editor.tsx`
- Extend `src/lib/lexical.tsx` renderer to render admonition and mermaid placeholder safely for article page output

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/block-templates.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/article-editor/lib/block-templates.ts src/components/article-editor/__tests__/block-templates.test.ts src/components/article-editor.tsx src/lib/lexical.tsx
git commit -m "feat(editor): add technical block templates and renderer support"
```

### Task 8: Add Sticky Status Strip + Right Utility Panel

**Files:**
- Create: `src/components/article-editor/components/status-strip.tsx`
- Create: `src/components/article-editor/components/quality-panel.tsx`
- Modify: `src/components/article-editor.tsx`

**Step 1: Write the failing component test**

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusStrip } from "../components/status-strip";

describe("StatusStrip", () => {
  it("shows save state and metrics", () => {
    render(<StatusStrip status="saved" wordCount={420} readingMinutes={2} lastSavedLabel="Saved at 14:32" />);
    expect(screen.getByText("420 words")).toBeInTheDocument();
    expect(screen.getByText("2 min read")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/article-editor/__tests__/status-strip.test.tsx`  
Expected: FAIL (component missing)

**Step 3: Write minimal implementation**

- Add sticky status strip component
- Add right panel component with:
  - H2/H3 outline
  - blocking/warning lists
  - checklist summary
- Wire both in `article-editor.tsx`

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/status-strip.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/article-editor/components/status-strip.tsx src/components/article-editor/components/quality-panel.tsx src/components/article-editor.tsx src/components/article-editor/__tests__/status-strip.test.tsx
git commit -m "feat(editor): add sticky status strip and quality utility panel"
```

### Task 9: Local Draft Recovery

**Files:**
- Create: `src/components/article-editor/lib/recovery.ts`
- Create: `src/components/article-editor/__tests__/recovery.test.ts`
- Modify: `src/components/article-editor.tsx`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { makeRecoveryKey } from "../lib/recovery";

describe("recovery key", () => {
  it("creates stable key per article and user", () => {
    expect(makeRecoveryKey("u1", 42)).toBe("article-editor:u1:42");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/article-editor/__tests__/recovery.test.ts`  
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

- Add helpers to persist/load/clear local unsaved snapshots
- Integrate restore prompt when local snapshot is newer than server state
- Clear snapshot on successful submit/publish

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/article-editor/__tests__/recovery.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/article-editor/lib/recovery.ts src/components/article-editor/__tests__/recovery.test.ts src/components/article-editor.tsx
git commit -m "feat(editor): add local draft recovery support"
```

### Task 10: Internationalization For New UX Copy

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`
- Modify: `src/components/article-editor.tsx`

**Step 1: Write the failing check**

- Add temporary references in `article-editor.tsx` for new keys (`autosave.*`, `validation.*`, `slash.*`, `qualityPanel.*`)

Run: `pnpm typecheck`  
Expected: FAIL or runtime fallback risk due missing keys

**Step 2: Implement translations**

Add missing keys for:
- save states (`unsaved`, `saving`, `savedAt`)
- quality checks (`blocking`, `warnings`, each rule label)
- slash menu labels/help text
- recovery prompt copy

**Step 3: Run checks**

Run: `pnpm check`  
Expected: PASS

**Step 4: Commit**

```bash
git add messages/en.json messages/nl.json src/components/article-editor.tsx
git commit -m "feat(i18n): add editor UX copy for slash menu and quality states"
```

### Task 11: End-to-End Verification + Regression Pass

**Files:**
- Modify: `src/components/article-editor.tsx` (final polish only)
- Modify: `src/lib/lexical.tsx` (final polish only)
- Create: `docs/plans/archive/2026-02-25-lexical-editor-notion-ux-qa.md`

**Step 1: Run targeted tests**

Run:

```bash
pnpm test:run src/components/article-editor/__tests__
```

Expected: PASS

**Step 2: Run project checks**

Run:

```bash
pnpm check
pnpm build
```

Expected: PASS

**Step 3: Manual QA script**

Validate flows:
- write article with slash commands
- autosave state transitions
- draft recovery after refresh
- non-trusted submit path
- trusted publish path
- article page rendering for admonition/mermaid placeholders

Capture outcomes in `docs/plans/archive/2026-02-25-lexical-editor-notion-ux-qa.md`.

**Step 4: Commit**

```bash
git add src/components/article-editor.tsx src/lib/lexical.tsx docs/plans/archive/2026-02-25-lexical-editor-notion-ux-qa.md
git commit -m "test(editor): verify notion-style editor flows and regressions"
```

## Notes For Execution

- Keep PR scope focused on article editor path; do not refactor unrelated blog pages.
- Preserve existing trusted-author and review workflow behavior.
- Prefer additive schema for custom blocks; keep renderer backward compatible for existing content.
- If any custom node approach in Lexical is high-risk, store custom blocks as structured paragraph/code nodes in v1 and keep full custom-node implementation for a follow-up task.
