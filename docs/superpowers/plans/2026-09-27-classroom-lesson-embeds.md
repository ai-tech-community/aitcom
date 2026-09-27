# Classroom lesson embeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A trainer pastes a YouTube, Vimeo, Loom, Google Slides/Docs/Sheets/Drive or Figma link anywhere in a lesson's text, and learners see that material in place. The single "YouTube URL" slot on a lesson is gone: existing lessons are migrated into the new block.

**Architecture:**
- **Provider registry.** A pure registry of embed providers (strategy per provider) parses a pasted link and builds a safe embed address on a fixed host. The author's raw link never reaches an iframe `src`.
- **Lesson body.** The body gains a Payload `Embed` block that stores only the link. The server re-checks every Embed block on save.
- **Renderer seam.** The shared Lexical renderer gains a `blockRenderers` seam, so only the classroom renders Embed blocks.
- **Editor seam.** The shared lesson rich-text editor gains an `extensions` seam, so the Embed node lives in classroom code.
- **Migration.** A data migration turns each lesson's `youtubeUrl` into a leading Embed block. A link that can't be embedded becomes a resource link. The column itself is dropped in a later deploy (expand/contract).

**Tech Stack:** Next.js App Router, tRPC, Payload 3 (Lexical rich text, local API), Drizzle/`@payloadcms/db-postgres` migrations, next-intl (en, nl), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-27-classroom-lesson-materials-design.md` §3 (slice 1). ADR-0037.

## Global Constraints

- Branch `feat/classroom-lesson-embeds`, worktree `.claude/worktrees/classroom-lesson-embeds`. Run `git branch --show-current` before every commit. Never `git checkout`/`switch`/`stash`, never `git add -A`/`.`; stage files by name.
- No `Co-Authored-By` or AI-credit lines in commits or the PR.
- Provider ids are exactly: `youtube`, `vimeo`, `loom`, `google-slides`, `google-docs`, `google-sheets`, `google-drive`, `figma`.
- `embedSrc` is always built by our code from parsed ids onto these fixed hosts:
  - `https://www.youtube-nocookie.com/embed/<id>`
  - `https://player.vimeo.com/video/<id>`
  - `https://www.loom.com/embed/<id>`
  - `https://docs.google.com/presentation/d/<id>/embed…`
  - `https://docs.google.com/document/d/<id>/preview`
  - `https://docs.google.com/spreadsheets/d/<id>/preview`
  - `https://drive.google.com/file/d/<id>/preview`
  - `https://www.figma.com/embed?…`
- Stored Embed block JSON, exactly: `{ "type": "block", "version": 2, "format": "", "fields": { "id": "<12 hex>", "blockName": "", "blockType": "Embed", "url": "<author's link>" } }`.
- Iframe attributes, exactly:
  - `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"`
  - `referrerPolicy="strict-origin-when-cross-origin"`
  - `loading="lazy"`
  - `allow="fullscreen; picture-in-picture; encrypted-media; clipboard-write"`
  - `allowFullScreen`
  - a `title`
- A body with an Embed block whose link does not resolve is refused with `TRPCError` `BAD_REQUEST`, message `INVALID_EMBED`.
- Migrations are hand-written in `src/migrations/` and registered in `src/migrations/index.ts`. Never run `db:push` or `db:apply`. Production applies migrations automatically in the Vercel build, before the new code goes live.
- **DB tests.** Run them only against the isolated local test database, never host port 5432. On dev machines that port can be an SSH tunnel to a remote database. Command prefix for every DB run in this plan:
  `set +eu; set -a; . /Users/greg/coding-projects/aitcom/.env.docker >/dev/null 2>&1; set +a; unset PAYLOAD_PUSH; RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run <file>`
  A run that reports tests *skipped* is a setup failure.
- Customer-facing copy uses everyday words and exists in both `messages/en.json` and `messages/nl.json` under `classroom`.
- Design rules (DESIGN.md):
  - Embeds are border-defined and flat: `border-border rounded-lg border`, no shadow.
  - No Signal Orange on embeds.
  - Mono only for machine text (URLs).

## Review Focus

1. **A lookalike host is pasted** (`https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ`, `https://evil.test/?u=docs.google.com/presentation/d/…`). It must not resolve. Owned by Task 1.
2. **A `javascript:`, `data:` or protocol-less link is pasted.** It must not resolve, and no exception is thrown. Owned by Task 1.
3. **A lesson's old `youtubeUrl` is not embeddable** (a Zoom or Teams recording link). After migration it must still be reachable, as a resource link, not silently dropped. Owned by Task 3.
4. **The migration runs twice** (a deploy retry). There must be no duplicate Embed block and no duplicate resource. Owned by Task 3.
5. **A forum post or launchpad body contains an Embed block** (crafted through the API). It renders nothing there; only the classroom renders Embed blocks. Owned by Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/classroom/embed-providers.ts` (create) | Pure provider registry: `resolveEmbed(raw)` → safe embed descriptor or null. |
| `src/lib/classroom/embed-providers.test.ts` (create) | Provider parsing tests, including hostile input. |
| `src/lib/classroom/lesson-body.ts` (create) | Pure helpers over stored lesson Lexical JSON: find Embed links, build an Embed block, plan the youtubeUrl migration. |
| `src/lib/classroom/lesson-body.test.ts` (create) | Tests for the above. |
| `src/collections/Lessons.ts` (modify) | Add the `Embed` block; remove `youtubeUrl` (Task 5). |
| `src/server/api/routers/classrooms.ts` (modify) | Refuse invalid Embed blocks on add/update; stop accepting `youtubeUrl` (Task 5). |
| `src/server/api/routers/classroom-lessons.integration.test.ts` (create) | Router tests for Embed validation. |
| `src/migrations/20260928b_lesson_youtube_to_embed.ts` (create) + `index.ts` (modify) | The data migration. |
| `src/migrations/lesson-youtube-to-embed.integration.test.ts` (create) | Runs the migration against the test DB. |
| `src/lib/lexical.tsx` (modify) | `blockRenderers` seam on `LexicalRenderer`. |
| `src/lib/lexical-renderers.test.tsx` (create) | Seam tests. |
| `src/components/classroom/materials/embed-frame.tsx` (create) | The iframe for one resolved embed. |
| `src/components/classroom/materials/embed-frame.test.tsx` (create) | Iframe tests. |
| `src/components/classroom/materials/block-renderers.tsx` (create) | `classroomBlockRenderers` map. |
| `src/components/classroom/course-view.tsx` (modify) | Render lesson bodies with classroom renderers; drop the YouTube slot. |
| `src/components/article-editor/utils.ts` (modify) | Extra block↔node remaps and extra slash commands. |
| `src/components/article-editor/utils.test.ts` (create) | Tests for the generalised helpers. |
| `src/components/article-editor/rich-text-editor.tsx` (modify) | `extensions` seam. |
| `src/components/classroom/materials/embed-node.tsx` (create) | Lexical `EmbedNode` + its editing UI + `classroomEditorExtensions`. |
| `src/components/classroom/lesson-editor.tsx` (modify) | Use the extension; remove the YouTube input. |
| `src/lib/classroom.ts` + `src/lib/classroom.test.ts` (modify) | Remove `youtubeEmbedUrl` (replaced by the registry). |
| `messages/en.json`, `messages/nl.json` (modify) | New embed strings; remove `youtubeUrl`, `watchVideo`. |
| `src/payload-types.ts`, `src/payload-generated-schema.ts` (regenerate) | Generated from the Payload config. |

---

### Task 1: Embed provider registry

**Files:**
- Create: `src/lib/classroom/embed-providers.ts`
- Test: `src/lib/classroom/embed-providers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type EmbedProviderId =
    | "youtube" | "vimeo" | "loom" | "google-slides" | "google-docs"
    | "google-sheets" | "google-drive" | "figma";
  export type EmbedAspect = "16:9" | "page";
  export type ResolvedEmbed = {
    provider: EmbedProviderId;
    label: string;               // brand name, e.g. "Google Slides"
    embedSrc: string;            // always built by us
    aspect: EmbedAspect;
    needsPublicSharing: boolean; // true for Google providers
  };
  export const EMBED_PROVIDER_LABELS: readonly string[]; // labels in registry order, for help text
  export function resolveEmbed(raw: string): ResolvedEmbed | null;
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/classroom/embed-providers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMBED_PROVIDER_LABELS, resolveEmbed } from "./embed-providers";

const YT = "dQw4w9WgXcQ";
const GID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-x";

describe("resolveEmbed", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://youtube.com/watch?v=${YT}&t=90`, `https://www.youtube-nocookie.com/embed/${YT}?start=90`],
    [`https://m.youtube.com/watch?v=${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://youtu.be/${YT}?t=42`, `https://www.youtube-nocookie.com/embed/${YT}?start=42`],
    [`https://www.youtube.com/embed/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://www.youtube.com/shorts/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://www.youtube.com/live/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://www.youtube-nocookie.com/embed/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
  ])("youtube: %s", (raw, src) => {
    expect(resolveEmbed(raw)).toEqual({
      provider: "youtube",
      label: "YouTube",
      embedSrc: src,
      aspect: "16:9",
      needsPublicSharing: false,
    });
  });

  it.each([
    ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"],
    ["https://vimeo.com/123456789/abcdef1234", "https://player.vimeo.com/video/123456789?h=abcdef1234"],
    ["https://player.vimeo.com/video/123456789", "https://player.vimeo.com/video/123456789"],
  ])("vimeo: %s", (raw, src) => {
    expect(resolveEmbed(raw)?.embedSrc).toBe(src);
    expect(resolveEmbed(raw)?.provider).toBe("vimeo");
  });

  it("loom share and embed links", () => {
    const id = "0123456789abcdef0123456789abcdef";
    for (const raw of [
      `https://www.loom.com/share/${id}`,
      `https://loom.com/share/${id}?sid=x`,
      `https://www.loom.com/embed/${id}`,
    ]) {
      expect(resolveEmbed(raw)).toMatchObject({
        provider: "loom",
        embedSrc: `https://www.loom.com/embed/${id}`,
      });
    }
  });

  it("google slides edit and published links", () => {
    expect(
      resolveEmbed(`https://docs.google.com/presentation/d/${GID}/edit#slide=id.p`),
    ).toEqual({
      provider: "google-slides",
      label: "Google Slides",
      embedSrc: `https://docs.google.com/presentation/d/${GID}/embed?start=false&loop=false`,
      aspect: "16:9",
      needsPublicSharing: true,
    });
    expect(
      resolveEmbed(`https://docs.google.com/presentation/d/e/2PACX-${GID}/pub?start=false`),
    ).toMatchObject({
      provider: "google-slides",
      embedSrc: `https://docs.google.com/presentation/d/e/2PACX-${GID}/embed?start=false&loop=false`,
    });
  });

  it("google docs, sheets and drive files", () => {
    expect(resolveEmbed(`https://docs.google.com/document/d/${GID}/edit`)).toEqual({
      provider: "google-docs",
      label: "Google Docs",
      embedSrc: `https://docs.google.com/document/d/${GID}/preview`,
      aspect: "page",
      needsPublicSharing: true,
    });
    expect(resolveEmbed(`https://docs.google.com/spreadsheets/d/${GID}/edit#gid=0`)).toMatchObject({
      provider: "google-sheets",
      embedSrc: `https://docs.google.com/spreadsheets/d/${GID}/preview`,
      aspect: "page",
    });
    for (const raw of [
      `https://drive.google.com/file/d/${GID}/view?usp=sharing`,
      `https://drive.google.com/open?id=${GID}`,
    ]) {
      expect(resolveEmbed(raw)).toMatchObject({
        provider: "google-drive",
        embedSrc: `https://drive.google.com/file/d/${GID}/preview`,
        aspect: "16:9",
        needsPublicSharing: true,
      });
    }
  });

  it("figma files, designs, prototypes and boards", () => {
    for (const kind of ["file", "design", "proto", "board"]) {
      const raw = `https://www.figma.com/${kind}/AbCdEf123456/Some-Name?node-id=1-2`;
      const canonical = `https://www.figma.com/${kind}/AbCdEf123456`;
      expect(resolveEmbed(raw)).toMatchObject({
        provider: "figma",
        embedSrc: `https://www.figma.com/embed?embed_host=aitcommunity&url=${encodeURIComponent(canonical)}`,
      });
    }
  });

  it("trims whitespace and accepts http as well as https", () => {
    expect(resolveEmbed(`  http://youtu.be/${YT}  `)?.embedSrc).toBe(
      `https://www.youtube-nocookie.com/embed/${YT}`,
    );
  });

  describe("refuses anything it cannot build safely", () => {
    it.each([
      "",
      "   ",
      "not a url",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      `ftp://youtube.com/watch?v=${YT}`,
      `https://youtube.com.evil.test/watch?v=${YT}`,
      `https://evil.test/watch?v=${YT}`,
      `https://evil.test/?u=https://docs.google.com/presentation/d/${GID}`,
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch",
      "https://vimeo.com/channels/staffpicks",
      "https://www.loom.com/share/not-hex",
      "https://docs.google.com/forms/d/abc/viewform",
      "https://docs.google.com/presentation/d/short/edit",
      "https://www.figma.com/community/file/123",
      `https://www.youtube.com/watch?v=${YT}`.padEnd(2100, "x"),
    ])("%s", (raw) => {
      expect(resolveEmbed(raw)).toBeNull();
    });
  });

  it("lists every provider label for help text", () => {
    expect(EMBED_PROVIDER_LABELS).toEqual([
      "YouTube",
      "Vimeo",
      "Loom",
      "Google Slides",
      "Google Docs",
      "Google Sheets",
      "Google Drive",
      "Figma",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/classroom/embed-providers.test.ts`
Expected: FAIL. `./embed-providers` cannot be resolved.

- [ ] **Step 3: Implement**

`src/lib/classroom/embed-providers.ts`:

```ts
/**
 * Embed providers for classroom lessons (spec 2026-09-27 §3.1, ADR-0037).
 *
 * A registry of strategies: each provider recognises its own links and
 * builds the embed address itself, on a fixed host, from ids it parsed. The
 * author's raw link never reaches an iframe `src`. Adding a provider is one
 * entry here. Pure — shared by the editor, the renderer and the server.
 */
export type EmbedProviderId =
  | "youtube"
  | "vimeo"
  | "loom"
  | "google-slides"
  | "google-docs"
  | "google-sheets"
  | "google-drive"
  | "figma";

export type EmbedAspect = "16:9" | "page";

export type ResolvedEmbed = {
  provider: EmbedProviderId;
  label: string;
  embedSrc: string;
  aspect: EmbedAspect;
  needsPublicSharing: boolean;
};

type EmbedProvider = {
  id: EmbedProviderId;
  label: string;
  aspect: EmbedAspect;
  needsPublicSharing: boolean;
  hosts: readonly string[];
  /** Build the embed address from a parsed URL, or null if it isn't ours. */
  build(url: URL): string | null;
};

const MAX_LINK_LENGTH = 2000;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DIGITS = /^\d+$/;
const VIMEO_HASH = /^[A-Za-z0-9]+$/;
const LOOM_ID = /^[a-f0-9]{32}$/;
const GOOGLE_ID = /^[A-Za-z0-9_-]{20,}$/;
const FIGMA_KEY = /^[A-Za-z0-9]{10,}$/;

function segments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function youtubeStart(url: URL): string {
  const raw = url.searchParams.get("t") ?? url.searchParams.get("start");
  return raw && DIGITS.test(raw) ? `?start=${raw}` : "";
}

const PROVIDERS: readonly EmbedProvider[] = [
  {
    id: "youtube",
    label: "YouTube",
    aspect: "16:9",
    needsPublicSharing: false,
    hosts: [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
      "youtube-nocookie.com",
    ],
    build(url) {
      const parts = segments(url);
      let id: string | null = null;
      if (url.hostname === "youtu.be") id = parts[0] ?? null;
      else if (parts[0] === "watch") id = url.searchParams.get("v");
      else if (["embed", "shorts", "live"].includes(parts[0] ?? ""))
        id = parts[1] ?? null;
      if (!id || !YOUTUBE_ID.test(id)) return null;
      return `https://www.youtube-nocookie.com/embed/${id}${youtubeStart(url)}`;
    },
  },
  {
    id: "vimeo",
    label: "Vimeo",
    aspect: "16:9",
    needsPublicSharing: false,
    hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
    build(url) {
      const parts = segments(url);
      const [id, hash] =
        url.hostname === "player.vimeo.com" && parts[0] === "video"
          ? [parts[1], undefined]
          : [parts[0], parts[1]];
      if (!id || !DIGITS.test(id)) return null;
      const h = hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : "";
      return `https://player.vimeo.com/video/${id}${h}`;
    },
  },
  {
    id: "loom",
    label: "Loom",
    aspect: "16:9",
    needsPublicSharing: false,
    hosts: ["loom.com", "www.loom.com"],
    build(url) {
      const [kind, id] = segments(url);
      if ((kind !== "share" && kind !== "embed") || !id || !LOOM_ID.test(id))
        return null;
      return `https://www.loom.com/embed/${id}`;
    },
  },
  {
    id: "google-slides",
    label: "Google Slides",
    aspect: "16:9",
    needsPublicSharing: true,
    hosts: ["docs.google.com"],
    build(url) {
      const parts = segments(url);
      if (parts[0] !== "presentation" || parts[1] !== "d") return null;
      const published = parts[2] === "e";
      const id = published ? parts[3] : parts[2];
      if (!id || !GOOGLE_ID.test(id)) return null;
      const base = published
        ? `https://docs.google.com/presentation/d/e/${id}`
        : `https://docs.google.com/presentation/d/${id}`;
      return `${base}/embed?start=false&loop=false`;
    },
  },
  {
    id: "google-docs",
    label: "Google Docs",
    aspect: "page",
    needsPublicSharing: true,
    hosts: ["docs.google.com"],
    build(url) {
      const [kind, d, id] = segments(url);
      if (kind !== "document" || d !== "d" || !id || !GOOGLE_ID.test(id))
        return null;
      return `https://docs.google.com/document/d/${id}/preview`;
    },
  },
  {
    id: "google-sheets",
    label: "Google Sheets",
    aspect: "page",
    needsPublicSharing: true,
    hosts: ["docs.google.com"],
    build(url) {
      const [kind, d, id] = segments(url);
      if (kind !== "spreadsheets" || d !== "d" || !id || !GOOGLE_ID.test(id))
        return null;
      return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    },
  },
  {
    id: "google-drive",
    label: "Google Drive",
    aspect: "16:9",
    needsPublicSharing: true,
    hosts: ["drive.google.com"],
    build(url) {
      const parts = segments(url);
      const id =
        parts[0] === "file" && parts[1] === "d"
          ? parts[2]
          : parts[0] === "open"
            ? url.searchParams.get("id")
            : null;
      if (!id || !GOOGLE_ID.test(id)) return null;
      return `https://drive.google.com/file/d/${id}/preview`;
    },
  },
  {
    id: "figma",
    label: "Figma",
    aspect: "16:9",
    needsPublicSharing: false,
    hosts: ["figma.com", "www.figma.com"],
    build(url) {
      const [kind, key] = segments(url);
      if (!["file", "design", "proto", "board"].includes(kind ?? ""))
        return null;
      if (!key || !FIGMA_KEY.test(key)) return null;
      const canonical = `https://www.figma.com/${kind}/${key}`;
      return `https://www.figma.com/embed?embed_host=aitcommunity&url=${encodeURIComponent(canonical)}`;
    },
  },
];

export const EMBED_PROVIDER_LABELS: readonly string[] = PROVIDERS.map(
  (p) => p.label,
);

export function resolveEmbed(raw: string): ResolvedEmbed | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  for (const provider of PROVIDERS) {
    if (!provider.hosts.includes(host)) continue;
    const embedSrc = provider.build(url);
    if (embedSrc) {
      return {
        provider: provider.id,
        label: provider.label,
        embedSrc,
        aspect: provider.aspect,
        needsPublicSharing: provider.needsPublicSharing,
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/classroom/embed-providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # feat/classroom-lesson-embeds
git add src/lib/classroom/embed-providers.ts src/lib/classroom/embed-providers.test.ts
git commit -m "Classroom: embed provider registry for lesson materials"
```

---

### Task 2: Lesson body helpers, the Embed block, and server-side validation

**Files:**
- Create: `src/lib/classroom/lesson-body.ts`, `src/lib/classroom/lesson-body.test.ts`
- Modify: `src/collections/Lessons.ts` (add `EmbedBlock` to `BlocksFeature`)
- Modify: `src/server/api/routers/classrooms.ts` (`addLesson`, `updateLesson`)
- Create: `src/server/api/routers/classroom-lessons.integration.test.ts`
- Regenerate: `src/payload-types.ts`, `src/payload-generated-schema.ts`

**Interfaces:**
- Consumes: `resolveEmbed` (Task 1).
- Produces:
  ```ts
  export type EmbedBlockNode = {
    type: "block"; version: 2; format: "";
    fields: { id: string; blockName: ""; blockType: "Embed"; url: string };
  };
  export function embedBlockNode(url: string, id: string): EmbedBlockNode;
  export function collectEmbedUrls(body: unknown): string[];
  export function invalidEmbedUrls(body: unknown): string[];
  export function prependEmbedBlock(body: unknown, url: string, id: string): { root: Record<string, unknown> };
  export type YoutubeMigrationStep =
    | { kind: "skip" }
    | { kind: "embed"; body: { root: Record<string, unknown> } }
    | { kind: "resource"; label: string; url: string };
  export function planYoutubeMigration(input: {
    body: unknown; youtubeUrl: string | null; resourceUrls: string[]; blockId: string;
  }): YoutubeMigrationStep;
  ```
  Task 3 uses `planYoutubeMigration`. Tasks 4–5 use the stored block shape.

- [ ] **Step 1: Write the failing unit test**

`src/lib/classroom/lesson-body.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  collectEmbedUrls,
  embedBlockNode,
  invalidEmbedUrls,
  planYoutubeMigration,
  prependEmbedBlock,
} from "./lesson-body";

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const para = (text: string) => ({
  type: "paragraph",
  version: 1,
  children: [{ type: "text", version: 1, text }],
});
const root = (children: unknown[]) => ({
  root: { type: "root", format: "", indent: 0, version: 1, direction: null, children },
});

describe("embedBlockNode", () => {
  it("builds the stored Payload block shape", () => {
    expect(embedBlockNode(YT, "abc123abc123")).toEqual({
      type: "block",
      version: 2,
      format: "",
      fields: { id: "abc123abc123", blockName: "", blockType: "Embed", url: YT },
    });
  });
});

describe("collectEmbedUrls / invalidEmbedUrls", () => {
  const body = root([
    para("intro"),
    embedBlockNode(YT, "a"),
    { type: "list", children: [{ type: "listitem", children: [embedBlockNode("https://evil.test/x", "b")] }] },
    { type: "block", fields: { blockType: "Image", src: "https://x.test/i.png" } },
  ]);

  it("finds Embed links at any depth and ignores other blocks", () => {
    expect(collectEmbedUrls(body)).toEqual([YT, "https://evil.test/x"]);
  });

  it("reports only links the registry can't embed", () => {
    expect(invalidEmbedUrls(body)).toEqual(["https://evil.test/x"]);
  });

  it("accepts a JSON string body", () => {
    expect(collectEmbedUrls(JSON.stringify(body))).toHaveLength(2);
  });

  it.each([null, undefined, "", "not json", 42, {}, { root: {} }])(
    "tolerates %p",
    (b) => {
      expect(collectEmbedUrls(b)).toEqual([]);
    },
  );

  it("treats an Embed block without a string url as invalid", () => {
    const bad = root([{ type: "block", fields: { blockType: "Embed", url: 5 } }]);
    expect(invalidEmbedUrls(bad)).toEqual([""]);
  });
});

describe("prependEmbedBlock", () => {
  it("puts the block first and keeps existing children", () => {
    const out = prependEmbedBlock(root([para("notes")]), YT, "id1");
    expect(out.root.children).toEqual([embedBlockNode(YT, "id1"), para("notes")]);
  });

  it("creates a root for an empty body", () => {
    const out = prependEmbedBlock(null, YT, "id1");
    expect(out).toEqual(root([embedBlockNode(YT, "id1")]));
  });

  it("does not mutate its input", () => {
    const input = root([para("notes")]);
    const copy = JSON.parse(JSON.stringify(input));
    prependEmbedBlock(input, YT, "id1");
    expect(input).toEqual(copy);
  });
});

describe("planYoutubeMigration", () => {
  const base = { body: root([para("notes")]), resourceUrls: [], blockId: "id1" };

  it("embeds a link the registry understands", () => {
    expect(planYoutubeMigration({ ...base, youtubeUrl: ` ${YT} ` })).toEqual({
      kind: "embed",
      body: prependEmbedBlock(base.body, YT, "id1"),
    });
  });

  it("keeps a non-embeddable link as a resource", () => {
    expect(
      planYoutubeMigration({ ...base, youtubeUrl: "https://zoom.us/rec/share/abc" }),
    ).toEqual({ kind: "resource", label: "Video", url: "https://zoom.us/rec/share/abc" });
  });

  it("is idempotent", () => {
    const migrated = prependEmbedBlock(base.body, YT, "id1");
    expect(planYoutubeMigration({ ...base, body: migrated, youtubeUrl: YT })).toEqual({ kind: "skip" });
    expect(
      planYoutubeMigration({ ...base, youtubeUrl: "https://zoom.us/rec/share/abc", resourceUrls: ["https://zoom.us/rec/share/abc"] }),
    ).toEqual({ kind: "skip" });
  });

  it.each([null, "", "   "])("skips an empty youtubeUrl %p", (youtubeUrl) => {
    expect(planYoutubeMigration({ ...base, youtubeUrl })).toEqual({ kind: "skip" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/classroom/lesson-body.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement `lesson-body.ts`**

```ts
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

export function prependEmbedBlock(
  body: unknown,
  url: string,
  id: string,
): { root: Record<string, unknown> } {
  const parsed = parseBody(body);
  const copy = parsed
    ? (JSON.parse(JSON.stringify(parsed)) as { root?: Record<string, unknown> })
    : {};
  const rootNode: Record<string, unknown> = copy.root ?? {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
  };
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
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `pnpm vitest run src/lib/classroom/lesson-body.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the Embed block to the Lessons collection**

In `src/collections/Lessons.ts`, below `ImageBlock`, add:

```ts
const EmbedBlock: Block = {
  slug: "Embed",
  fields: [{ name: "url", type: "text", required: true, maxLength: 2000 }],
};
```

and change the `BlocksFeature` line to:

```ts
            blocks: [CodeBlock({ languages: codeLanguages }), ImageBlock, EmbedBlock],
```

Regenerate the generated files against the isolated test DB env (see Global Constraints for the env prefix; replace `pnpm vitest run <file>` with the command):
`npx payload generate:types` then `npx payload generate:db-schema`.
Expected: `src/payload-types.ts` gains the `Embed` block type. `git diff --stat` shows only the two generated files plus `Lessons.ts`. If `generate:db-schema` changes nothing, that is fine.

- [ ] **Step 6: Write the failing router integration test**

`src/server/api/routers/classroom-lessons.integration.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("classroom lesson bodies [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<ReturnType<typeof import("@/server/payload").getPayloadClient>>;
    embedBlockNode: typeof import("@/lib/classroom/lesson-body").embedBlockNode;
  };
  let m: Mods;
  let sfx: string;
  let authorId: string;
  let communityId: string;
  let courseId: number;

  const body = (url: string) => ({
    root: {
      type: "root", format: "", indent: 0, version: 1, direction: null,
      children: [m.embedBlockNode(url, "abcdefabcdef")],
    },
  });

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, { getPayloadClient }, lessonBody] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("@/lib/classroom/lesson-body"),
      ]);
    m = {
      db, schema, createCaller,
      payload: await getPayloadClient(),
      embedBlockNode: lessonBody.embedBlockNode,
    };
  }, 120_000);

  beforeEach(async () => {
    sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    authorId = `lb-author-${sfx}`;
    await m.db.insert(m.schema.user).values({ id: authorId, email: `${authorId}@example.test`, name: "Author" });
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Lessons ${sfx}`, slug: `lessons-${sfx}`, createdBy: authorId })
      .returning();
    communityId = community!.id;
    await m.db.insert(m.schema.communityMemberships).values({ communityId, userId: authorId, role: "member" });
    const course = await m.payload.create({
      collection: "courses",
      data: {
        title: `Course ${sfx}`, slug: `course-${sfx}`, authorId, authorName: "Author",
        status: "published", communityId, isPublic: false, enrollmentCount: 0,
      },
    });
    courseId = course.id;
  });

  afterEach(async () => {
    const { eq } = await import("drizzle-orm");
    await m.payload.delete({ collection: "lessons", where: { course: { equals: courseId } } });
    await m.payload.delete({ collection: "courses", id: courseId });
    await m.db.delete(m.schema.communityMemberships).where(eq(m.schema.communityMemberships.communityId, communityId));
    await m.db.delete(m.schema.communities).where(eq(m.schema.communities.id, communityId));
    await m.db.delete(m.schema.user).where(eq(m.schema.user.id, authorId));
  });

  const caller = () =>
    m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: { user: { id: authorId }, session: {} } as never,
    });

  it("stores a lesson whose Embed blocks resolve", async () => {
    const { id } = await caller().classrooms.addLesson({
      courseId, title: "Slides", body: body("https://youtu.be/dQw4w9WgXcQ"),
    });
    const saved = await m.payload.findByID({ collection: "lessons", id, depth: 0 });
    expect(JSON.stringify(saved.body)).toContain('"blockType":"Embed"');
  });

  it("refuses an Embed block the registry cannot embed, on add and on update", async () => {
    await expect(
      caller().classrooms.addLesson({ courseId, title: "Bad", body: body("https://evil.test/x") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_EMBED" });

    const { id } = await caller().classrooms.addLesson({ courseId, title: "Ok" });
    await expect(
      caller().classrooms.updateLesson({ lessonId: id, body: body("javascript:alert(1)") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_EMBED" });
  });
});
```

Run it with the DB prefix from Global Constraints on `src/server/api/routers/classroom-lessons.integration.test.ts`.
Expected: FAIL. The "refuses" test resolves instead of rejecting. The "stores" test passes.

- [ ] **Step 7: Validate bodies in the router**

In `src/server/api/routers/classrooms.ts`, add an import:

```ts
import { invalidEmbedUrls } from "@/lib/classroom/lesson-body";
```

and, below `issueCertificateIfComplete`, add:

```ts
/** Every Embed block in a lesson body must resolve to a known provider. */
function assertLessonBodyEmbeds(body: unknown): void {
  if (body === undefined || body === null) return;
  if (invalidEmbedUrls(body).length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_EMBED" });
  }
}
```

In `addLesson`, call `assertLessonBodyEmbeds(input.body);` right before `const lesson = await payload.create({`.
In `updateLesson`, call `assertLessonBodyEmbeds(input.body);` right before `const data: Record<string, unknown> = {};`.

- [ ] **Step 8: Run to verify it passes; typecheck; commit**

Run the integration test file with the DB prefix. Expected: PASS, 2 tests executed.
Run `pnpm vitest run src/lib/classroom/lesson-body.test.ts` and `SKIP_ENV_VALIDATION=1 pnpm typecheck`. Expected: pass.

```bash
git branch --show-current
git add src/lib/classroom/lesson-body.ts src/lib/classroom/lesson-body.test.ts src/collections/Lessons.ts src/server/api/routers/classrooms.ts src/server/api/routers/classroom-lessons.integration.test.ts src/payload-types.ts src/payload-generated-schema.ts
git commit -m "Classroom: Embed block in lesson bodies, checked on save"
```

---

### Task 3: Migrate each lesson's YouTube link into its body

**Files:**
- Create: `src/migrations/20260928b_lesson_youtube_to_embed.ts`
- Modify: `src/migrations/index.ts`
- Create: `src/migrations/lesson-youtube-to-embed.integration.test.ts`

**Interfaces:**
- Consumes: `planYoutubeMigration` (Task 2).
- Produces: the migration `20260928b_lesson_youtube_to_embed` (`up`, `down`).

- [ ] **Step 1: Write the failing integration test**

`src/migrations/lesson-youtube-to-embed.integration.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("migration 20260928b lesson youtube → embed [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    sql: typeof import("drizzle-orm").sql;
    up: typeof import("./20260928b_lesson_youtube_to_embed").up;
  };
  let m: Mods;
  const created: number[] = [];

  beforeAll(async () => {
    const [{ db }, { sql }, migration] = await Promise.all([
      import("@/server/db"),
      import("drizzle-orm"),
      import("./20260928b_lesson_youtube_to_embed"),
    ]);
    m = { db, sql, up: migration.up };
  }, 120_000);

  afterEach(async () => {
    if (created.length === 0) return;
    await m.db.execute(m.sql`DELETE FROM "lessons" WHERE "id" IN ${created}`);
    created.length = 0;
  });

  async function insertLesson(youtubeUrl: string | null, body: unknown) {
    const res = await m.db.execute(m.sql`
      INSERT INTO "lessons" ("course", "title", "order", "youtube_url", "body")
      VALUES (999999999, 'migration test', 0, ${youtubeUrl}, ${body === null ? null : JSON.stringify(body)}::jsonb)
      RETURNING "id"`);
    const id = Number((res.rows[0] as { id: number }).id);
    created.push(id);
    return id;
  }

  async function read(id: number) {
    const lesson = await m.db.execute(m.sql`SELECT "body", "youtube_url" FROM "lessons" WHERE "id" = ${id}`);
    const resources = await m.db.execute(
      m.sql`SELECT "label", "url", "_order" FROM "lessons_resources" WHERE "_parent_id" = ${id} ORDER BY "_order"`,
    );
    return {
      body: (lesson.rows[0] as { body: unknown }).body,
      youtubeUrl: (lesson.rows[0] as { youtube_url: string | null }).youtube_url,
      resources: resources.rows as { label: string; url: string; _order: number }[],
    };
  }

  const run = () => m.up({ db: m.db } as never);
  const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  it("prepends an Embed block, keeps the notes and leaves youtube_url for rollback", async () => {
    const id = await insertLesson(YT, {
      root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: "notes" }] }] },
    });
    await run();
    const after = await read(id);
    const children = (after.body as { root: { children: { type: string; fields?: { blockType?: string; url?: string } }[] } }).root.children;
    expect(children[0]).toMatchObject({ type: "block", fields: { blockType: "Embed", url: YT } });
    expect(children[1]).toMatchObject({ type: "paragraph" });
    expect(after.youtubeUrl).toBe(YT);
  });

  it("gives a lesson with no body a body", async () => {
    const id = await insertLesson(YT, null);
    await run();
    const after = await read(id);
    expect(JSON.stringify(after.body)).toContain('"blockType":"Embed"');
  });

  it("keeps a non-embeddable link as a resource after existing ones", async () => {
    const zoom = "https://zoom.us/rec/share/abc";
    const id = await insertLesson(zoom, null);
    await m.db.execute(m.sql`
      INSERT INTO "lessons_resources" ("_order", "_parent_id", "id", "label", "url")
      VALUES (3, ${id}, ${`r-${id}`}, 'Slides', 'https://example.test/s')`);
    await run();
    const after = await read(id);
    expect(after.resources).toEqual([
      { label: "Slides", url: "https://example.test/s", _order: 3 },
      { label: "Video", url: zoom, _order: 4 },
    ]);
    expect(after.body).toBeNull();
  });

  it("is safe to run twice", async () => {
    const embedId = await insertLesson(YT, null);
    const zoomId = await insertLesson("https://zoom.us/rec/share/abc", null);
    await run();
    await run();
    const embed = await read(embedId);
    const embedCount = JSON.stringify(embed.body).split('"blockType":"Embed"').length - 1;
    expect(embedCount).toBe(1);
    expect((await read(zoomId)).resources).toHaveLength(1);
  });

  it("leaves lessons without a youtube_url alone", async () => {
    const id = await insertLesson(null, null);
    await run();
    expect((await read(id)).body).toBeNull();
  });
});
```

Run it with the DB prefix. Expected: FAIL. The migration module is not found.

- [ ] **Step 2: Write the migration**

`src/migrations/20260928b_lesson_youtube_to_embed.ts`:

```ts
// Classroom lesson materials, slice 1 (spec 2026-09-27 §3.4, ADR-0037):
// the single "YouTube URL" slot becomes an ordinary Embed block at the top
// of the lesson body. A link the embed registry can't show (e.g. a Zoom
// recording) is kept as a "Video" resource link instead of being dropped.
//
// Expand/contract: youtube_url is left untouched so the previous release
// keeps working if rolled back; a later migration drops the column.
// Idempotent: a lesson already carrying the Embed block or resource is
// skipped, so a retried deploy changes nothing.
import { randomBytes } from "node:crypto";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { planYoutubeMigration } from "../lib/classroom/lesson-body";

type Row = {
  id: number;
  youtubeUrl: string | null;
  body: unknown;
  resourceUrls: string[] | null;
  maxOrder: number | string | null;
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT
      l."id",
      l."youtube_url" AS "youtubeUrl",
      l."body",
      (SELECT json_agg(r."url") FROM "lessons_resources" r WHERE r."_parent_id" = l."id") AS "resourceUrls",
      (SELECT max(r."_order") FROM "lessons_resources" r WHERE r."_parent_id" = l."id") AS "maxOrder"
    FROM "lessons" l
    WHERE l."youtube_url" IS NOT NULL AND btrim(l."youtube_url") <> ''
  `);

  for (const row of rows as Row[]) {
    const step = planYoutubeMigration({
      body: row.body,
      youtubeUrl: row.youtubeUrl,
      resourceUrls: row.resourceUrls ?? [],
      blockId: randomBytes(6).toString("hex"),
    });
    if (step.kind === "embed") {
      await db.execute(sql`
        UPDATE "lessons" SET "body" = ${JSON.stringify(step.body)}::jsonb
        WHERE "id" = ${row.id}`);
    } else if (step.kind === "resource") {
      await db.execute(sql`
        INSERT INTO "lessons_resources" ("_order", "_parent_id", "id", "label", "url")
        VALUES (${Number(row.maxOrder ?? 0) + 1}, ${row.id}, ${randomBytes(12).toString("hex")}, ${step.label}, ${step.url})`);
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Data-only and additive; youtube_url is untouched, so nothing to revert.
}
```

Register it at the end of `src/migrations/index.ts`, following the existing pattern:

```ts
import * as migration_20260928b_lesson_youtube_to_embed from "./20260928b_lesson_youtube_to_embed";
```

and the last array entry:

```ts
  {
    up: migration_20260928b_lesson_youtube_to_embed.up,
    down: migration_20260928b_lesson_youtube_to_embed.down,
    name: "20260928b_lesson_youtube_to_embed",
  },
```

Before committing, check that no newer migration name exists on `origin/main` or in open PRs:
`git fetch origin && git ls-tree --name-only origin/main src/migrations/ | tail -3` and `gh pr list --state open --search "migrations"`. If a `20260928a_*` already exists, rename to the next free letter everywhere.

- [ ] **Step 3: Run to verify it passes**

Run the test with the DB prefix. Expected: PASS, 5 tests executed.
Run `SKIP_ENV_VALIDATION=1 pnpm typecheck`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add src/migrations/20260928b_lesson_youtube_to_embed.ts src/migrations/index.ts src/migrations/lesson-youtube-to-embed.integration.test.ts
git commit -m "Classroom: migrate each lesson's YouTube link into an Embed block"
```

---

### Task 4: Render Embed blocks in the classroom only

**Files:**
- Modify: `src/lib/lexical.tsx`
- Create: `src/lib/lexical-renderers.test.tsx`
- Create: `src/components/classroom/materials/embed-frame.tsx`, `src/components/classroom/materials/embed-frame.test.tsx`, `src/components/classroom/materials/block-renderers.tsx`
- Modify: `src/components/classroom/course-view.tsx`

**Interfaces:**
- Consumes: `resolveEmbed`, `EmbedAspect` (Task 1).
- Produces:
  ```ts
  // src/lib/lexical.tsx
  export type BlockRenderers = Record<string, (fields: Record<string, unknown>) => React.ReactNode>;
  export function LexicalRenderer(props: { content: unknown; blockRenderers?: BlockRenderers }): React.JSX.Element | null;
  // src/components/classroom/materials/embed-frame.tsx
  export function EmbedFrame(props: { url: string }): React.JSX.Element | null;
  // src/components/classroom/materials/block-renderers.tsx
  export const classroomBlockRenderers: BlockRenderers;
  ```
  Task 5 reuses `EmbedFrame` in the editor preview.

- [ ] **Step 1: Write the failing tests**

`src/lib/lexical-renderers.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LexicalRenderer } from "./lexical";

const content = {
  root: {
    children: [
      { type: "paragraph", children: [{ type: "text", text: "hello" }] },
      { type: "block", fields: { blockType: "Embed", url: "https://youtu.be/dQw4w9WgXcQ" } },
      { type: "block", fields: { blockType: "Image", src: "https://img.example.test/a.png", alt: "diagram" } },
    ],
  },
};

describe("LexicalRenderer block renderers", () => {
  it("renders nothing for an Embed block when no renderers are passed (forum, launchpad)", () => {
    const { container } = render(<LexicalRenderer content={content} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("hello");
  });

  it("hands custom blocks to the matching renderer with their fields", () => {
    const Embed = vi.fn(() => <div data-testid="embed" />);
    const { getByTestId } = render(
      <LexicalRenderer content={content} blockRenderers={{ Embed }} />,
    );
    expect(getByTestId("embed")).toBeTruthy();
    expect(Embed).toHaveBeenCalledWith(
      expect.objectContaining({ blockType: "Embed", url: "https://youtu.be/dQw4w9WgXcQ" }),
    );
  });

  it("keeps built-in blocks built-in even if a renderer uses their name", () => {
    // Image is a built-in block that renders synchronously (Code renders via
    // an async server component, which a client test can't mount).
    const Image = vi.fn(() => <div data-testid="custom-image" />);
    const { queryByTestId, container } = render(
      <LexicalRenderer content={content} blockRenderers={{ Image }} />,
    );
    expect(queryByTestId("custom-image")).toBeNull();
    expect(Image).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://img.example.test/a.png");
  });
});
```

`src/components/classroom/materials/embed-frame.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmbedFrame } from "./embed-frame";

describe("EmbedFrame", () => {
  it("renders a sandboxed iframe on the built embed address", () => {
    const { container } = render(<EmbedFrame url="https://youtu.be/dQw4w9WgXcQ" />);
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-presentation allow-popups");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(iframe?.getAttribute("loading")).toBe("lazy");
    expect(iframe?.getAttribute("allow")).toBe("fullscreen; picture-in-picture; encrypted-media; clipboard-write");
    expect(iframe?.getAttribute("title")).toBe("YouTube");
  });

  it("uses a page-shaped frame for documents", () => {
    const { container } = render(
      <EmbedFrame url="https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123/edit" />,
    );
    expect(container.firstElementChild?.className).toContain("h-[70vh]");
  });

  it("renders nothing for a link it cannot embed", () => {
    const { container } = render(<EmbedFrame url="https://evil.test/x" />);
    expect(container.innerHTML).toBe("");
  });
});
```

Run: `pnpm vitest run src/lib/lexical-renderers.test.tsx src/components/classroom/materials/embed-frame.test.tsx`
Expected: FAIL. The `blockRenderers` prop is ignored, and `./embed-frame` is not found.

- [ ] **Step 2: Add the seam to `src/lib/lexical.tsx`**

1. Extend the `fields` type of the local `LexicalNode` type with an index signature, so custom blocks carry their own fields: add `[key: string]: unknown;` as the last member of `fields?: { … }`.
2. Add, above `renderNode`:

```ts
/** Renderers for Payload blocks this renderer doesn't know (keyed by blockType). */
export type BlockRenderers = Record<
  string,
  (fields: Record<string, unknown>) => React.ReactNode
>;

type RenderContext = {
  slugMap: Map<string, number>;
  blockRenderers?: BlockRenderers;
};
```

3. Change `renderNode`'s third parameter from `slugMap: Map<string, number>` to `ctx: RenderContext`. Replace every recursive call `renderNode(c, i, slugMap)` with `renderNode(c, i, ctx)`, and every other use of `slugMap` inside `renderNode` with `ctx.slugMap`.
4. In `case "block":`, replace the final `return null;` of that case with:

```ts
      // Blocks owned by a feature (e.g. classroom Embed) — rendered only
      // where that feature passes a renderer; ignored everywhere else.
      const blockType = node.fields?.blockType;
      const custom = blockType ? ctx.blockRenderers?.[blockType] : undefined;
      if (!custom || !node.fields) return null;
      return (
        <React.Fragment key={idx}>
          {custom(node.fields as Record<string, unknown>)}
        </React.Fragment>
      );
```

5. Change `LexicalRenderer`:

```tsx
export function LexicalRenderer({
  content,
  blockRenderers,
}: {
  content: unknown;
  blockRenderers?: BlockRenderers;
}) {
```

and its last lines to:

```tsx
  const ctx: RenderContext = { slugMap: new Map<string, number>(), blockRenderers };
  return (
    <div className="text-foreground leading-7">
      {data.root.children.map((node, i) => renderNode(node, i, ctx))}
    </div>
  );
```

- [ ] **Step 3: Create the classroom renderer pieces**

`src/components/classroom/materials/embed-frame.tsx`:

```tsx
import { resolveEmbed, type EmbedAspect } from "@/lib/classroom/embed-providers";

const FRAME_CLASS: Record<EmbedAspect, string> = {
  "16:9": "aspect-video",
  page: "h-[70vh] min-h-[480px]",
};

/** One embedded lesson material. The src is always built by the registry. */
export function EmbedFrame({ url }: { url: string }) {
  const embed = resolveEmbed(url);
  if (!embed) return null;
  return (
    <div
      className={`border-border relative my-6 w-full overflow-hidden rounded-lg border ${FRAME_CLASS[embed.aspect]}`}
    >
      <iframe
        src={embed.embedSrc}
        title={embed.label}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="fullscreen; picture-in-picture; encrypted-media; clipboard-write"
        allowFullScreen
        className="absolute inset-0 size-full"
      />
    </div>
  );
}
```

`src/components/classroom/materials/block-renderers.tsx`:

```tsx
import type { BlockRenderers } from "@/lib/lexical";
import { EmbedFrame } from "./embed-frame";

/** Lesson-body blocks only the classroom renders. */
export const classroomBlockRenderers: BlockRenderers = {
  Embed: (fields) =>
    typeof fields.url === "string" ? <EmbedFrame url={fields.url} /> : null,
};
```

- [ ] **Step 4: Use them in `course-view.tsx`; drop the YouTube slot**

In `src/components/classroom/course-view.tsx`:
- Replace `<LexicalRenderer content={selectedLesson.body} />` with `<LexicalRenderer content={selectedLesson.body} blockRenderers={classroomBlockRenderers} />`. Import `classroomBlockRenderers` from `./materials/block-renderers`.
- Delete the `const embed = selectedLesson?.youtubeUrl ? youtubeEmbedUrl(…) : null;` declaration.
- Delete the whole `{/* Video */}` JSX block (the `embed ? <iframe…> : selectedLesson.youtubeUrl ? <a…>{t("watchVideo")}</a> : null` expression).
- Remove `youtubeEmbedUrl` from the `@/lib/classroom` import.
- Remove `youtubeUrl?: string | null;` from the local lesson interface.
- Remove the `ExternalLink` import if it is no longer used (`grep -n ExternalLink src/components/classroom/course-view.tsx`).

- [ ] **Step 5: Run to verify; typecheck; commit**

Run: `pnpm vitest run src/lib/lexical-renderers.test.tsx src/components/classroom/materials/embed-frame.test.tsx src/lib/lexical.test.ts`
Expected: PASS.
Run: `SKIP_ENV_VALIDATION=1 pnpm typecheck && pnpm lint`
Expected: clean.

```bash
git branch --show-current
git add src/lib/lexical.tsx src/lib/lexical-renderers.test.tsx src/components/classroom/materials/embed-frame.tsx src/components/classroom/materials/embed-frame.test.tsx src/components/classroom/materials/block-renderers.tsx src/components/classroom/course-view.tsx
git commit -m "Classroom: render lesson Embed blocks through a renderer seam"
```

---

### Task 5: Embed in the lesson editor; retire the YouTube field

**Files:**
- Modify: `src/components/article-editor/utils.ts`; Create: `src/components/article-editor/utils.test.ts`
- Modify: `src/components/article-editor/rich-text-editor.tsx`
- Create: `src/components/classroom/materials/embed-node.tsx`
- Modify: `src/components/classroom/lesson-editor.tsx`
- Modify: `src/collections/Lessons.ts` (remove `youtubeUrl`), `src/server/api/routers/classrooms.ts` (remove `youtubeUrl` inputs and writes)
- Modify: `src/lib/classroom.ts`, `src/lib/classroom.test.ts` (remove `youtubeEmbedUrl`)
- Modify: `messages/en.json`, `messages/nl.json`
- Regenerate: `src/payload-types.ts`, `src/payload-generated-schema.ts`

**Interfaces:**
- Consumes: `resolveEmbed`, `EMBED_PROVIDER_LABELS` (Task 1); `EmbedFrame` (Task 4); stored block shape (Task 2).
- Produces:
  ```ts
  // src/components/article-editor/utils.ts
  export type BlockNodeMapping = { blockType: string; nodeType: string };
  export function filterSlashCommands(query: string, extra?: readonly SlashCommand[]): SlashCommand[];
  export function preprocessEditorState(content: SerializedEditorState | undefined, extra?: readonly BlockNodeMapping[]): string | undefined;
  export function postprocessEditorState(state: SerializedEditorState, extra?: readonly BlockNodeMapping[]): SerializedEditorState;
  // src/components/article-editor/rich-text-editor.tsx
  export type RichTextEditorExtension = BlockNodeMapping & {
    node: Klass<LexicalNode>;
    command: SlashCommand;
    toolbar: { title: string; icon: ReactNode };
    create: () => LexicalNode;
  };
  // RichTextEditorProps gains: extensions?: readonly RichTextEditorExtension[];
  // src/components/classroom/materials/embed-node.tsx
  export class EmbedNode extends DecoratorNode<React.JSX.Element> { … }
  export function $createEmbedNode(url?: string): EmbedNode;
  export const classroomEditorExtensions: readonly RichTextEditorExtension[];
  ```

- [ ] **Step 1: Write the failing utils test**

`src/components/article-editor/utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { filterSlashCommands, postprocessEditorState, preprocessEditorState } from "./utils";

const EMBED = { blockType: "Embed", nodeType: "embed" };
const stored = {
  root: {
    children: [
      { type: "block", fields: { blockType: "Embed", url: "https://youtu.be/dQw4w9WgXcQ", id: "a" } },
      { type: "block", fields: { blockType: "Code", code: "x" } },
    ],
  },
} as unknown as SerializedEditorState;

describe("block ↔ node remapping", () => {
  it("keeps today's behaviour without extensions", () => {
    const pre = JSON.parse(preprocessEditorState(stored)!);
    expect(pre.root.children.map((n: { type: string }) => n.type)).toEqual(["block", "code-block"]);
  });

  it("maps extension blocks to their node type and back", () => {
    const pre = JSON.parse(preprocessEditorState(stored, [EMBED])!);
    expect(pre.root.children.map((n: { type: string }) => n.type)).toEqual(["embed", "code-block"]);
    const post = postprocessEditorState(pre, [EMBED]) as unknown as { root: { children: { type: string }[] } };
    expect(post.root.children.map((n) => n.type)).toEqual(["block", "block"]);
  });
});

describe("filterSlashCommands with extra commands", () => {
  const extra = [{ id: "embed", label: "Embed slides or video", group: "Basic" as const, keywords: ["youtube", "slides"] }];

  it("finds an extra command by keyword", () => {
    expect(filterSlashCommands("slides", extra).map((c) => c.id)).toContain("embed");
  });

  it("does not add extra commands when none are passed", () => {
    expect(filterSlashCommands("").map((c) => c.id)).not.toContain("embed");
  });
});
```

Run: `pnpm vitest run src/components/article-editor/utils.test.ts`
Expected: FAIL. With `[EMBED]` the node types stay `block`, and the extra command is not found.

- [ ] **Step 2: Generalise `utils.ts`**

Add near the top:

```ts
/** A Payload block stored as `{type:"block", fields.blockType}` that the editor handles as its own node type. */
export type BlockNodeMapping = { blockType: string; nodeType: string };
```

Change `filterSlashCommands`:

```ts
export function filterSlashCommands(
  query: string,
  extra: readonly SlashCommand[] = [],
): SlashCommand[] {
  const all = [...SLASH_COMMANDS, ...extra];
  const q = query.trim().toLowerCase();
  if (!q) return all;

  return all.filter((command) => {
    return (
      command.label.toLowerCase().includes(q) ||
      command.id.toLowerCase().includes(q) ||
      command.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });
}
```

In `preprocessEditorState`, add a parameter `extra: readonly BlockNodeMapping[] = []`. Inside `walkNodes`, after the Image remap, add:

```ts
      const mapped =
        node.type === "block"
          ? extra.find((e) => e.blockType === node.fields?.blockType)
          : undefined;
      if (mapped) node.type = mapped.nodeType;
```

In `postprocessEditorState`, add the same parameter. Inside `walkNodes`, before the `children` recursion, add:

```ts
      if (extra.some((e) => e.nodeType === node.type)) node.type = "block";
```

Run the utils test again. Expected: PASS.

- [ ] **Step 3: Add the `extensions` seam to `rich-text-editor.tsx`**

1. Import `Klass` and `LexicalNode` as types from `@payloadcms/richtext-lexical/lexical` (extend the existing import). Import `type SlashCommand` is already there. Import `type BlockNodeMapping` from `./utils`.
2. Export the extension type above `RichTextEditorProps`:

```ts
/** A feature-owned block node (e.g. classroom Embed): registered, insertable from the slash menu and toolbar, and mapped to/from its stored Payload block. */
export type RichTextEditorExtension = BlockNodeMapping & {
  node: Klass<LexicalNode>;
  command: SlashCommand;
  toolbar: { title: string; icon: ReactNode };
  create: () => LexicalNode;
};
```

3. Add to `RichTextEditorProps`:

```ts
  /** Feature-owned block nodes. Pass a module-level constant (stable identity). */
  extensions?: readonly RichTextEditorExtension[];
```

and destructure it in `RichTextEditor` as `extensions = NO_EXTENSIONS`, with `const NO_EXTENSIONS: readonly RichTextEditorExtension[] = [];` declared at module level.
4. In `initialConfig`:
   - `nodes: [...the existing list..., ...extensions.map((e) => e.node)]`
   - `preprocessEditorState(initialValue as SerializedEditorState, extensions)`
5. In `handleEditorChange`: `postprocessEditorState(edState.toJSON(), extensions)`. Add `extensions` to that `useCallback`'s dependency list.
6. At the very start of `executeSlashCommand`, after `if (!editorRef) return;`, add:

```ts
      const extension = extensions.find((e) => e.command.id === id);
      if (extension) {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertNodes([extension.create(), $createParagraphNode()]);
          }
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }
```

   Add `extensions` to its dependency list.
7. `filteredSlashCommands`: `filterSlashCommands(slash.query, extensionCommands)` with `const extensionCommands = useMemo(() => extensions.map((e) => e.command), [extensions]);` and add it to that memo's deps.
8. `EditorToolbar` gains a prop `extraItems: { key: string; title: string; icon: ReactNode; run: () => void }[]`. The `items.map` renders `[...items, ...extraItems]`. The call site passes:

```tsx
      <EditorToolbar
        editor={editorRef}
        onBlock={executeSlashCommand}
        extraItems={extensions.map((e) => ({
          key: e.command.id,
          title: e.toolbar.title,
          icon: e.toolbar.icon,
          run: () => executeSlashCommand(e.command.id),
        }))}
      />
```

- [ ] **Step 4: Create the Embed node**

`src/components/classroom/materials/embed-node.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Presentation } from "lucide-react";
import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "@payloadcms/richtext-lexical/lexical";

import type { RichTextEditorExtension } from "@/components/article-editor/rich-text-editor";
import { EMBED_PROVIDER_LABELS, resolveEmbed } from "@/lib/classroom/embed-providers";
import { EmbedFrame } from "./embed-frame";

export type SerializedEmbedNode = SerializedLexicalNode & {
  type: "embed";
  fields: { id: string; blockType: "Embed"; blockName: string; url: string };
};

function EmbedEditor({ url, nodeKey, editor }: { url: string; nodeKey: NodeKey; editor: LexicalEditor }) {
  const t = useTranslations("classroom");
  const [value, setValue] = useState(url);
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setValue(url);
  }

  const update = useCallback(
    (next: string) => {
      setValue(next);
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof EmbedNode) node.setUrl(next.trim());
      });
    },
    [editor, nodeKey],
  );

  const remove = useCallback(() => {
    editor.update(() => $getNodeByKey(nodeKey)?.remove());
  }, [editor, nodeKey]);

  const resolved = value.trim() ? resolveEmbed(value) : null;

  return (
    <div className="border-border my-4 rounded-lg border">
      <div className="border-border flex items-center gap-2 border-b px-3 py-1.5">
        <input
          type="url"
          value={value}
          onChange={(e) => update(e.target.value)}
          placeholder={t("embedPlaceholder")}
          aria-label={t("embedLinkLabel")}
          className="text-muted-foreground flex-1 bg-transparent font-mono text-xs focus:outline-none"
        />
        {resolved ? <span className="text-muted-foreground text-xs">{resolved.label}</span> : null}
        <button
          type="button"
          onClick={remove}
          className="text-muted-foreground hover:text-destructive text-xs transition-colors"
          aria-label={t("embedRemove")}
          title={t("embedRemove")}
        >
          ✕
        </button>
      </div>
      <div className="px-3 pb-3">
        {!value.trim() ? (
          <p className="text-muted-foreground pt-3 text-xs">
            {t("embedHelp", { providers: EMBED_PROVIDER_LABELS.join(", ") })}
          </p>
        ) : !resolved ? (
          <p className="text-destructive pt-3 text-xs">{t("embedUnsupported")}</p>
        ) : (
          <>
            {resolved.needsPublicSharing ? (
              <p className="text-muted-foreground pt-3 text-xs">{t("embedSharingHint")}</p>
            ) : null}
            <EmbedFrame url={value} />
          </>
        )}
      </div>
    </div>
  );
}

function generateBlockId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

export class EmbedNode extends DecoratorNode<React.JSX.Element> {
  __url: string;
  __blockId: string;

  static getType(): string {
    return "embed";
  }

  static clone(node: EmbedNode): EmbedNode {
    return new EmbedNode(node.__url, node.__blockId, node.__key);
  }

  constructor(url: string, blockId?: string, key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__blockId = blockId ?? generateBlockId();
  }

  static importJSON(json: SerializedEmbedNode): EmbedNode {
    return new EmbedNode(json.fields?.url ?? "", json.fields?.id);
  }

  exportJSON(): SerializedEmbedNode {
    return {
      type: "embed",
      version: 1,
      fields: { id: this.__blockId, blockType: "Embed", blockName: "", url: this.__url },
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  setUrl(url: string): void {
    this.getWritable().__url = url;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return <EmbedEditor url={this.__url} nodeKey={this.__key} editor={editor} />;
  }
}

export function $createEmbedNode(url = ""): EmbedNode {
  return new EmbedNode(url);
}

export function $isEmbedNode(node: LexicalNode | null | undefined): node is EmbedNode {
  return node instanceof EmbedNode;
}

/** The classroom's lesson-editor extensions. Module-level: stable identity. */
export const classroomEditorExtensions: readonly RichTextEditorExtension[] = [
  {
    node: EmbedNode,
    nodeType: "embed",
    blockType: "Embed",
    command: {
      id: "embed",
      label: "Embed slides or video",
      group: "Basic",
      keywords: ["embed", "video", "youtube", "vimeo", "loom", "slides", "google", "docs", "sheets", "drive", "figma"],
    },
    toolbar: { title: "Embed slides or video", icon: <Presentation className="size-4" /> },
    create: () => $createEmbedNode(""),
  },
];
```

Note: The Embed node's toolbar title and slash label are English, matching the editor's existing English chrome ("Bold", "Heading 2"). Everything a trainer reads *inside* the block is translated.

- [ ] **Step 5: Add strings (en + nl); remove retired ones**

First run `grep -rn '"youtubeUrl"\|"watchVideo"\|t("youtubeUrl")\|t("watchVideo")' src messages`. Remove the `classroom.youtubeUrl` and `classroom.watchVideo` keys from both files only if nothing else uses them after this task.

Add under `classroom` in `messages/en.json`:

```json
    "embedPlaceholder": "Paste a link to a video, slides or document",
    "embedLinkLabel": "Link to show in the lesson",
    "embedHelp": "Paste a link from {providers}.",
    "embedUnsupported": "This site can't be shown inside the lesson. Add it as a resource link instead.",
    "embedSharingHint": "Learners can only see this if the file is shared as \"Anyone with the link\".",
    "embedRemove": "Remove",
    "embedInvalidOnSave": "One of the embedded links can't be shown. Fix or remove it, then save again.",
```

and in `messages/nl.json`:

```json
    "embedPlaceholder": "Plak een link naar een video, dia's of document",
    "embedLinkLabel": "Link om in de les te tonen",
    "embedHelp": "Plak een link van {providers}.",
    "embedUnsupported": "Deze site kan niet in de les worden getoond. Voeg hem toe als bronlink.",
    "embedSharingHint": "Deelnemers zien dit alleen als het bestand gedeeld is met \"Iedereen met de link\".",
    "embedRemove": "Verwijderen",
    "embedInvalidOnSave": "Een van de ingesloten links kan niet worden getoond. Pas hem aan of verwijder hem en sla opnieuw op.",
```

- [ ] **Step 6: Use it in the lesson editor; remove the YouTube input**

In `src/components/classroom/lesson-editor.tsx`:
- Pass `extensions={classroomEditorExtensions}` to `<RichTextEditor … />` (import from `./materials/embed-node`).
- Remove the YouTube URL field: the `youtubeUrl`/`setYoutubeUrl` props of `LessonFields` and their `<Label>{t("youtubeUrl")}</Label>…<Input …/>` block; the `youtubeUrl` state in `LessonRow` and in the add-lesson form; the `youtubeUrl` keys in both `update.mutate({…})` and the add mutation's `mutate({…})`; and `youtubeUrl?: string | null` from `LessonLike`.
- In both mutations' `onError`, show the friendly message for the embed refusal:

```ts
    onError: (err) =>
      toast.error(
        err.message === "INVALID_EMBED"
          ? t("embedInvalidOnSave")
          : (err.message ?? t("saveFailed")),
      ),
```

- [ ] **Step 7: Retire `youtubeUrl` on the server; remove `youtubeEmbedUrl`**

- `src/collections/Lessons.ts`: delete `{ name: "youtubeUrl", type: "text", maxLength: 500 },`. The column stays in the database until a later contract migration; Payload ignores it.
- `src/server/api/routers/classrooms.ts`:
  - delete the `youtubeUrl` line from the `addLesson` and `updateLesson` input schemas;
  - delete `youtubeUrl: input.youtubeUrl ?? undefined,` from `addLesson`'s `payload.create` data;
  - delete the two-line `if (input.youtubeUrl !== undefined) data.youtubeUrl = …` from `updateLesson`.
- `src/lib/classroom.ts`: delete `youtubeEmbedUrl` and its doc comment. `src/lib/classroom.test.ts`: delete its `describe("youtubeEmbedUrl", …)` block and the import.
- Regenerate `src/payload-types.ts` and `src/payload-generated-schema.ts` as in Task 2 Step 5.
- `grep -rn "youtubeUrl\|youtubeEmbedUrl" src --include=*.ts --include=*.tsx | grep -v payload-types | grep -v payload-generated-schema | grep -v src/migrations/` must print nothing.

- [ ] **Step 8: Verify and commit**

Run:
```bash
pnpm vitest run src/components/article-editor/utils.test.ts src/lib/classroom.test.ts src/lib/classroom src/components/classroom
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
```
Then run the DB tests with the DB prefix on `src/server/api/routers/classroom-lessons.integration.test.ts src/server/api/routers/classroom-access.integration.test.ts src/migrations/lesson-youtube-to-embed.integration.test.ts`.
Expected: all pass, and the DB tests executed.

Manual check (dev server against the test DB is not required). Describe in the report what the screen hands the code: the toolbar button and the `/embed` slash command insert an Embed node; saving posts a body whose Embed block is `{type:"block", fields:{blockType:"Embed", url}}`. Confirm this with a unit-level assertion if practical, e.g. a test that `postprocessEditorState` of an editor state holding an `EmbedNode.exportJSON()` produces the stored block shape.

```bash
git branch --show-current
git add src/components/article-editor/utils.ts src/components/article-editor/utils.test.ts src/components/article-editor/rich-text-editor.tsx src/components/classroom/materials/embed-node.tsx src/components/classroom/lesson-editor.tsx src/collections/Lessons.ts src/server/api/routers/classrooms.ts src/lib/classroom.ts src/lib/classroom.test.ts messages/en.json messages/nl.json src/payload-types.ts src/payload-generated-schema.ts
git commit -m "Classroom: embed slides and video from the lesson editor; retire the YouTube field"
git status --short   # only the untracked plan copy, if any
```

---

### Task 6: Whole-branch verification and PR

- [ ] **Step 1: Full suites**

```bash
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
SKIP_ENV_VALIDATION=1 pnpm test
```
Run all classroom DB suites with the DB prefix: `src/server/api/routers/classroom-access.integration.test.ts src/server/api/routers/classroom-lessons.integration.test.ts src/migrations/lesson-youtube-to-embed.integration.test.ts`.
Expected: green. Record pre-existing unrelated failures by name.

- [ ] **Step 2: Parallel-work check**

`git fetch origin && git log origin/main --oneline -20` and `gh pr list --state open --search "embed OR lesson OR migrations"`. Look for a duplicate feature or a colliding migration name. If `main` moved, rebase onto it (no force-push to shared branches; this branch is ours).

- [ ] **Step 3: Push and open the PR** (controller does this after the final review)

PR description (no AI credit lines): what trainers can do now; the pattern (strategy registry + renderer/editor seams + expand/contract migration), what it buys, what was rejected (raw iframe HTML; a separate materials list; a global slash command in the article editor); deploy notes (the migration runs automatically in the Vercel build before the new code; `youtube_url` column kept for rollback; a follow-up contract migration drops it); a visible change: the lesson video now appears under the lesson title, as the first block of the lesson text.

---

## Self-review notes

- **Spec §3 coverage:**
  - 3.1 registry: Task 1.
  - 3.2 Embed block: Task 2. HostedVideo/HostedFile blocks are slices 2–3.
  - 3.3 renderer seam: Task 4. The materials manifest belongs to slices 2–3.
  - 3.4 migration A: Task 3. Migration B (drop the column) is a later PR.
  - 3.5 editor: Task 5. "Upload" and "Reuse" entries arrive with slices 2–3; this slice ships "paste a link" as the toolbar button and the `/embed` command.
- Server-side validation (§3.1 "the server check is the rule"): Task 2.
- **Type names used across tasks:**
  - `resolveEmbed`, `ResolvedEmbed`, `EmbedAspect`, `EMBED_PROVIDER_LABELS`;
  - `embedBlockNode`, `collectEmbedUrls`, `invalidEmbedUrls`, `prependEmbedBlock`, `planYoutubeMigration`;
  - `BlockRenderers`, `EmbedFrame`, `classroomBlockRenderers`;
  - `BlockNodeMapping`, `RichTextEditorExtension`, `EmbedNode`, `classroomEditorExtensions`.
