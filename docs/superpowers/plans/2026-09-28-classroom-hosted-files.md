# Classroom hosted files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A course author whose community allows it uploads a file (PDF, slides, a document, a spreadsheet, a ZIP or an image, up to 200 MB) into a lesson. Learners see a file card with a Download button (PDFs also show a preview). Each file belongs to its course, can be reused in any of its lessons, and is either for members only (default) or a free preview for visitors of a public course. Community owners and admins choose who may upload and see how much storage is used.

**Architecture:**
- **Object storage (Adapter + Facade).** A generic S3 adapter `object-storage.ts` (`presignUpload`, `inspect`, `signedGetUrl`, `publicUrl`, `remove`). `video-storage.ts` keeps its exact public API as a thin facade over it, so every Reels/feed consumer and test stays unchanged.
- **Pure rules.** `material-rules.ts` holds allowed types (extension → Content-Type), limits, the object key builder and display helpers. `material-access.ts` holds the one rule for who may download a file and builds the read-time manifest. Both are shared by browser and server.
- **Record + service + router.** A Payload collection `hosted-materials` is the record. `hosted-files.ts` is the upload lifecycle service (dependencies injected, unit-tested with fakes). A new `classroomMaterials` tRPC router is a thin shell over it. `media-allowance.ts` is the single seam where paid plans change limits later.
- **Lesson body.** A `HostedFile` Payload block stores only `materialId`. `lesson-materials.ts` checks bodies on save and builds the manifest for `classrooms.get`. The renderer reads the manifest from a React context; download links are minted on demand.
- **Editor.** The rich-text editor's extension seam gains optional insertion (a node can be registered without being insertable). A `HostedFileNode` uploads or reuses a course file; the upload POST helper is extracted from the Reels hook and shared.

**Tech Stack:** Next.js App Router, tRPC 11, Payload 3 (Lexical rich text, local API), Drizzle (`app` schema), hand-written Payload migrations, AWS SDK v3 (S3 presigned POST / GET), next-intl (en, nl), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-27-classroom-lesson-materials-design.md` §1, §2.1, §2.3, §4, §7, §8, §9, §10 (slice 2). ADR-0037. Controller design brief (binding decisions) is summarised in Global Constraints and Plan notes below.

## Global Constraints

- **Worktree and branch.** Worktree `/Users/greg/coding-projects/aitcom/.claude/worktrees/classroom-hosted-files`, branch `feat/classroom-hosted-files` (stacked on `feat/classroom-lesson-embeds`, PR #361). Below, `WS` means that worktree path. Run every command from `WS`.
- **Git rules.** Run `git branch --show-current` before every commit; it must print `feat/classroom-hosted-files`. Never `git checkout`, `git switch`, `git stash`, `git add -A` or `git add .`. Stage files by name. Before each commit, confirm every staged file is yours (`git diff --cached --stat`).
- **No AI credit.** No `Co-Authored-By`, "Generated with" or any AI credit line in commits or the PR.
- **Formatting.** Before each commit, run `pnpm exec prettier --write <the files you touched>`.
- **Typecheck/lint commands.** `SKIP_ENV_VALIDATION=1 pnpm typecheck` and `pnpm lint`.
- **DB tests (never host port 5432).** Run DB integration tests only against the isolated test database:
  `bash /Users/greg/coding-projects/aitcom/.claude/worktrees/classroom-hosted-files/dbtest.sh <files>` (i.e. `bash $WS/dbtest.sh <files>`; the controller provides this script). Equivalent inline command:
  `set +eu; set -a; . /Users/greg/coding-projects/aitcom/.env.docker >/dev/null 2>&1; set +a; unset PAYLOAD_PUSH; RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run <files>`
  A run that reports DB tests as *skipped* is a setup failure, not a pass.
- **Migrations.** Hand-written in `src/migrations/`, registered in `src/migrations/index.ts`, additive and idempotent (`IF NOT EXISTS`). Never run `db:push`, `db:apply` or `db:apply:dev`: `.env`'s `DATABASE_URL` is production. Production applies migrations automatically in the Vercel build (`scripts/db-apply-on-deploy.ts`), before the new code serves traffic. This slice adds exactly two: `20260928c_classroom_upload_policy` and `20260928d_hosted_materials`. Before creating each, run `git fetch origin -q && git ls-tree --name-only origin/main src/migrations/ | tail -5` and `gh pr list --state open --json number,title,headRefName` and confirm the name is still free; if taken, use the next free letter and update every reference in this plan's steps.
- **Applying a new migration to the test DB.** Each migration task applies its migration to `aitcom_test` with a one-off script that throws unless `DATABASE_URL` contains `127.0.0.1:55432/aitcom_test`, then deletes the script. Never commit that script.
- **Generated Payload files.** Regenerate `src/payload-types.ts` with the test-DB env (Task 3 gives the command). Commit only hunks this slice causes. Do not regenerate or edit `src/payload-generated-schema.ts` (see Plan notes).
- **Object keys.** Classroom files live at `private/classroom/<communityId>/<courseId>/<uploadId>.<ext>`. `communityId` must match `^[A-Za-z0-9_-]+$`, `courseId` must be a positive safe integer, `uploadId` must be a v4-style UUID (`isUploadId` from `@/lib/video-rules`), `ext` must be an allowed extension. The builder throws otherwise.
- **Allowed types (extension → Content-Type), exactly:**
  `pdf` → `application/pdf`; `ppt` → `application/vnd.ms-powerpoint`; `pptx` → `application/vnd.openxmlformats-officedocument.presentationml.presentation`; `doc` → `application/msword`; `docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`; `xls` → `application/vnd.ms-excel`; `xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; `csv` → `text/csv`; `key` → `application/vnd.apple.keynote`; `zip` → `application/zip`; `png` → `image/png`; `jpg` → `image/jpeg`; `jpeg` → `image/jpeg`; `webp` → `image/webp`.
  The extension is the part after the last dot, lower-cased; `x.pdf.exe` is refused. Only `pdf` renders inline.
- **Limits.** `MAX_FILE_BYTES = 200 * 1024 * 1024`; `MATERIAL_UPLOADS_PER_DAY = 30` per user (rolling 24 h); default community allowance `fileBytesStored = 5 * 1024 ** 3`. Storage usage = sum of `bytes` over the community's `hosted-materials` with status `uploading` or `ready`. The allowance is hard: refuse when `usage + declaredBytes > allowance`.
- **The presigned POST is pinned to the declared size.** `presignUpload({ key, contentType, maxBytes: <declared bytes> })`, and finish refuses a stored object larger than declared. This keeps the allowance honest.
- **Error codes (TRPCError `message`), exactly:** `UPLOADS_NOT_ALLOWED` (FORBIDDEN), `FILE_TYPE_NOT_ALLOWED` (BAD_REQUEST), `FILE_EMPTY` (BAD_REQUEST), `FILE_TOO_LARGE` (BAD_REQUEST), `UPLOAD_LIMIT` (TOO_MANY_REQUESTS), `STORAGE_FULL` (FORBIDDEN), `UPLOAD_EXPIRED` (NOT_FOUND), `UPLOAD_FAILED` (BAD_REQUEST), `INVALID_MATERIAL` (BAD_REQUEST). A course the caller can't edit is FORBIDDEN (not their course) or NOT_FOUND (no such course). A file the viewer can't download is NOT_FOUND.
- **Upload policy.** `communities.classroom_upload_policy` varchar(30) NOT NULL DEFAULT `'admins_only'`, type `"all_members" | "admins_only"`. `admins_only` → owner or admin (moderators excluded). `all_members` → any active member. Uploading also requires editing the course (today: being its author).
- **Visibility.** Each file is `members` (default) or `preview`. Download is allowed for course access `member` or `manager`, or `visitor` when the file is `preview`. Everyone else gets NOT_FOUND.
- **Stored HostedFile block JSON, exactly:** `{ "type": "block", "version": 2, "format": "", "fields": { "id": "<12 hex>", "blockName": "", "blockType": "HostedFile", "materialId": <number> } }`.
- **Manifest.** `classrooms.get` returns `materials: Record<number, MaterialSummary>` and `viewerCanUpload: boolean`. No URLs in the manifest. `access` is one of `download | join | processing | failed | removed`.
- **Customer copy.** Everyday words, no storage or protocol jargon, in both `messages/en.json` and `messages/nl.json`. Exact strings are given in the tasks. Edit the catalogs only with the node scripts given (they keep the files' 2-space JSON format).
- **Design rules (DESIGN.md).** Cards are border-defined and flat: `border-border rounded-lg border`, no shadow. Signal Orange (`Button` default variant / `bg-primary`) only for the one primary action: "Upload a file" in the editor node. Download is `variant="outline"`. Geist Mono (`font-mono`) only for machine text: file type, size, storage numbers, upload percent.
- **AWS IAM (product owner runs this; never run it yourself).** Grant the app's IAM user `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/private/classroom/*` and `s3:ListBucket` on `arn:aws:s3:::<bucket>` with condition `s3:prefix` = `private/classroom/*` (today's grants cover `media/videos/*` and `private/videos/*` only). Confirm `private/` stays non-public. The bucket CORS rule already allows browser POSTs from the site (Reels). This note also goes into the PR description.

## Review Focus

1. **A spoofed or odd file name** (`notes.pdf.exe`, `Slides.PDF`, `.pdf`, `archive.tar.gz`, no extension). Only a real allowed final extension passes, case-insensitively; the stored Content-Type comes from our map, never from the browser. Owned by Task 2 (rules tests) and Task 4 (service refuses before any record or grant).
2. **A browser declares a small size, then sends a bigger file** to slip past the storage allowance. The grant's size range is the declared size, and finish refuses (and deletes) a stored object larger than declared. Owned by Task 4.
3. **A lesson in a public course points at another course's members-only file** (crafted body). Saving is refused with `INVALID_MATERIAL`, and the manifest only ever looks up the lesson's own course, so a crafted body can't show another course's file. Owned by Task 5.
4. **An author deletes a file that lessons still use.** The lesson shows "This file was removed.", the lesson can still be edited and saved, and the storage is freed. Owned by Task 5 (save + manifest) and Task 6 (card).
5. **Finish is called twice, late, or by someone else.** A second finish returns the ready file unchanged; a finish after the finish window or by another user answers `UPLOAD_EXPIRED` and touches neither storage nor the record. Owned by Task 4.

---

## Plan notes (where the code forced or refined a choice in the brief)

1. **Table name.** The brief says `ALTER TABLE "app"."communities"`. The Drizzle table is `app.community` (`appSchema.table("community", …)`, see `20260608b_classrooms.ts`). The migration alters `"app"."community"`.
2. **`usage` input is `{ slug }`, not `{ communitySlug }`.** The house `communityProcedure` middleware resolves the community and the caller's role from `input.slug`. Reusing it is the existing pattern; only the field name differs.
3. **`storage` in the service deps is lazy** (`ObjectStorageSource = () => ObjectStorage`), matching the existing `VideoStorageSource`. Listing, renaming and access checks never need S3, so a deployment without S3 config only fails the calls that really touch storage.
4. **A lesson may keep a block whose file was deleted.** The brief says every `materialId` must be a row of the same course. Read literally, deleting a file would make every lesson that uses it unsaveable. The rule's intent is "never point at another course's file", so the check refuses malformed ids and ids that exist in another course; an id that no longer exists is allowed and renders "This file was removed." The manifest looks up only the lesson's own course, so a dangling id can never surface a different course's file, even if that id is reused later (Postgres serial ids are not reused anyway).
5. **The grant's size range is the declared size** (not `MAX_FILE_BYTES`), and finish also refuses stored > declared. Without this, a client could declare 1 byte, pass the allowance check and store 200 MB.
6. **`FILE_EMPTY`** is an extra code for a 0-byte file, so the author is not told an empty file is "too big".
7. **Module split.** Lesson-body checks and the manifest loader live in `src/server/classroom/lesson-materials.ts`, and the download rule + manifest builder in `src/lib/classroom/material-access.ts`, instead of growing `hosted-files.ts`. One responsibility per unit: `hosted-files.ts` is the upload lifecycle; `lesson-materials.ts` connects lesson bodies to materials; `material-access.ts` is the single download rule used by both `fileLink` and the manifest.
8. **`src/payload-generated-schema.ts` is not regenerated.** Nothing imports it, it already lacks `video_uploads`, and regenerating would add unrelated hunks. Only `src/payload-types.ts` is regenerated.
9. **Editor toolbar/slash labels stay English** ("Add a file"), like the existing "Embed slides or video" and every built-in toolbar button: `RichTextEditorExtension` labels are module-level constants and the shared editor has no translation seam. Everything inside the file node, the card, the panel and settings is translated. Translating the shared editor chrome is a separate change; mention it in the PR as a known gap on the existing classroom materials ticket.
10. **Cancelled or failed uploads are discarded at once.** When the browser upload is cancelled or fails before finish, the hook deletes the new record (frees the allowance immediately). The daily cleanup still catches anything left behind.
11. **`classroomEditorExtensions` moves** from `embed-node.tsx` to a new `editor-extensions.ts`, which composes both lists; `embed-node.tsx` now exports a single `embedExtension`. Two existing tests change their import path only.
12. **Optional insertion is typed as a union** (`{ command; toolbar? } | { command?: undefined; toolbar?: undefined }`), so an extension with a toolbar button but no command can't be declared.
13. **Course deletion.** The spec says deleting a course deletes its materials. There is no course-delete procedure today (courses are archived), so nothing cascades in this slice.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/server/media/object-storage.ts` (create) | Generic S3 adapter: presigned POST, HEAD, windowed signed GET with download name, public URL, batch delete. `contentDisposition` helper. |
| `src/server/media/object-storage.test.ts` (create) | Adapter tests with mocked presigners. |
| `src/server/media/video-storage.ts` (modify) | Same public API; a facade over `ObjectStorage`. |
| `src/lib/classroom/material-rules.ts` (create) | Allowed types, limits, key builder, names, display helpers, select value lists. Pure. |
| `src/lib/classroom/material-rules.test.ts` (create) | Rules tests incl. spoofed names and path escapes. |
| `src/lib/classroom.ts` (modify) + `src/lib/classroom.test.ts` (modify) | `ClassroomUploadPolicy`, `canUploadMaterials`. |
| `src/server/db/schema.ts` (modify) | `communities.classroomUploadPolicy`. |
| `src/migrations/20260928c_classroom_upload_policy.ts` (create) + `index.ts` (modify) | Adds the column. |
| `src/migrations/classroom-upload-policy.test.ts` (create) | Migration shape test. |
| `src/server/api/routers/communities.ts` (modify) | `updateSettings` accepts `classroomUploadPolicy`. |
| `src/collections/HostedMaterials.ts` (create) + `src/payload.config.ts` (modify) | The record. |
| `src/collections/hosted-materials-schema.test.ts` (create) | Collection + migration shape test. |
| `src/migrations/20260928d_hosted_materials.ts` (create) + `index.ts` (modify) | Table, enums, indexes, admin-lock column. |
| `src/server/classroom/media-allowance.ts` (create) + test | Allowance seam and usage sum. |
| `src/payload-types.ts` (regenerate) | `HostedMaterial` type. |
| `src/lib/classroom/material-access.ts` (create) + test | Download rule, manifest types and builder. Pure. |
| `src/server/classroom/course-access.ts` (modify) + test | `requireEditableCourse`. |
| `src/server/classroom/hosted-files.ts` (create) + test | Upload lifecycle service: start, finish, link, list, update, delete, `mayUploadMaterials`. |
| `src/server/api/routers/classroom-materials.ts` (create) + `src/server/api/root.ts` (modify) | `classroomMaterials` router. |
| `src/server/api/routers/classroom-materials.integration.test.ts` (create) | Router DB tests, S3 mocked. |
| `src/lib/classroom/lesson-body.ts` (modify) + test | `HostedFile` helpers, shared `walkBlocks`, `stripIncompleteMaterials`. |
| `src/collections/Lessons.ts` (modify) | `HostedFile` block. |
| `src/server/classroom/lesson-materials.ts` (create) + test | Body check on save; manifest loader. |
| `src/server/api/routers/classrooms.ts` (modify) | Check bodies; return `materials` + `viewerCanUpload`. |
| `src/server/api/routers/classroom-lesson-materials.integration.test.ts` (create) | Save checks + manifest DB tests. |
| `src/components/classroom/materials/materials-context.tsx` (create) | Manifest context. |
| `src/components/classroom/materials/file-type-icon.tsx` (create) | Icon per extension. |
| `src/components/classroom/materials/start-download.ts` (create) | Navigation seam for downloads. |
| `src/components/classroom/materials/hosted-file-card.tsx` (create) + test | The lesson's file card and PDF preview. |
| `src/components/classroom/materials/block-renderers.tsx` (modify) | `HostedFile` renderer. |
| `src/components/classroom/course-view.tsx` (modify) | Provide the manifest. |
| `src/components/article-editor/rich-text-editor.tsx` (modify) | Optional `command`/`toolbar`. |
| `src/lib/upload-to-grant.ts` (create) + test | Presigned POST with progress/abort (extracted). |
| `src/components/communities/feed/use-video-post.ts` (modify) | Uses the extracted helper. |
| `src/components/classroom/materials/use-file-upload.ts` (create) + test | start → POST → finish hook. |
| `src/components/classroom/materials/lesson-editor-context.tsx` (create) | `courseId`, `canUpload` for editor nodes. |
| `src/components/classroom/materials/hosted-file-node.tsx` (create) + test | Lexical node + its editing UI + its extensions. |
| `src/components/classroom/materials/editor-extensions.ts` (create) | The two extension lists. |
| `src/components/classroom/materials/embed-node.tsx` (modify) + its two tests (modify) | Exports `embedExtension`. |
| `src/components/classroom/lesson-editor.tsx` (modify) + test (create) | Picks the list; provides context; new save error. |
| `src/components/classroom/course-files-panel.tsx` (create) + test | Course files list: rename, free preview, delete. |
| `src/components/classroom/course-editor.tsx` (modify) | Passes `canUpload`; shows the panel. |
| `src/components/communities/settings/classroom-settings.tsx` (modify) + test (create) | Upload policy select + storage bar. |
| `src/server/classroom/material-uploads-cleanup.ts` (create) + test | Daily sweep of abandoned uploads. |
| `src/app/api/cron/video-uploads-cleanup/route.ts` (modify) + test (create) | Runs both sweeps. |
| `messages/en.json`, `messages/nl.json` (modify) | New strings. |

---
### Task 1: Object storage adapter; Reels storage becomes a facade

**Files:**
- Create: `src/server/media/object-storage.ts`
- Test: `src/server/media/object-storage.test.ts`
- Modify: `src/server/media/video-storage.ts` (whole file replaced; public API unchanged)
- Must stay byte-for-byte unchanged: `src/server/media/video-storage.test.ts` and every feed/Reels test.

**Interfaces:**
- Consumes: `PLAYBACK_LINK_SECONDS`, `PLAYBACK_LINK_WINDOW_SECONDS`, `UPLOAD_GRANT_SECONDS`, `VideoStorageClass` from `@/lib/video-rules` (unchanged).
- Produces (`@/server/media/object-storage`):
  ```ts
  export type PresignedUpload = { url: string; fields: Record<string, string> };
  export type StoredObject = { contentType: string | null; bytes: number };
  export type SignedGetOptions = {
    downloadName?: string;
    disposition?: "inline" | "attachment";
    contentType?: string;
  };
  export type ObjectStorage = {
    presignUpload(input: { key: string; contentType: string; maxBytes: number }): Promise<PresignedUpload>;
    inspect(key: string): Promise<StoredObject | null>;
    signedGetUrl(key: string, options?: SignedGetOptions): Promise<string>;
    publicUrl(key: string): string;
    remove(keys: readonly string[]): Promise<void>;
  };
  export type ObjectStorageSource = () => ObjectStorage;
  export function contentDisposition(disposition: "inline" | "attachment", fileName: string): string;
  export function createObjectStorage(input: { client: S3Client; bucket: string; region: string; now?: () => number }): ObjectStorage;
  export function getObjectStorage(): ObjectStorage;
  ```
- `@/server/media/video-storage` keeps exporting `PresignedUpload`, `StoredObject`, `VideoStorage`, `VideoStorageSource`, `createVideoStorage`, `getVideoStorage` with identical signatures, plus a new `videoStorageOver(objects: ObjectStorage): VideoStorage`.

- [ ] **Step 1: Write the failing adapter test**

`src/server/media/object-storage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPresignedPost, getSignedUrl } = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
  getSignedUrl: vi.fn(),
}));
vi.mock("@aws-sdk/s3-presigned-post", () => ({ createPresignedPost }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

import { contentDisposition, createObjectStorage } from "./object-storage";

const KEY =
  "private/classroom/c1/12/1b4e28ba-2fa1-41d2-883f-0016d3cca427.pdf";

function setup(now?: () => number) {
  const send = vi.fn();
  const storage = createObjectStorage({
    client: { send } as never,
    bucket: "ait-media",
    region: "eu-central-1",
    now,
  });
  return { storage, send };
}

/** The GetObject input the last signed link was built from. */
function lastSignedInput(): Record<string, unknown> {
  return (getSignedUrl.mock.lastCall![1] as { input: Record<string, unknown> })
    .input;
}

beforeEach(() => {
  createPresignedPost.mockReset();
  getSignedUrl.mockReset();
  getSignedUrl.mockResolvedValue("https://signed");
});

describe("object storage", () => {
  it("grants one key, one type and a size range, for ten minutes", async () => {
    createPresignedPost.mockResolvedValue({
      url: "https://s3/",
      fields: { key: KEY },
    });
    const { storage } = setup();
    await expect(
      storage.presignUpload({
        key: KEY,
        contentType: "application/pdf",
        maxBytes: 2048,
      }),
    ).resolves.toEqual({ url: "https://s3/", fields: { key: KEY } });
    expect(createPresignedPost).toHaveBeenCalledWith(expect.anything(), {
      Bucket: "ait-media",
      Key: KEY,
      Conditions: [
        ["content-length-range", 1, 2048],
        ["eq", "$Content-Type", "application/pdf"],
      ],
      Fields: { "Content-Type": "application/pdf" },
      Expires: 600,
    });
  });

  it("builds a public address without signing", () => {
    const { storage } = setup();
    expect(storage.publicUrl("media/videos/public/c/u.mp4")).toBe(
      "https://ait-media.s3.eu-central-1.amazonaws.com/media/videos/public/c/u.mp4",
    );
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a plain link at the start of a 30-minute window, valid an hour past it", async () => {
    let now = Date.parse("2026-09-28T10:31:00.000Z");
    const { storage } = setup(() => now);
    await expect(storage.signedGetUrl(KEY)).resolves.toBe("https://signed");
    now = Date.parse("2026-09-28T10:59:59.000Z");
    await storage.signedGetUrl(KEY);
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
    for (const call of getSignedUrl.mock.calls) {
      expect(call[2]).toEqual({
        expiresIn: 5400,
        signingDate: new Date("2026-09-28T10:30:00.000Z"),
      });
    }
    expect(lastSignedInput()).toEqual({ Bucket: "ait-media", Key: KEY });
  });

  it("asks S3 to answer with the download name and the file type", async () => {
    const { storage } = setup();
    await storage.signedGetUrl(KEY, {
      downloadName: "Week 1 — slides.pdf",
      disposition: "attachment",
      contentType: "application/pdf",
    });
    expect(lastSignedInput()).toEqual({
      Bucket: "ait-media",
      Key: KEY,
      ResponseContentDisposition: `attachment; filename="Week 1 _ slides.pdf"; filename*=UTF-8''Week%201%20%E2%80%94%20slides.pdf`,
      ResponseContentType: "application/pdf",
    });
  });

  it("uses attachment when only a name is given, and inline when asked", async () => {
    const { storage } = setup();
    await storage.signedGetUrl(KEY, { downloadName: "a.pdf" });
    expect(lastSignedInput().ResponseContentDisposition).toBe(
      `attachment; filename="a.pdf"; filename*=UTF-8''a.pdf`,
    );
    await storage.signedGetUrl(KEY, {
      downloadName: "a.pdf",
      disposition: "inline",
    });
    expect(lastSignedInput().ResponseContentDisposition).toBe(
      `inline; filename="a.pdf"; filename*=UTF-8''a.pdf`,
    );
  });

  it("inspects an object, and reports a missing one as null", async () => {
    const { storage, send } = setup();
    send.mockResolvedValueOnce({
      ContentType: "application/pdf",
      ContentLength: 42,
    });
    await expect(storage.inspect(KEY)).resolves.toEqual({
      contentType: "application/pdf",
      bytes: 42,
    });
    send.mockRejectedValueOnce(
      Object.assign(new Error("nf"), { name: "NotFound" }),
    );
    await expect(storage.inspect(KEY)).resolves.toBeNull();
    send.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { name: "AccessDenied" }),
    );
    await expect(storage.inspect(KEY)).rejects.toThrow("boom");
  });

  it("removes several objects in one call and skips an empty list", async () => {
    const { storage, send } = setup();
    await storage.remove([]);
    expect(send).not.toHaveBeenCalled();
    send.mockResolvedValue({});
    await storage.remove(["a", "b"]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].input).toEqual({
      Bucket: "ait-media",
      Delete: { Objects: [{ Key: "a" }, { Key: "b" }], Quiet: true },
    });
  });

  it("rejects when S3 reports a partial delete failure", async () => {
    const { storage, send } = setup();
    send.mockResolvedValue({ Errors: [{ Key: "a", Code: "AccessDenied" }] });
    await expect(storage.remove(["a", "b"])).rejects.toThrow(
      /a.*AccessDenied/,
    );
  });
});

describe("contentDisposition", () => {
  it.each([
    [
      "attachment",
      "Handout.pdf",
      `attachment; filename="Handout.pdf"; filename*=UTF-8''Handout.pdf`,
    ],
    [
      "inline",
      "Plan (v2) 'final'.pdf",
      `inline; filename="Plan (v2) 'final'.pdf"; filename*=UTF-8''Plan%20%28v2%29%20%27final%27.pdf`,
    ],
    [
      "attachment",
      'Say "hi".pdf',
      `attachment; filename="Say _hi_.pdf"; filename*=UTF-8''Say%20%22hi%22.pdf`,
    ],
    [
      "attachment",
      "Überblick.pdf",
      `attachment; filename="_berblick.pdf"; filename*=UTF-8''%C3%9Cberblick.pdf`,
    ],
  ] as const)("%s %s", (disposition, name, header) => {
    expect(contentDisposition(disposition, name)).toBe(header);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/server/media/object-storage.test.ts`
Expected: FAIL. `./object-storage` cannot be resolved.

- [ ] **Step 3: Write the adapter**

`src/server/media/object-storage.ts`:

```ts
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type GetObjectCommandInput,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";
import {
  PLAYBACK_LINK_SECONDS,
  PLAYBACK_LINK_WINDOW_SECONDS,
  UPLOAD_GRANT_SECONDS,
} from "@/lib/video-rules";

export type PresignedUpload = { url: string; fields: Record<string, string> };
export type StoredObject = { contentType: string | null; bytes: number };

export type SignedGetOptions = {
  /** The file name the browser saves, sent back as Content-Disposition. */
  downloadName?: string;
  /** "inline" shows the file in the page (PDF preview). Default "attachment". */
  disposition?: "inline" | "attachment";
  /** The Content-Type S3 answers with. */
  contentType?: string;
};

/**
 * The only code that talks to our S3 bucket for app-managed objects: Reels
 * videos (ADR-0036) and classroom files (spec 2026-09-27 §4.1). An adapter
 * over the AWS SDK — callers deal in keys and links, never in SDK types.
 */
export type ObjectStorage = {
  presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignedUpload>;
  inspect(key: string): Promise<StoredObject | null>;
  /**
   * A signed GET link, signed at the start of a PLAYBACK_LINK_WINDOW_SECONDS
   * window so every request inside the window gets the identical URL (a
   * playing video is not reloaded; a PDF preview is not re-fetched). Each
   * link lives at least PLAYBACK_LINK_SECONDS from the moment it is served.
   */
  signedGetUrl(key: string, options?: SignedGetOptions): Promise<string>;
  publicUrl(key: string): string;
  remove(keys: readonly string[]): Promise<void>;
};

/**
 * A lazy way to reach storage. Callers that may never touch a stored object
 * take this instead of an ObjectStorage, so a missing S3 config only fails
 * the requests that actually need it.
 */
export type ObjectStorageSource = () => ObjectStorage;

/**
 * A Content-Disposition header value: an ASCII fallback `filename` for old
 * clients plus the exact name as RFC 5987 `filename*`.
 */
export function contentDisposition(
  disposition: "inline" | "attachment",
  fileName: string,
): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function createObjectStorage({
  client,
  bucket,
  region,
  now = Date.now,
}: {
  client: S3Client;
  bucket: string;
  region: string;
  /** Clock for the signing window; injectable for tests. */
  now?: () => number;
}): ObjectStorage {
  return {
    async presignUpload({ key, contentType, maxBytes }) {
      const { url, fields } = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ["content-length-range", 1, maxBytes],
          ["eq", "$Content-Type", contentType],
        ],
        Fields: { "Content-Type": contentType },
        Expires: UPLOAD_GRANT_SECONDS,
      });
      return { url, fields };
    },
    async inspect(key) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          contentType: head.ContentType ?? null,
          bytes: head.ContentLength ?? 0,
        };
      } catch (error) {
        if ((error as { name?: string }).name === "NotFound") return null;
        throw error;
      }
    },
    async signedGetUrl(key, options) {
      const windowMs = PLAYBACK_LINK_WINDOW_SECONDS * 1000;
      const windowStart = Math.floor(now() / windowMs) * windowMs;
      const input: GetObjectCommandInput = { Bucket: bucket, Key: key };
      const disposition = options?.disposition ?? "attachment";
      if (options?.downloadName) {
        input.ResponseContentDisposition = contentDisposition(
          disposition,
          options.downloadName,
        );
      } else if (options?.disposition) {
        input.ResponseContentDisposition = options.disposition;
      }
      if (options?.contentType) input.ResponseContentType = options.contentType;
      return getSignedUrl(client, new GetObjectCommand(input), {
        signingDate: new Date(windowStart),
        expiresIn: PLAYBACK_LINK_SECONDS + PLAYBACK_LINK_WINDOW_SECONDS,
      });
    },
    publicUrl(key) {
      return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    },
    async remove(keys) {
      if (keys.length === 0) return;
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const errors = result.Errors ?? [];
      if (errors.length > 0) {
        const detail = errors
          .map((e) => `${e.Key ?? "?"} (${e.Code ?? "unknown"})`)
          .join(", ");
        throw new Error(`Failed to delete: ${detail}`);
      }
    },
  };
}

let shared: ObjectStorage | null = null;

/** The app's object storage, built from the same S3 settings as Payload media. */
export function getObjectStorage(): ObjectStorage {
  if (shared) return shared;
  const bucket = env.S3_BUCKET;
  const region = env.S3_REGION ?? "eu-central-1";
  if (!bucket || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 is not configured for object storage");
  }
  shared = createObjectStorage({
    bucket,
    region,
    client: new S3Client({
      region,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    }),
  });
  return shared;
}
```

- [ ] **Step 4: Run the adapter test to verify it passes**

Run: `pnpm vitest run src/server/media/object-storage.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Turn `video-storage.ts` into a facade**

Replace the whole of `src/server/media/video-storage.ts` with:

```ts
import type { S3Client } from "@aws-sdk/client-s3";

import type { VideoStorageClass } from "@/lib/video-rules";
import {
  createObjectStorage,
  getObjectStorage,
  type ObjectStorage,
  type PresignedUpload,
  type StoredObject,
} from "./object-storage";

export type { PresignedUpload, StoredObject };

/**
 * Video storage for community short videos (ADR-0036). A facade over the
 * generic ObjectStorage adapter: it keeps the video vocabulary
 * (`playbackUrl(key, storageClass)`) so feed and Reels code never changes
 * when the storage underneath does.
 */
export type VideoStorage = {
  presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignedUpload>;
  inspect(key: string): Promise<StoredObject | null>;
  playbackUrl(key: string, storage: VideoStorageClass): Promise<string>;
  remove(keys: readonly string[]): Promise<void>;
};

/**
 * A lazy way to reach video storage. Callers that may never touch a video
 * (text-only feeds) take this instead of a VideoStorage, so a missing S3
 * config only fails the requests that actually need it.
 */
export type VideoStorageSource = () => VideoStorage;

/** Video vocabulary over any ObjectStorage. */
export function videoStorageOver(objects: ObjectStorage): VideoStorage {
  return {
    presignUpload: (input) => objects.presignUpload(input),
    inspect: (key) => objects.inspect(key),
    async playbackUrl(key, storage) {
      return storage === "public"
        ? objects.publicUrl(key)
        : objects.signedGetUrl(key);
    },
    remove: (keys) => objects.remove(keys),
  };
}

export function createVideoStorage(input: {
  client: S3Client;
  bucket: string;
  region: string;
  /** Clock for the signing window; injectable for tests. */
  now?: () => number;
}): VideoStorage {
  return videoStorageOver(createObjectStorage(input));
}

let shared: VideoStorage | null = null;

/** The app's video storage, built from the same S3 settings as Payload media. */
export function getVideoStorage(): VideoStorage {
  shared ??= videoStorageOver(getObjectStorage());
  return shared;
}
```

- [ ] **Step 6: Prove the refactor is behaviour-neutral**

Run:
```bash
git diff --stat -- src/server/media/video-storage.test.ts
pnpm vitest run src/server/media src/server/communities src/server/api/routers/feed-reels.test.ts src/server/api/routers/feed-post-writes.test.ts src/server/api/routers/feed-reports.test.ts src/server/api/routers/feed-visibility.test.ts src/components/communities
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
```
Expected: the `git diff --stat` prints nothing (the video storage test is untouched). All tests PASS, including the six existing `video-storage.test.ts` tests. Typecheck and lint are clean.

- [ ] **Step 7: Commit**

```bash
pnpm exec prettier --write src/server/media/object-storage.ts src/server/media/object-storage.test.ts src/server/media/video-storage.ts
git branch --show-current
git add src/server/media/object-storage.ts src/server/media/object-storage.test.ts src/server/media/video-storage.ts
git diff --cached --stat
git commit -m "Media: one generic S3 object storage adapter; video storage becomes a facade over it

Classroom files need the same presigned upload, HEAD check, signed link and
delete as Reels videos, plus a download file name. The S3 code moves into
object-storage.ts (an adapter over the AWS SDK). video-storage.ts keeps its
exact public API as a facade, so feed and Reels code and tests are unchanged."
```

---

### Task 2: Upload rules, the upload policy setting, and its column

**Files:**
- Create: `src/lib/classroom/material-rules.ts`
- Test: `src/lib/classroom/material-rules.test.ts`
- Modify: `src/lib/classroom.ts` (after line 21, the end of `canCreateCourse`)
- Modify: `src/lib/classroom.test.ts` (import list at lines 2–13; append at the end)
- Modify: `src/server/db/schema.ts:3088-3092` (after `classroomCreatePolicy`)
- Create: `src/migrations/20260928c_classroom_upload_policy.ts`
- Modify: `src/migrations/index.ts` (import list after line 120; array end)
- Test: `src/migrations/classroom-upload-policy.test.ts`
- Modify: `src/server/api/routers/communities.ts:842-864` (`updateSettings`)

**Interfaces:**
- Consumes: `isUploadId` from `@/lib/video-rules`; `CommunityRole` from `@/lib/classroom`.
- Produces (`@/lib/classroom/material-rules`):
  ```ts
  export const MAX_FILE_BYTES: number;            // 200 MiB
  export const MATERIAL_UPLOADS_PER_DAY: number;  // 30
  export const MATERIAL_TITLE_MAX: number;        // 200
  export const MATERIAL_FILE_NAME_MAX: number;    // 255
  export const MATERIAL_FILE_TYPES: { readonly pdf: "application/pdf"; /* …14 entries */ };
  export type MaterialExtension = keyof typeof MATERIAL_FILE_TYPES;
  export const MATERIAL_ACCEPT: string;           // ".pdf,.ppt,…" for <input accept>
  export const MATERIAL_KINDS: readonly ["file"];
  export type MaterialKind = "file";
  export const MATERIAL_STATUSES: readonly ["uploading", "ready", "failed"];
  export type MaterialStatus = "uploading" | "ready" | "failed";
  export const MATERIAL_VISIBILITIES: readonly ["members", "preview"];
  export type MaterialVisibility = "members" | "preview";
  export const MATERIAL_KIND_LABELS: Record<MaterialKind, string>;
  export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string>;
  export const MATERIAL_VISIBILITY_LABELS: Record<MaterialVisibility, string>;
  export function isMaterialExtension(value: string): value is MaterialExtension;
  export function fileExtensionOf(fileName: string): MaterialExtension | null;
  export function contentTypeFor(extension: MaterialExtension): string;
  export function isInlinePreviewable(extension: string): boolean;
  export function fileTypeLabel(extension: string): string;
  export function titleFromFileName(fileName: string): string;
  export function materialObjectKey(input: { communityId: string; courseId: number; uploadId: string; ext: string }): string;
  export function downloadFileName(title: string, ext: string): string;
  export function formatBytes(bytes: number): string;
  ```
- Produces (`@/lib/classroom`): `export type ClassroomUploadPolicy = "all_members" | "admins_only"; export function canUploadMaterials(policy: ClassroomUploadPolicy, role: CommunityRole | null): boolean;`
- Produces (DB): `communities.classroomUploadPolicy` (`"all_members" | "admins_only"`, default `"admins_only"`); `communities.updateSettings` input gains `classroomUploadPolicy?: "all_members" | "admins_only"`. `communities.getBySlug` returns it automatically (it spreads the row).

- [ ] **Step 1: Write the failing rules test**

`src/lib/classroom/material-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  MATERIAL_ACCEPT,
  MATERIAL_FILE_TYPES,
  MAX_FILE_BYTES,
  contentTypeFor,
  downloadFileName,
  fileExtensionOf,
  fileTypeLabel,
  formatBytes,
  isInlinePreviewable,
  materialObjectKey,
  titleFromFileName,
} from "./material-rules";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

describe("fileExtensionOf", () => {
  it.each([
    ["Slides.PDF", "pdf"],
    ["deck.pptx", "pptx"],
    ["Book.XLSX", "xlsx"],
    ["talk.key", "key"],
    ["photo.JPEG", "jpeg"],
    ["  notes.docx  ", "docx"],
  ])("accepts %s as %s", (name, ext) => {
    expect(fileExtensionOf(name)).toBe(ext);
  });

  it.each([
    "notes.pdf.exe",
    "archive.tar.gz",
    "page.html",
    "vector.svg",
    ".pdf",
    "trailing.",
    "no-extension",
    "",
    "file.constructor",
  ])("refuses %p", (name) => {
    expect(fileExtensionOf(name)).toBeNull();
  });
});

describe("types and labels", () => {
  it("derives the stored type from the extension only", () => {
    expect(contentTypeFor("pdf")).toBe("application/pdf");
    expect(contentTypeFor("jpg")).toBe("image/jpeg");
    expect(contentTypeFor("key")).toBe("application/vnd.apple.keynote");
    expect(Object.keys(MATERIAL_FILE_TYPES)).toHaveLength(14);
  });

  it("lists every extension for the file picker", () => {
    expect(MATERIAL_ACCEPT).toBe(
      ".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.key,.zip,.png,.jpg,.jpeg,.webp",
    );
  });

  it("previews only PDFs inline", () => {
    expect(isInlinePreviewable("pdf")).toBe(true);
    expect(isInlinePreviewable("png")).toBe(false);
    expect(isInlinePreviewable("zip")).toBe(false);
  });

  it("labels a type in capitals", () => {
    expect(fileTypeLabel("pptx")).toBe("PPTX");
  });

  it("caps a file at 200 MB", () => {
    expect(MAX_FILE_BYTES).toBe(209_715_200);
  });
});

describe("titleFromFileName", () => {
  it("drops the extension and tidies spaces", () => {
    expect(titleFromFileName("Week 1 slides.pdf")).toBe("Week 1 slides");
    expect(titleFromFileName("  My   deck .pptx ")).toBe("My deck");
  });

  it("keeps at most 200 characters", () => {
    expect(titleFromFileName(`${"a".repeat(250)}.pdf`)).toHaveLength(200);
  });
});

describe("materialObjectKey", () => {
  const good = { communityId: "c-1", courseId: 12, uploadId: UPLOAD, ext: "pdf" };

  it("puts the file under the private classroom prefix", () => {
    expect(materialObjectKey(good)).toBe(
      `private/classroom/c-1/12/${UPLOAD}.pdf`,
    );
  });

  it.each([
    [{ communityId: "../x" }, "invalid community id"],
    [{ communityId: "c/1" }, "invalid community id"],
    [{ communityId: "" }, "invalid community id"],
    [{ courseId: 0 }, "invalid course id"],
    [{ courseId: 1.5 }, "invalid course id"],
    [{ courseId: -3 }, "invalid course id"],
    [{ uploadId: "../../etc/passwd" }, "invalid upload id"],
    [{ uploadId: "not-a-uuid" }, "invalid upload id"],
    [{ ext: "exe" }, "invalid extension"],
    [{ ext: "pdf/../x" }, "invalid extension"],
  ])("refuses an escape attempt %o", (over, message) => {
    expect(() => materialObjectKey({ ...good, ...over })).toThrow(message);
  });
});

describe("downloadFileName", () => {
  it.each([
    ["Week 1 slides", "pdf", "Week 1 slides.pdf"],
    ["Report.PDF", "pdf", "Report.pdf"],
    ["../../etc/passwd", "pdf", ".. .. etc passwd.pdf"],
    ["   ", "zip", "file.zip"],
    ["a\u0007b", "csv", "a b.csv"],
  ])("%p + %s → %s", (title, ext, name) => {
    expect(downloadFileName(title, ext)).toBe(name);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [10 * 1024, "10 KB"],
    [200 * 1024 * 1024, "200 MB"],
    [1_288_490_189, "1.2 GB"],
    [5 * 1024 ** 3, "5 GB"],
  ])("%d → %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/classroom/material-rules.test.ts`
Expected: FAIL. `./material-rules` cannot be resolved.

- [ ] **Step 3: Write the rules**

`src/lib/classroom/material-rules.ts`:

```ts
import { isUploadId } from "@/lib/video-rules";

/**
 * Limits, types and names for files uploaded into classroom lessons (spec
 * 2026-09-27 §4, §7). Pure, so the browser (before uploading) and the server
 * (before trusting an upload) use the same rules and can never disagree.
 */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MATERIAL_UPLOADS_PER_DAY = 30;
export const MATERIAL_TITLE_MAX = 200;
export const MATERIAL_FILE_NAME_MAX = 255;

/**
 * Allowed file types: extension → the Content-Type we store and serve. The
 * server derives the type from the extension; the browser never chooses it,
 * and the upload grant only accepts exactly this type.
 */
export const MATERIAL_FILE_TYPES = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  key: "application/vnd.apple.keynote",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

export type MaterialExtension = keyof typeof MATERIAL_FILE_TYPES;

/** For `<input type="file" accept>`. */
export const MATERIAL_ACCEPT = Object.keys(MATERIAL_FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export const MATERIAL_KINDS = ["file"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export const MATERIAL_STATUSES = ["uploading", "ready", "failed"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];
export const MATERIAL_VISIBILITIES = ["members", "preview"] as const;
export type MaterialVisibility = (typeof MATERIAL_VISIBILITIES)[number];

/** Names for the admin panel (members see translated copy instead). */
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  file: "File",
};
export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  uploading: "Uploading",
  ready: "Ready",
  failed: "Failed",
};
export const MATERIAL_VISIBILITY_LABELS: Record<MaterialVisibility, string> = {
  members: "Members only",
  preview: "Free preview",
};

export function isMaterialExtension(value: string): value is MaterialExtension {
  return Object.prototype.hasOwnProperty.call(MATERIAL_FILE_TYPES, value);
}

/**
 * The allowed extension of a file name (after the last dot, any case), or
 * null. `notes.pdf.exe` is "exe", so it is refused; a dot-file such as
 * `.pdf` has no name and is refused too.
 */
export function fileExtensionOf(fileName: string): MaterialExtension | null {
  const name = fileName.trim();
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return isMaterialExtension(ext) ? ext : null;
}

export function contentTypeFor(extension: MaterialExtension): string {
  return MATERIAL_FILE_TYPES[extension];
}

/** Only PDFs are shown inside the lesson; everything else is a download. */
export function isInlinePreviewable(extension: string): boolean {
  return extension === "pdf";
}

/** "PDF", "PPTX" — the short type label on file cards. */
export function fileTypeLabel(extension: string): string {
  return extension.toUpperCase();
}

/** A file's default title: its name without the extension, tidied. */
export function titleFromFileName(fileName: string): string {
  const name = fileName.trim();
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/\s+/g, " ").trim();
  return (base || "File").slice(0, MATERIAL_TITLE_MAX);
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** The S3 key for one uploaded file. Throws on ids that could escape their folder. */
export function materialObjectKey(input: {
  communityId: string;
  courseId: number;
  uploadId: string;
  ext: string;
}): string {
  if (!isUploadId(input.uploadId)) throw new Error("invalid upload id");
  if (!SAFE_SEGMENT.test(input.communityId)) {
    throw new Error("invalid community id");
  }
  if (!Number.isSafeInteger(input.courseId) || input.courseId <= 0) {
    throw new Error("invalid course id");
  }
  if (!isMaterialExtension(input.ext)) throw new Error("invalid extension");
  return `private/classroom/${input.communityId}/${input.courseId}/${input.uploadId}.${input.ext}`;
}

/**
 * The name a downloaded file is saved under: the title (without control
 * characters or path separators) plus the stored extension, never doubled.
 */
export function downloadFileName(title: string, ext: string): string {
  const cleaned = Array.from(title, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 || ch === "/" || ch === "\\" ? " " : ch;
  }).join("");
  const base = cleaned.replace(/\s+/g, " ").trim().slice(0, MATERIAL_TITLE_MAX).trim();
  const suffix = `.${ext}`;
  const stem = base.toLowerCase().endsWith(suffix.toLowerCase())
    ? base.slice(0, -suffix.length).trim()
    : base;
  return `${stem || "file"}${suffix}`;
}

const UNITS = ["KB", "MB", "GB", "TB"] as const;

/** "512 B", "1.5 KB", "200 MB", "1.2 GB" (1024-based, one decimal under 10). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${Math.max(0, Math.round(bytes || 0))} B`;
  }
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${UNITS[unit] ?? "TB"}`;
}
```

- [ ] **Step 4: Run the rules test to verify it passes**

Run: `pnpm vitest run src/lib/classroom/material-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing policy test**

In `src/lib/classroom.test.ts`, in the import list at the top, directly after the line `  canCreateCourse,` add:

```ts
  canUploadMaterials,
```

Append to the end of `src/lib/classroom.test.ts`:

```ts

describe("canUploadMaterials", () => {
  it("under admins_only lets owners and admins upload, not moderators or members", () => {
    expect(canUploadMaterials("admins_only", "owner")).toBe(true);
    expect(canUploadMaterials("admins_only", "admin")).toBe(true);
    expect(canUploadMaterials("admins_only", "moderator")).toBe(false);
    expect(canUploadMaterials("admins_only", "member")).toBe(false);
  });
  it("under all_members lets any active member upload", () => {
    for (const role of ["owner", "admin", "moderator", "member"] as const) {
      expect(canUploadMaterials("all_members", role)).toBe(true);
    }
  });
  it("never lets a non-member upload", () => {
    expect(canUploadMaterials("all_members", null)).toBe(false);
    expect(canUploadMaterials("admins_only", null)).toBe(false);
  });
});
```

Run: `pnpm vitest run src/lib/classroom.test.ts`
Expected: FAIL. `canUploadMaterials` is not exported.

- [ ] **Step 6: Add the policy**

In `src/lib/classroom.ts`, replace lines 1–21 (the two type lines through the end of `canCreateCourse`) with:

```ts
export type ClassroomCreatePolicy = "all_members" | "admins_only";
/** Who may upload hosted lesson files (spec 2026-09-27 §2.3). */
export type ClassroomUploadPolicy = "all_members" | "admins_only";
export type CommunityRole = "owner" | "admin" | "moderator" | "member";

/** Completed lessons / total, rounded, clamped 0..100. */
export function courseProgressPercent(
  completed: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/**
 * The shared shape of the classroom community policies: `admins_only` means
 * owner or admin (moderators excluded); `all_members` means any active
 * member. null = not an active member.
 */
function allowedUnderPolicy(
  policy: "all_members" | "admins_only",
  role: CommunityRole | null,
): boolean {
  if (role === null) return false;
  if (policy === "admins_only") return role === "owner" || role === "admin";
  return true;
}

/** May this role create a course under the community's policy? null = not a member. */
export function canCreateCourse(
  policy: ClassroomCreatePolicy,
  role: CommunityRole | null,
): boolean {
  return allowedUnderPolicy(policy, role);
}

/** May this role upload hosted lesson files under the community's policy? */
export function canUploadMaterials(
  policy: ClassroomUploadPolicy,
  role: CommunityRole | null,
): boolean {
  return allowedUnderPolicy(policy, role);
}
```

Run: `pnpm vitest run src/lib/classroom.test.ts`
Expected: PASS (the existing `canCreateCourse` tests too).

- [ ] **Step 7: Add the column to the Drizzle schema**

In `src/server/db/schema.ts`, inside `communities`, directly after the `classroomCreatePolicy: d … .$type<"all_members" | "admins_only">(),` block (lines 3088–3092), add:

```ts
    classroomUploadPolicy: d
      .varchar({ length: 30 })
      .notNull()
      .default("admins_only")
      .$type<"all_members" | "admins_only">(),
```

- [ ] **Step 8: Write the failing migration shape test**

Check the migration name is still free (Global Constraints). Then create `src/migrations/classroom-upload-policy.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("classroom upload policy migration", () => {
  it("adds the column with the owners-and-admins default, idempotently", () => {
    const sql = readFileSync(
      join(process.cwd(), "src/migrations/20260928c_classroom_upload_policy.ts"),
      "utf8",
    );
    for (const needle of [
      'ALTER TABLE "app"."community"',
      `ADD COLUMN IF NOT EXISTS "classroom_upload_policy" varchar(30) DEFAULT 'admins_only' NOT NULL`,
      'DROP COLUMN IF EXISTS "classroom_upload_policy"',
    ]) {
      expect(sql).toContain(needle);
    }
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20260928c_classroom_upload_policy"');
  });
});
```

Run: `pnpm vitest run src/migrations/classroom-upload-policy.test.ts`
Expected: FAIL (ENOENT on the migration file).

- [ ] **Step 9: Write the migration and register it**

`src/migrations/20260928c_classroom_upload_policy.ts`:

```ts
// Adds app.community.classroom_upload_policy: who may upload hosted lesson
// files (spec 2026-09-27 §2.3). varchar(30) NOT NULL DEFAULT 'admins_only',
// so every existing community starts with owners and admins only. Mirrors
// the Drizzle column communities.classroomUploadPolicy. The Drizzle table is
// app.community (singular). Idempotent (ADD/DROP COLUMN IF EXISTS).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community"
      ADD COLUMN IF NOT EXISTS "classroom_upload_policy" varchar(30) DEFAULT 'admins_only' NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community"
      DROP COLUMN IF EXISTS "classroom_upload_policy";
  `);
}
```

In `src/migrations/index.ts`, after the import line for `20260928b_lesson_youtube_to_embed` (line 120) add:

```ts
import * as migration_20260928c_classroom_upload_policy from "./20260928c_classroom_upload_policy";
```

and after the last array entry (the `20260928b_lesson_youtube_to_embed` object, just before the closing `];`) add:

```ts
  {
    up: migration_20260928c_classroom_upload_policy.up,
    down: migration_20260928c_classroom_upload_policy.down,
    name: "20260928c_classroom_upload_policy",
  },
```

Run: `pnpm vitest run src/migrations/classroom-upload-policy.test.ts`
Expected: PASS.

- [ ] **Step 10: Let owners and admins change the setting**

In `src/server/api/routers/communities.ts`, inside `updateSettings`' input `z.object({ … })`, directly after:

```ts
        classroomCreatePolicy: z
          .enum(["all_members", "admins_only"])
          .optional(),
```

add:

```ts
        classroomUploadPolicy: z
          .enum(["all_members", "admins_only"])
          .optional(),
```

and in the mutation body, directly after:

```ts
      if (input.classroomCreatePolicy !== undefined)
        updates.classroomCreatePolicy = input.classroomCreatePolicy;
```

add:

```ts
      if (input.classroomUploadPolicy !== undefined)
        updates.classroomUploadPolicy = input.classroomUploadPolicy;
```

(The DB round trip of this setting is tested in Task 4's integration suite.)

- [ ] **Step 11: Apply the migration to the isolated test DB**

Create `scripts/tmp-apply-test-migration.ts` (never commit it):

```ts
// One-off: apply one migration's up() to the isolated test DB. Delete after use.
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("127.0.0.1:55432/aitcom_test")) {
  throw new Error(
    "Refusing to run: DATABASE_URL is not the isolated test DB (127.0.0.1:55432/aitcom_test)",
  );
}
const name = process.argv[2] ?? "";
if (!/^\d{8}[a-z]_[a-z0-9_]+$/.test(name)) {
  throw new Error("Pass a migration name, e.g. 20260928c_classroom_upload_policy");
}

neonConfig.webSocketConstructor = ws;
neonConfig.wsProxy = () => "127.0.0.1:5433/v1";
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineTLS = false;
neonConfig.pipelineConnect = false;

const migration = (await import(`../src/migrations/${name}.ts`)) as {
  up: (args: { db: unknown }) => Promise<void>;
};
const pool = new Pool({ connectionString: url });
try {
  await migration.up({ db: drizzle(pool) });
  console.log(`applied ${name} to the test DB`);
} finally {
  await pool.end();
}
```

Run:
```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm exec tsx scripts/tmp-apply-test-migration.ts 20260928c_classroom_upload_policy
rm scripts/tmp-apply-test-migration.ts
git status --short scripts/
```
Expected: prints `applied 20260928c_classroom_upload_policy to the test DB`; `git status --short scripts/` prints nothing.

- [ ] **Step 12: Verify and commit**

Run:
```bash
pnpm vitest run src/lib/classroom.test.ts src/lib/classroom/material-rules.test.ts src/migrations/classroom-upload-policy.test.ts
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
bash /Users/greg/coding-projects/aitcom/.claude/worktrees/classroom-hosted-files/dbtest.sh src/server/api/routers/classroom-access.integration.test.ts src/server/api/routers/communities.integration.test.ts
```
Expected: all PASS; the DB suites executed (not skipped). They read whole `community` rows, so they prove the new column exists in the test DB.

```bash
pnpm exec prettier --write src/lib/classroom/material-rules.ts src/lib/classroom/material-rules.test.ts src/lib/classroom.ts src/lib/classroom.test.ts src/server/db/schema.ts src/migrations/20260928c_classroom_upload_policy.ts src/migrations/index.ts src/migrations/classroom-upload-policy.test.ts src/server/api/routers/communities.ts
git branch --show-current
git add src/lib/classroom/material-rules.ts src/lib/classroom/material-rules.test.ts src/lib/classroom.ts src/lib/classroom.test.ts src/server/db/schema.ts src/migrations/20260928c_classroom_upload_policy.ts src/migrations/index.ts src/migrations/classroom-upload-policy.test.ts src/server/api/routers/communities.ts
git diff --cached --stat
git commit -m "Classroom files: upload rules and a per-community upload policy

material-rules.ts holds the allowed file types (the stored type comes from
the extension, never the browser), the 200 MB and 30-a-day limits, the
private S3 key builder and display helpers. communities gain
classroom_upload_policy (default owners and admins), editable through
updateSettings."
```

---
### Task 3: Hosted materials collection, its table, and the media allowance

**Files:**
- Create: `src/collections/HostedMaterials.ts`
- Modify: `src/payload.config.ts` (import after line 43 `Modules`; `collections` array after `Modules,`)
- Test: `src/collections/hosted-materials-schema.test.ts`
- Create: `src/migrations/20260928d_hosted_materials.ts`
- Modify: `src/migrations/index.ts`
- Regenerate: `src/payload-types.ts`
- Create: `src/server/classroom/media-allowance.ts`
- Test: `src/server/classroom/media-allowance.test.ts`

**Interfaces:**
- Consumes: `MATERIAL_*` lists and labels, `MATERIAL_TITLE_MAX`, `MATERIAL_FILE_NAME_MAX` from `@/lib/classroom/material-rules` (Task 2).
- Produces:
  - Payload collection slug `hosted-materials`; generated type `HostedMaterial` in `@/payload-types`:
    ```ts
    interface HostedMaterial {
      id: number; communityId: string; course: number; uploaderId: string;
      kind: 'file'; status: 'uploading' | 'ready' | 'failed'; failureReason?: string | null;
      title: string; visibility: 'members' | 'preview'; fileName: string; extension: string;
      contentType: string; bytes: number; storageKey: string; uploadId: string;
      updatedAt: string; createdAt: string;
    }
    ```
  - `@/server/classroom/media-allowance`:
    ```ts
    export type MediaAllowance = { fileBytesStored: number };
    export type MediaUsage = { fileBytesStored: number };
    export const DEFAULT_MEDIA_ALLOWANCE: MediaAllowance;              // 5 GiB
    export const STORAGE_COUNTED_STATUSES: readonly ["uploading", "ready"];
    export function allowanceFor(communityId: string): Promise<MediaAllowance>;
    export function usageFor(payload: Payload, communityId: string): Promise<MediaUsage>;
    export function exceedsAllowance(usage: MediaUsage, allowance: MediaAllowance, extraBytes: number): boolean;
    ```

- [ ] **Step 1: Write the failing collection and migration test**

Check the migration name `20260928d_hosted_materials` is still free (Global Constraints). Then create `src/collections/hosted-materials-schema.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MATERIAL_STATUSES,
  MATERIAL_VISIBILITIES,
} from "@/lib/classroom/material-rules";

import { HostedMaterials } from "./HostedMaterials";

type Field = {
  name?: string;
  required?: boolean;
  unique?: boolean;
  index?: boolean;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
};
const fields = HostedMaterials.fields as Field[];
const field = (name: string) => fields.find((f) => f.name === name)!;

describe("hosted-materials collection", () => {
  it("defines the slice-2 fields, in order", () => {
    expect(HostedMaterials.slug).toBe("hosted-materials");
    expect(fields.map((f) => f.name)).toEqual([
      "communityId",
      "course",
      "uploaderId",
      "kind",
      "status",
      "failureReason",
      "title",
      "visibility",
      "fileName",
      "extension",
      "contentType",
      "bytes",
      "storageKey",
      "uploadId",
    ]);
  });

  it("starts a file as uploading and members-only, from the shared value lists", () => {
    expect(field("status").defaultValue).toBe("uploading");
    expect(field("visibility").defaultValue).toBe("members");
    expect(field("status").options!.map((o) => o.value)).toEqual([
      ...MATERIAL_STATUSES,
    ]);
    expect(field("visibility").options).toEqual([
      { label: "Members only", value: "members" },
      { label: "Free preview", value: "preview" },
    ]);
    expect(field("visibility").options!.map((o) => o.value)).toEqual([
      ...MATERIAL_VISIBILITIES,
    ]);
  });

  it("keeps storage keys and upload ids unique, and indexes the lookups", () => {
    expect(field("storageKey").unique).toBe(true);
    expect(field("uploadId").unique).toBe(true);
    for (const name of ["communityId", "course", "uploaderId", "status"]) {
      expect(field(name).index).toBe(true);
    }
  });

  it("ships a migration with the table, enums, indexes and admin-lock column", () => {
    const sql = readFileSync(
      join(process.cwd(), "src/migrations/20260928d_hosted_materials.ts"),
      "utf8",
    );
    for (const needle of [
      `CREATE TYPE "public"."enum_hosted_materials_kind" AS ENUM('file')`,
      `CREATE TYPE "public"."enum_hosted_materials_status" AS ENUM('uploading', 'ready', 'failed')`,
      `CREATE TYPE "public"."enum_hosted_materials_visibility" AS ENUM('members', 'preview')`,
      'CREATE TABLE IF NOT EXISTS "hosted_materials"',
      '"course" numeric NOT NULL',
      '"bytes" numeric NOT NULL',
      'CREATE INDEX IF NOT EXISTS "hosted_materials_status_idx"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "hosted_materials_storage_key_idx"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "hosted_materials_upload_id_idx"',
      '"hosted_materials_id" integer REFERENCES "hosted_materials"("id") ON DELETE cascade',
      'DROP TABLE IF EXISTS "hosted_materials"',
    ]) {
      expect(sql).toContain(needle);
    }
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20260928d_hosted_materials"');
  });
});
```

Run: `pnpm vitest run src/collections/hosted-materials-schema.test.ts`
Expected: FAIL. `./HostedMaterials` cannot be resolved.

- [ ] **Step 2: Write the collection and register it**

`src/collections/HostedMaterials.ts`:

```ts
import type { CollectionConfig } from "payload";

import {
  MATERIAL_FILE_NAME_MAX,
  MATERIAL_KINDS,
  MATERIAL_KIND_LABELS,
  MATERIAL_STATUSES,
  MATERIAL_STATUS_LABELS,
  MATERIAL_TITLE_MAX,
  MATERIAL_VISIBILITIES,
  MATERIAL_VISIBILITY_LABELS,
} from "@/lib/classroom/material-rules";

/**
 * Uploaded lesson material (spec 2026-09-27 §2.1). A record belongs to one
 * course and can be used in any of its lessons; lesson bodies hold only its
 * id. Slice 2 stores files only; slice 3 adds video fields in its own
 * migration. No access overrides: like Courses and Lessons, only Payload
 * admins reach it over Payload's own API; members go through tRPC.
 */
export const HostedMaterials: CollectionConfig = {
  slug: "hosted-materials",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "course", "status", "visibility", "bytes", "createdAt"],
    description:
      "Files uploaded into classroom courses. Unfinished uploads are cleaned up daily.",
  },
  fields: [
    { name: "communityId", type: "text", required: true, index: true },
    {
      name: "course",
      type: "number",
      required: true,
      index: true,
      admin: { description: "courses.id" },
    },
    {
      name: "uploaderId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Better Auth user ID." },
    },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "file",
      options: MATERIAL_KINDS.map((value) => ({
        label: MATERIAL_KIND_LABELS[value],
        value,
      })),
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "uploading",
      index: true,
      options: MATERIAL_STATUSES.map((value) => ({
        label: MATERIAL_STATUS_LABELS[value],
        value,
      })),
    },
    { name: "failureReason", type: "text" },
    { name: "title", type: "text", required: true, maxLength: MATERIAL_TITLE_MAX },
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "members",
      options: MATERIAL_VISIBILITIES.map((value) => ({
        label: MATERIAL_VISIBILITY_LABELS[value],
        value,
      })),
    },
    {
      name: "fileName",
      type: "text",
      required: true,
      maxLength: MATERIAL_FILE_NAME_MAX,
    },
    { name: "extension", type: "text", required: true },
    { name: "contentType", type: "text", required: true },
    {
      name: "bytes",
      type: "number",
      required: true,
      min: 0,
      admin: {
        description: "Declared at start, replaced by the stored size at finish.",
      },
    },
    { name: "storageKey", type: "text", required: true, unique: true },
    {
      name: "uploadId",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
  ],
  timestamps: true,
};
```

In `src/payload.config.ts` add after `import { Modules } from "./collections/Modules";`:

```ts
import { HostedMaterials } from "./collections/HostedMaterials";
```

and in `collections: [ … ]` directly after `    Modules,` add:

```ts
    HostedMaterials,
```

- [ ] **Step 3: Write the migration and register it**

`src/migrations/20260928d_hosted_materials.ts`:

```ts
// Classroom hosted files (spec 2026-09-27 §2.1, slice 2): the
// hosted_materials table for the `hosted-materials` Payload collection, its
// select enums, the indexes Payload expects, and the admin-lock column on
// payload_locked_documents_rels (every Payload update/delete by id reads one
// <collection>_id column per collection; without it they all fail — see
// 20260927a). Slice 3 adds 'video' / 'processing' and the Mux columns in its
// own migration. Idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_hosted_materials_kind" AS ENUM('file');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_hosted_materials_status" AS ENUM('uploading', 'ready', 'failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_hosted_materials_visibility" AS ENUM('members', 'preview');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "hosted_materials" (
      "id" serial PRIMARY KEY,
      "community_id" varchar NOT NULL,
      "course" numeric NOT NULL,
      "uploader_id" varchar NOT NULL,
      "kind" "enum_hosted_materials_kind" DEFAULT 'file' NOT NULL,
      "status" "enum_hosted_materials_status" DEFAULT 'uploading' NOT NULL,
      "failure_reason" varchar,
      "title" varchar NOT NULL,
      "visibility" "enum_hosted_materials_visibility" DEFAULT 'members' NOT NULL,
      "file_name" varchar NOT NULL,
      "extension" varchar NOT NULL,
      "content_type" varchar NOT NULL,
      "bytes" numeric NOT NULL,
      "storage_key" varchar NOT NULL,
      "upload_id" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "hosted_materials_community_id_idx" ON "hosted_materials"("community_id");
    CREATE INDEX IF NOT EXISTS "hosted_materials_course_idx" ON "hosted_materials"("course");
    CREATE INDEX IF NOT EXISTS "hosted_materials_uploader_id_idx" ON "hosted_materials"("uploader_id");
    CREATE INDEX IF NOT EXISTS "hosted_materials_status_idx" ON "hosted_materials"("status");
    CREATE UNIQUE INDEX IF NOT EXISTS "hosted_materials_storage_key_idx" ON "hosted_materials"("storage_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "hosted_materials_upload_id_idx" ON "hosted_materials"("upload_id");
    CREATE INDEX IF NOT EXISTS "hosted_materials_updated_at_idx" ON "hosted_materials"("updated_at");
    CREATE INDEX IF NOT EXISTS "hosted_materials_created_at_idx" ON "hosted_materials"("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "hosted_materials_id" integer REFERENCES "hosted_materials"("id") ON DELETE cascade;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_hosted_materials_id_idx"
      ON "payload_locked_documents_rels"("hosted_materials_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "hosted_materials_id";
    DROP TABLE IF EXISTS "hosted_materials";
    DROP TYPE IF EXISTS "public"."enum_hosted_materials_kind";
    DROP TYPE IF EXISTS "public"."enum_hosted_materials_status";
    DROP TYPE IF EXISTS "public"."enum_hosted_materials_visibility";
  `);
}
```

In `src/migrations/index.ts`, after the `20260928c_classroom_upload_policy` import line add:

```ts
import * as migration_20260928d_hosted_materials from "./20260928d_hosted_materials";
```

and after the `20260928c_classroom_upload_policy` array entry add:

```ts
  {
    up: migration_20260928d_hosted_materials.up,
    down: migration_20260928d_hosted_materials.down,
    name: "20260928d_hosted_materials",
  },
```

Run: `pnpm vitest run src/collections/hosted-materials-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Apply the migration to the isolated test DB**

Create `scripts/tmp-apply-test-migration.ts` (never commit it):

```ts
// One-off: apply one migration's up() to the isolated test DB. Delete after use.
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("127.0.0.1:55432/aitcom_test")) {
  throw new Error(
    "Refusing to run: DATABASE_URL is not the isolated test DB (127.0.0.1:55432/aitcom_test)",
  );
}
const name = process.argv[2] ?? "";
if (!/^\d{8}[a-z]_[a-z0-9_]+$/.test(name)) {
  throw new Error("Pass a migration name, e.g. 20260928d_hosted_materials");
}

neonConfig.webSocketConstructor = ws;
neonConfig.wsProxy = () => "127.0.0.1:5433/v1";
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineTLS = false;
neonConfig.pipelineConnect = false;

const migration = (await import(`../src/migrations/${name}.ts`)) as {
  up: (args: { db: unknown }) => Promise<void>;
};
const pool = new Pool({ connectionString: url });
try {
  await migration.up({ db: drizzle(pool) });
  console.log(`applied ${name} to the test DB`);
} finally {
  await pool.end();
}
```

Run:
```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm exec tsx scripts/tmp-apply-test-migration.ts 20260928d_hosted_materials
rm scripts/tmp-apply-test-migration.ts
git status --short scripts/
```
Expected: prints `applied 20260928d_hosted_materials to the test DB`; `git status --short scripts/` prints nothing.

- [ ] **Step 5: Regenerate the Payload types**

Run:
```bash
set +eu; set -a; . /Users/greg/coding-projects/aitcom/.env.docker >/dev/null 2>&1; set +a; unset PAYLOAD_PUSH; SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test npx payload generate:types
git diff --stat -- src/payload-types.ts src/payload-generated-schema.ts
git diff -- src/payload-types.ts | grep '^[-+]' | grep -v '^[-+][-+]' | grep -iv 'hosted' | head -20
```
Expected: `src/payload-types.ts` gains the `HostedMaterial` interface, `'hosted-materials'` entries in the collection and select maps, and a `'hosted-materials'` relation in the locked-documents type. `src/payload-generated-schema.ts` is unchanged (do not run `generate:db-schema`). The last command prints only lines that belong to those additions (braces, `relationTo`, `value: number | HostedMaterial`, field lines of the new interface/select type). If it shows an unrelated change, restore that hunk by hand so the diff only carries this slice.

- [ ] **Step 6: Write the failing allowance test**

`src/server/classroom/media-allowance.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MEDIA_ALLOWANCE,
  allowanceFor,
  exceedsAllowance,
  usageFor,
} from "./media-allowance";

describe("media allowance", () => {
  it("gives every community 5 GB of file storage today", async () => {
    expect(DEFAULT_MEDIA_ALLOWANCE).toEqual({ fileBytesStored: 5 * 1024 ** 3 });
    await expect(allowanceFor("c1")).resolves.toEqual({
      fileBytesStored: 5_368_709_120,
    });
  });

  it("sums the bytes of one community's uploading and ready files", async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [{ bytes: 1000 }, { bytes: 500 }],
    });
    await expect(usageFor({ find } as never, "c1")).resolves.toEqual({
      fileBytesStored: 1500,
    });
    expect(find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { communityId: { equals: "c1" } },
          { status: { in: ["uploading", "ready"] } },
        ],
      },
      pagination: false,
      depth: 0,
    });
  });

  it("reports no usage for a community without files", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    await expect(usageFor({ find } as never, "c1")).resolves.toEqual({
      fileBytesStored: 0,
    });
  });

  it("refuses only what would go past the allowance", () => {
    const allowance = { fileBytesStored: 1000 };
    expect(exceedsAllowance({ fileBytesStored: 900 }, allowance, 100)).toBe(false);
    expect(exceedsAllowance({ fileBytesStored: 900 }, allowance, 101)).toBe(true);
    expect(exceedsAllowance({ fileBytesStored: 1200 }, allowance, 0)).toBe(true);
  });
});
```

Run: `pnpm vitest run src/server/classroom/media-allowance.test.ts`
Expected: FAIL. `./media-allowance` cannot be resolved.

- [ ] **Step 7: Write the allowance module**

`src/server/classroom/media-allowance.ts`:

```ts
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * A community's hosted-media limits (spec 2026-09-27 §7). Slice 2 has stored
 * files only; slice 3 adds stored video and monthly viewing.
 */
export type MediaAllowance = { fileBytesStored: number };
export type MediaUsage = { fileBytesStored: number };

export const DEFAULT_MEDIA_ALLOWANCE: MediaAllowance = {
  fileBytesStored: 5 * 1024 ** 3,
};

/** Statuses whose files count against storage (a failed upload has no file). */
export const STORAGE_COUNTED_STATUSES = ["uploading", "ready"] as const;

/**
 * A community's allowance. Today every community gets the defaults; this is
 * the one place paid plans will change. Upload checks and the settings usage
 * bar both read from here.
 */
export async function allowanceFor(
  _communityId: string,
): Promise<MediaAllowance> {
  return DEFAULT_MEDIA_ALLOWANCE;
}

/** Exact current usage, summed from the records (no calls to S3). */
export async function usageFor(
  payload: Payload,
  communityId: string,
): Promise<MediaUsage> {
  const { docs } = await payload.find({
    collection: "hosted-materials",
    where: {
      and: [
        { communityId: { equals: communityId } },
        { status: { in: [...STORAGE_COUNTED_STATUSES] } },
      ],
    },
    pagination: false,
    depth: 0,
  });
  return {
    fileBytesStored: docs.reduce((sum, doc) => sum + doc.bytes, 0),
  };
}

/** The storage limit is hard: refuse anything that would pass it. */
export function exceedsAllowance(
  usage: MediaUsage,
  allowance: MediaAllowance,
  extraBytes: number,
): boolean {
  return usage.fileBytesStored + extraBytes > allowance.fileBytesStored;
}
```

- [ ] **Step 8: Verify and commit**

Run:
```bash
pnpm vitest run src/collections/hosted-materials-schema.test.ts src/server/classroom/media-allowance.test.ts src/collections/community-videos-schema.test.ts
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
bash /Users/greg/coding-projects/aitcom/.claude/worktrees/classroom-hosted-files/dbtest.sh src/server/api/routers/classroom-access.integration.test.ts src/server/api/routers/classroom-lessons.integration.test.ts
```
Expected: all PASS; the DB suites executed. They update and delete Payload documents, so they prove Payload works with the new collection and its admin-lock column.

```bash
pnpm exec prettier --write src/collections/HostedMaterials.ts src/collections/hosted-materials-schema.test.ts src/payload.config.ts src/migrations/20260928d_hosted_materials.ts src/migrations/index.ts src/server/classroom/media-allowance.ts src/server/classroom/media-allowance.test.ts
git branch --show-current
git add src/collections/HostedMaterials.ts src/collections/hosted-materials-schema.test.ts src/payload.config.ts src/migrations/20260928d_hosted_materials.ts src/migrations/index.ts src/payload-types.ts src/server/classroom/media-allowance.ts src/server/classroom/media-allowance.test.ts
git diff --cached --stat
git commit -m "Classroom files: hosted-materials records and the community storage allowance

A hosted-materials record is one uploaded file: it belongs to a course, has
a status (uploading, ready, failed) and a visibility (members, free
preview). media-allowance.ts is the single seam for limits: 5 GB of files
per community today, summed exactly from the records."
```

---
### Task 4: Hosted file service and the `classroomMaterials` router

**Files:**
- Create: `src/lib/classroom/material-access.ts`
- Test: `src/lib/classroom/material-access.test.ts`
- Modify: `src/server/classroom/course-access.ts` (append `requireEditableCourse`)
- Modify: `src/server/classroom/course-access.test.ts` (imports at lines 1–6; append)
- Create: `src/server/classroom/hosted-files.ts`
- Test: `src/server/classroom/hosted-files.test.ts`
- Create: `src/server/api/routers/classroom-materials.ts`
- Modify: `src/server/api/root.ts` (import after line 45; router map after line 101 `classrooms: classroomsRouter,`)
- Test: `src/server/api/routers/classroom-materials.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 `ObjectStorageSource`, `PresignedUpload`, `getObjectStorage`; Task 2 rules and `canUploadMaterials`; Task 3 `HostedMaterial`, `allowanceFor`, `usageFor`, `exceedsAllowance`; existing `loadCourseAccess` (`course-access.ts:65`), `FINISH_WINDOW_HOURS` (`video-rules.ts:29`), `communityProcedure` (`trpc.ts:293`).
- Produces (`@/lib/classroom/material-access`):
  ```ts
  export type MaterialViewer = "visitor" | "member" | "manager";
  export type MaterialAccess = "download" | "join" | "processing" | "failed";
  export type ManifestMaterial = { id: number; kind: MaterialKind; title: string; extension: string; contentType: string; bytes: number; status: MaterialStatus; visibility: MaterialVisibility };
  export type MaterialSummary = { access: "removed" } | ({ access: MaterialAccess } & Omit<ManifestMaterial, "id">);
  export type MaterialsManifest = Record<number, MaterialSummary>;
  export function mayDownloadMaterial(viewer: MaterialViewer | "none", visibility: MaterialVisibility): boolean;
  export function materialAccessFor(viewer: MaterialViewer, material: { status: MaterialStatus; visibility: MaterialVisibility }): MaterialAccess;
  export function buildMaterialsManifest(ids: readonly number[], materials: readonly ManifestMaterial[], viewer: MaterialViewer): MaterialsManifest;
  ```
- Produces (`@/server/classroom/course-access`): `requireEditableCourse(payload, courseId: number, userId: string): Promise<Course>` — NOT_FOUND if missing, FORBIDDEN if not the author.
- Produces (`@/server/classroom/hosted-files`):
  ```ts
  export type HostedFileDeps = { payload: Payload; db: typeof db; storage: ObjectStorageSource; now?: () => Date; newUploadId?: () => string; log?: (message: string, detail: unknown) => void };
  export type CourseMaterial = { id: number; title: string; extension: string; contentType: string; bytes: number; status: MaterialStatus; visibility: MaterialVisibility; failureReason: string | null; createdAt: string };
  export function mayUploadMaterials(database: typeof db, communityId: string, userId: string): Promise<boolean>;
  export function startFileUpload(deps, input: { userId: string; courseId: number; fileName: string; bytes: number }): Promise<{ materialId: number; upload: PresignedUpload; contentType: string }>;
  export function finishFileUpload(deps, input: { userId: string; materialId: number }): Promise<CourseMaterial>;
  export function fileLink(deps, input: { viewerId: string | null; materialId: number; disposition: "inline" | "attachment" }): Promise<{ url: string }>;
  export function listCourseMaterials(deps, input: { userId: string; courseId: number }): Promise<CourseMaterial[]>;
  export function updateMaterial(deps, input: { userId: string; materialId: number; title?: string; visibility?: MaterialVisibility }): Promise<CourseMaterial>;
  export function deleteMaterial(deps, input: { userId: string; materialId: number }): Promise<{ ok: true }>;
  ```
- Produces (tRPC `classroomMaterials`): `startFileUpload` (mutation), `finishFileUpload` (mutation), `fileLink` (public query, input `{ materialId, disposition }`, default `"attachment"`), `listCourseMaterials` (query), `updateMaterial` (mutation), `deleteMaterial` (mutation), `usage` (query, input `{ slug }`, owner/admin → `{ fileBytesStored, fileBytesAllowed }`).

- [ ] **Step 1: Write the failing access-rule test**

`src/lib/classroom/material-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildMaterialsManifest,
  materialAccessFor,
  mayDownloadMaterial,
  type ManifestMaterial,
} from "./material-access";

describe("mayDownloadMaterial", () => {
  it.each([
    ["manager", "members", true],
    ["manager", "preview", true],
    ["member", "members", true],
    ["member", "preview", true],
    ["visitor", "members", false],
    ["visitor", "preview", true],
    ["none", "members", false],
    ["none", "preview", false],
  ] as const)("%s + %s file → %s", (viewer, visibility, allowed) => {
    expect(mayDownloadMaterial(viewer, visibility)).toBe(allowed);
  });
});

describe("materialAccessFor", () => {
  it.each([
    ["visitor", "members", "ready", "join"],
    ["visitor", "members", "uploading", "join"],
    ["visitor", "preview", "uploading", "processing"],
    ["visitor", "preview", "ready", "download"],
    ["member", "members", "failed", "failed"],
    ["member", "members", "ready", "download"],
    ["manager", "members", "uploading", "processing"],
  ] as const)("%s, %s file, %s → %s", (viewer, visibility, status, access) => {
    expect(materialAccessFor(viewer, { status, visibility })).toBe(access);
  });
});

describe("buildMaterialsManifest", () => {
  const file = (over: Partial<ManifestMaterial>): ManifestMaterial => ({
    id: 1,
    kind: "file",
    title: "Workbook",
    extension: "pdf",
    contentType: "application/pdf",
    bytes: 4096,
    status: "ready",
    visibility: "members",
    ...over,
  });

  it("describes each referenced file for this viewer, and marks missing ones removed", () => {
    const withSecret = {
      ...file({ id: 2, visibility: "preview", title: "Sample" }),
      storageKey: "private/classroom/c/1/x.pdf",
    };
    const manifest = buildMaterialsManifest(
      [1, 2, 3],
      [file({ id: 1 }), withSecret],
      "visitor",
    );
    expect(manifest).toEqual({
      1: {
        access: "join",
        kind: "file",
        title: "Workbook",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: 4096,
        status: "ready",
        visibility: "members",
      },
      2: {
        access: "download",
        kind: "file",
        title: "Sample",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: 4096,
        status: "ready",
        visibility: "preview",
      },
      3: { access: "removed" },
    });
  });

  it("is empty when no file is referenced", () => {
    expect(buildMaterialsManifest([], [file({})], "member")).toEqual({});
  });
});
```

Run: `pnpm vitest run src/lib/classroom/material-access.test.ts`
Expected: FAIL. `./material-access` cannot be resolved.

- [ ] **Step 2: Write the access rule**

`src/lib/classroom/material-access.ts`:

```ts
import type {
  MaterialKind,
  MaterialStatus,
  MaterialVisibility,
} from "./material-rules";

/**
 * Who may get a hosted file, and what a lesson shows for it (spec
 * 2026-09-27 §1, §3.3). Pure and shared: `fileLink` on the server and the
 * lesson manifest use the same rule, so a card never offers a download the
 * server would refuse.
 */

/** A viewer's course access, as resolved by `loadCourseAccess` (never "none" here). */
export type MaterialViewer = "visitor" | "member" | "manager";

export type MaterialAccess = "download" | "join" | "processing" | "failed";

export type ManifestMaterial = {
  id: number;
  kind: MaterialKind;
  title: string;
  extension: string;
  contentType: string;
  bytes: number;
  status: MaterialStatus;
  visibility: MaterialVisibility;
};

export type MaterialSummary =
  | { access: "removed" }
  | ({ access: MaterialAccess } & Omit<ManifestMaterial, "id">);

/** Keyed by material id. Carries no URLs: links are fetched on demand. */
export type MaterialsManifest = Record<number, MaterialSummary>;

/** Members and managers get every file; visitors of a public course only free-preview files. */
export function mayDownloadMaterial(
  viewer: MaterialViewer | "none",
  visibility: MaterialVisibility,
): boolean {
  return (
    viewer === "member" ||
    viewer === "manager" ||
    (viewer === "visitor" && visibility === "preview")
  );
}

/** What a lesson shows this viewer for one existing file. */
export function materialAccessFor(
  viewer: MaterialViewer,
  material: { status: MaterialStatus; visibility: MaterialVisibility },
): MaterialAccess {
  if (!mayDownloadMaterial(viewer, material.visibility)) return "join";
  if (material.status === "uploading") return "processing";
  if (material.status === "failed") return "failed";
  return "download";
}

/**
 * One summary per referenced id. An id without a matching material (deleted,
 * or not in this course) is "removed". Only display fields are copied —
 * never storage keys or upload ids.
 */
export function buildMaterialsManifest(
  ids: readonly number[],
  materials: readonly ManifestMaterial[],
  viewer: MaterialViewer,
): MaterialsManifest {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const manifest: MaterialsManifest = {};
  for (const id of ids) {
    const m = byId.get(id);
    manifest[id] = m
      ? {
          access: materialAccessFor(viewer, m),
          kind: m.kind,
          title: m.title,
          extension: m.extension,
          contentType: m.contentType,
          bytes: m.bytes,
          status: m.status,
          visibility: m.visibility,
        }
      : { access: "removed" };
  }
  return manifest;
}
```

Run: `pnpm vitest run src/lib/classroom/material-access.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing `requireEditableCourse` test**

In `src/server/classroom/course-access.test.ts` replace lines 1–6 (the two import statements) with:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  isCourseManagerRole,
  requireEditableCourse,
  resolveCourseAccess,
  type CourseAccessMembership,
} from "./course-access";
```

Append to the end of the file:

```ts

describe("requireEditableCourse", () => {
  const payloadWith = (course: unknown) => ({
    findByID: vi.fn().mockResolvedValue(course),
  });

  it("hands the course to its author", async () => {
    const course = { id: 12, authorId: AUTHOR };
    const payload = payloadWith(course);
    await expect(
      requireEditableCourse(payload as never, 12, AUTHOR),
    ).resolves.toBe(course);
    expect(payload.findByID).toHaveBeenCalledWith({
      collection: "courses",
      id: 12,
      depth: 0,
      disableErrors: true,
    });
  });

  it("refuses anyone else", async () => {
    await expect(
      requireEditableCourse(
        payloadWith({ id: 12, authorId: AUTHOR }) as never,
        12,
        VIEWER,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("answers NOT_FOUND for a course that does not exist", async () => {
    await expect(
      requireEditableCourse(payloadWith(null) as never, 12, AUTHOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

Run: `pnpm vitest run src/server/classroom/course-access.test.ts`
Expected: FAIL. `requireEditableCourse` is not exported.

- [ ] **Step 4: Add `requireEditableCourse`**

Append to `src/server/classroom/course-access.ts`:

```ts

/**
 * Load a course and require that the caller may edit it — today, only its
 * author (the same rule as every lesson/module mutation in classrooms.ts).
 * The shared gate for classroom material management.
 */
export async function requireEditableCourse(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  courseId: number,
  userId: string,
): Promise<Course> {
  const course = await payload.findByID({
    collection: "courses",
    id: courseId,
    depth: 0,
    disableErrors: true,
  });
  if (!course) throw new TRPCError({ code: "NOT_FOUND" });
  if (course.authorId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
  return course;
}
```

Run: `pnpm vitest run src/server/classroom/course-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing service test**

`src/server/classroom/hosted-files.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { MAX_FILE_BYTES } from "@/lib/classroom/material-rules";
import { FINISH_WINDOW_HOURS } from "@/lib/video-rules";

import {
  deleteMaterial,
  fileLink,
  finishFileUpload,
  mayUploadMaterials,
  startFileUpload,
  updateMaterial,
} from "./hosted-files";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const NOW = new Date("2026-09-28T12:00:00.000Z");
const KEY = `private/classroom/c1/12/${UPLOAD}.pdf`;
const GB5 = 5 * 1024 ** 3;
const COURSE = {
  id: 12,
  authorId: "u1",
  communityId: "c1",
  status: "published",
  isPublic: false,
};

function material(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    communityId: "c1",
    course: 12,
    uploaderId: "u1",
    kind: "file",
    status: "uploading",
    failureReason: null,
    title: "Week 1 slides",
    visibility: "members",
    fileName: "Week 1 slides.pdf",
    extension: "pdf",
    contentType: "application/pdf",
    bytes: 2048,
    storageKey: KEY,
    uploadId: UPLOAD,
    createdAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

type Over = {
  course?: unknown;
  material?: unknown;
  community?: boolean;
  policy?: "all_members" | "admins_only";
  role?: string | null;
  recent?: number;
  docs?: unknown[];
  stored?: unknown;
  removeFails?: boolean;
};

function fakes(over: Over = {}) {
  const found: Record<string, unknown> = {
    courses: "course" in over ? over.course : COURSE,
    "hosted-materials": "material" in over ? over.material : material(),
  };
  const payload = {
    findByID: vi.fn(({ collection }: { collection: string }) =>
      Promise.resolve(found[collection] ?? null),
    ),
    count: vi.fn().mockResolvedValue({ totalDocs: over.recent ?? 0 }),
    find: vi.fn().mockResolvedValue({ docs: over.docs ?? [] }),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 7,
        failureReason: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        ...data,
      }),
    ),
    update: vi.fn(
      ({ id, data }: { id: number; data: Record<string, unknown> }) =>
        Promise.resolve({
          ...(found["hosted-materials"] as object),
          id,
          ...data,
        }),
    ),
    delete: vi.fn().mockResolvedValue({}),
  };
  const db = {
    query: {
      communities: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            over.community === false
              ? undefined
              : { classroomUploadPolicy: over.policy ?? "admins_only" },
          ),
      },
      communityMemberships: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            over.role === null
              ? undefined
              : { role: over.role ?? "admin", status: "active" },
          ),
      },
    },
  };
  const storage = {
    presignUpload: vi.fn(({ key }: { key: string }) =>
      Promise.resolve({ url: "https://s3.test/", fields: { key } }),
    ),
    inspect: vi.fn().mockResolvedValue("stored" in over ? over.stored : null),
    signedGetUrl: vi.fn().mockResolvedValue("https://signed.test/f"),
    publicUrl: vi.fn(),
    remove: over.removeFails
      ? vi.fn().mockRejectedValue(new Error("s3 down"))
      : vi.fn().mockResolvedValue(undefined),
  };
  const getStorage = vi.fn(() => storage);
  const log = vi.fn();
  return {
    payload,
    db,
    storage,
    getStorage,
    log,
    deps: {
      payload: payload as never,
      db: db as never,
      storage: getStorage as never,
      now: () => NOW,
      newUploadId: () => UPLOAD,
      log,
    },
  };
}

const START = {
  userId: "u1",
  courseId: 12,
  fileName: "Week 1 slides.pdf",
  bytes: 2048,
};

describe("startFileUpload", () => {
  it("records the upload, then grants exactly the declared size for the type the extension implies", async () => {
    const { deps, payload, storage } = fakes();
    await expect(startFileUpload(deps, START)).resolves.toEqual({
      materialId: 7,
      upload: { url: "https://s3.test/", fields: { key: KEY } },
      contentType: "application/pdf",
    });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { uploaderId: { equals: "u1" } },
          { createdAt: { greater_than: "2026-09-27T12:00:00.000Z" } },
        ],
      },
    });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "hosted-materials",
      data: {
        communityId: "c1",
        course: 12,
        uploaderId: "u1",
        kind: "file",
        status: "uploading",
        title: "Week 1 slides",
        visibility: "members",
        fileName: "Week 1 slides.pdf",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: 2048,
        storageKey: KEY,
        uploadId: UPLOAD,
      },
    });
    expect(storage.presignUpload).toHaveBeenCalledWith({
      key: KEY,
      contentType: "application/pdf",
      maxBytes: 2048,
    });
  });

  it("lets a member upload when the community allows all members", async () => {
    const { deps } = fakes({ policy: "all_members", role: "member" });
    await expect(startFileUpload(deps, START)).resolves.toMatchObject({
      materialId: 7,
    });
  });

  it("accepts a file of exactly 200 MB", async () => {
    const { deps } = fakes();
    await expect(
      startFileUpload(deps, { ...START, bytes: MAX_FILE_BYTES }),
    ).resolves.toMatchObject({ materialId: 7 });
  });

  it("accepts an upload that fills the allowance exactly", async () => {
    const { deps } = fakes({ docs: [{ bytes: GB5 - 2048 }] });
    await expect(startFileUpload(deps, START)).resolves.toMatchObject({
      materialId: 7,
    });
  });

  const refusals: Array<
    [string, Over, Partial<typeof START>, string, string | undefined]
  > = [
    ["someone else's course", {}, { userId: "u2" }, "FORBIDDEN", undefined],
    ["a missing course", { course: null }, {}, "NOT_FOUND", undefined],
    [
      "a member under owners-and-admins",
      { role: "member" },
      {},
      "FORBIDDEN",
      "UPLOADS_NOT_ALLOWED",
    ],
    [
      "a moderator under owners-and-admins",
      { role: "moderator" },
      {},
      "FORBIDDEN",
      "UPLOADS_NOT_ALLOWED",
    ],
    [
      "an author who left the community",
      { policy: "all_members", role: null },
      {},
      "FORBIDDEN",
      "UPLOADS_NOT_ALLOWED",
    ],
    [
      "a deleted community",
      { community: false },
      {},
      "FORBIDDEN",
      "UPLOADS_NOT_ALLOWED",
    ],
    [
      "a program file",
      {},
      { fileName: "setup.exe" },
      "BAD_REQUEST",
      "FILE_TYPE_NOT_ALLOWED",
    ],
    [
      "a disguised program",
      {},
      { fileName: "notes.pdf.exe" },
      "BAD_REQUEST",
      "FILE_TYPE_NOT_ALLOWED",
    ],
    [
      "a file without extension",
      {},
      { fileName: "README" },
      "BAD_REQUEST",
      "FILE_TYPE_NOT_ALLOWED",
    ],
    ["an empty file", {}, { bytes: 0 }, "BAD_REQUEST", "FILE_EMPTY"],
    [
      "a file over 200 MB",
      {},
      { bytes: MAX_FILE_BYTES + 1 },
      "BAD_REQUEST",
      "FILE_TOO_LARGE",
    ],
    [
      "the 31st upload today",
      { recent: 30 },
      {},
      "TOO_MANY_REQUESTS",
      "UPLOAD_LIMIT",
    ],
    [
      "an upload past the allowance",
      { docs: [{ bytes: GB5 - 2047 }] },
      {},
      "FORBIDDEN",
      "STORAGE_FULL",
    ],
  ];

  it.each(refusals)(
    "refuses %s and leaves nothing behind",
    async (_label, over, input, code, message) => {
      const { deps, payload, storage } = fakes(over);
      const refusal = startFileUpload(deps, { ...START, ...input });
      await expect(refusal).rejects.toMatchObject(
        message ? { code, message } : { code },
      );
      expect(payload.create).not.toHaveBeenCalled();
      expect(storage.presignUpload).not.toHaveBeenCalled();
    },
  );
});

describe("finishFileUpload", () => {
  it("marks the file ready with the size S3 reports", async () => {
    const { deps, payload, storage } = fakes({
      stored: { contentType: "application/pdf", bytes: 2000 },
    });
    const done = await finishFileUpload(deps, { userId: "u1", materialId: 7 });
    expect(storage.inspect).toHaveBeenCalledWith(KEY);
    expect(payload.update).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 7,
      data: { status: "ready", bytes: 2000 },
    });
    expect(done).toEqual({
      id: 7,
      title: "Week 1 slides",
      extension: "pdf",
      contentType: "application/pdf",
      bytes: 2000,
      status: "ready",
      visibility: "members",
      failureReason: null,
      createdAt: material().createdAt,
    });
  });

  it.each([
    ["missing", null],
    ["of the wrong type", { contentType: "text/html", bytes: 2000 }],
    ["empty", { contentType: "application/pdf", bytes: 0 }],
    [
      "bigger than declared",
      { contentType: "application/pdf", bytes: 2049 },
    ],
  ])(
    "deletes an upload that is %s and marks it failed",
    async (_label, stored) => {
      const { deps, payload, storage } = fakes({ stored });
      await expect(
        finishFileUpload(deps, { userId: "u1", materialId: 7 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "UPLOAD_FAILED" });
      expect(storage.remove).toHaveBeenCalledWith([KEY]);
      expect(payload.update).toHaveBeenCalledWith({
        collection: "hosted-materials",
        id: 7,
        data: { status: "failed", failureReason: "UPLOAD_MISMATCH" },
      });
    },
  );

  it("still marks a bad upload failed when deleting it fails, and logs that", async () => {
    const { deps, payload, log } = fakes({ stored: null, removeFails: true });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_FAILED" });
    expect(log).toHaveBeenCalledWith(
      "[classroomMaterials.finishFileUpload] removing a bad upload failed",
      expect.objectContaining({ materialId: 7, key: KEY }),
    );
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "failed", failureReason: "UPLOAD_MISMATCH" },
      }),
    );
  });

  it("returns a ready file unchanged on a second finish", async () => {
    const { deps, payload, storage } = fakes({
      material: material({ status: "ready", bytes: 2000 }),
    });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toMatchObject({ id: 7, status: "ready", bytes: 2000 });
    expect(storage.inspect).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("keeps a failed upload failed", async () => {
    const { deps, storage } = fakes({
      material: material({ status: "failed" }),
    });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "UPLOAD_FAILED" });
    expect(storage.inspect).not.toHaveBeenCalled();
  });

  it.each([
    ["someone else's upload", material({ uploaderId: "u2" })],
    ["an unknown upload", null],
    [
      "an upload past the finish window",
      material({
        createdAt: new Date(
          NOW.getTime() - FINISH_WINDOW_HOURS * 3600_000 - 60_000,
        ).toISOString(),
      }),
    ],
  ])("answers UPLOAD_EXPIRED for %s and touches nothing", async (_l, m) => {
    const { deps, payload, getStorage } = fakes({ material: m });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "UPLOAD_EXPIRED" });
    expect(getStorage).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });
});

describe("fileLink", () => {
  const ready = material({ status: "ready" });

  it("signs a download named after the title for a member", async () => {
    const { deps, storage } = fakes({ material: ready, role: "member" });
    await expect(
      fileLink(deps, {
        viewerId: "u9",
        materialId: 7,
        disposition: "attachment",
      }),
    ).resolves.toEqual({ url: "https://signed.test/f" });
    expect(storage.signedGetUrl).toHaveBeenCalledWith(KEY, {
      downloadName: "Week 1 slides.pdf",
      disposition: "attachment",
      contentType: "application/pdf",
    });
  });

  it("gives a visitor of a public course only free-preview files", async () => {
    const course = { ...COURSE, isPublic: true };
    const members = fakes({ course, material: ready, role: null });
    await expect(
      fileLink(members.deps, {
        viewerId: null,
        materialId: 7,
        disposition: "attachment",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const preview = fakes({
      course,
      material: material({ status: "ready", visibility: "preview" }),
      role: null,
    });
    await expect(
      fileLink(preview.deps, {
        viewerId: null,
        materialId: 7,
        disposition: "inline",
      }),
    ).resolves.toEqual({ url: "https://signed.test/f" });
  });

  it("never links a file that is still uploading", async () => {
    const { deps, getStorage } = fakes({ role: "member" });
    await expect(
      fileLink(deps, { viewerId: "u9", materialId: 7, disposition: "attachment" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("refuses to show anything but a PDF inline", async () => {
    const { deps } = fakes({
      material: material({
        status: "ready",
        extension: "zip",
        contentType: "application/zip",
      }),
      role: "member",
    });
    await expect(
      fileLink(deps, { viewerId: "u9", materialId: 7, disposition: "inline" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("updateMaterial / deleteMaterial", () => {
  it("renames and shares a file for the course author", async () => {
    const { deps, payload } = fakes({ material: material({ status: "ready" }) });
    await expect(
      updateMaterial(deps, {
        userId: "u1",
        materialId: 7,
        title: "Handout",
        visibility: "preview",
      }),
    ).resolves.toMatchObject({ title: "Handout", visibility: "preview" });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 7,
      data: { title: "Handout", visibility: "preview" },
    });
  });

  it("changes nothing when nothing was asked", async () => {
    const { deps, payload } = fakes();
    await updateMaterial(deps, { userId: "u1", materialId: 7 });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("removes the stored file, then the record", async () => {
    const { deps, payload, storage } = fakes();
    await expect(
      deleteMaterial(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toEqual({ ok: true });
    expect(storage.remove).toHaveBeenCalledWith([KEY]);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 7,
    });
  });

  it("still deletes the record when S3 fails, and logs the leftover", async () => {
    const { deps, payload, log } = fakes({ removeFails: true });
    await deleteMaterial(deps, { userId: "u1", materialId: 7 });
    expect(log).toHaveBeenCalledWith(
      "[classroomMaterials.deleteMaterial] removing the stored file failed",
      expect.objectContaining({ materialId: 7, key: KEY }),
    );
    expect(payload.delete).toHaveBeenCalled();
  });

  it("lets only the course author manage its files", async () => {
    const { deps, payload, getStorage } = fakes();
    await expect(
      deleteMaterial(deps, { userId: "u2", materialId: 7 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateMaterial(deps, { userId: "u2", materialId: 7, title: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getStorage).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });
});

describe("mayUploadMaterials", () => {
  it("follows the community policy and the member's role", async () => {
    await expect(
      mayUploadMaterials(fakes().db as never, "c1", "u1"),
    ).resolves.toBe(true);
    await expect(
      mayUploadMaterials(fakes({ role: "member" }).db as never, "c1", "u1"),
    ).resolves.toBe(false);
    await expect(
      mayUploadMaterials(fakes({ community: false }).db as never, "c1", "u1"),
    ).resolves.toBe(false);
  });
});
```

Run: `pnpm vitest run src/server/classroom/hosted-files.test.ts`
Expected: FAIL. `./hosted-files` cannot be resolved.

- [ ] **Step 6: Write the service**

`src/server/classroom/hosted-files.ts`:

```ts
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { canUploadMaterials } from "@/lib/classroom";
import { mayDownloadMaterial } from "@/lib/classroom/material-access";
import {
  MATERIAL_FILE_NAME_MAX,
  MATERIAL_TITLE_MAX,
  MATERIAL_UPLOADS_PER_DAY,
  MAX_FILE_BYTES,
  contentTypeFor,
  downloadFileName,
  fileExtensionOf,
  isInlinePreviewable,
  materialObjectKey,
  titleFromFileName,
  type MaterialStatus,
  type MaterialVisibility,
} from "@/lib/classroom/material-rules";
import { FINISH_WINDOW_HOURS } from "@/lib/video-rules";
import type { HostedMaterial } from "@/payload-types";
import {
  loadCourseAccess,
  requireEditableCourse,
} from "@/server/classroom/course-access";
import {
  allowanceFor,
  exceedsAllowance,
  usageFor,
} from "@/server/classroom/media-allowance";
import type { db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import type {
  ObjectStorageSource,
  PresignedUpload,
} from "@/server/media/object-storage";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * The hosted-file lifecycle (spec 2026-09-27 §4): start → the browser POSTs
 * straight to S3 → finish; then links, listing, rename, visibility, delete.
 * Dependencies are injected so every rule is unit-tested with fakes; the
 * classroomMaterials router is a thin shell over these functions.
 */
export type HostedFileDeps = {
  payload: Payload;
  db: typeof db;
  storage: ObjectStorageSource;
  now?: () => Date;
  newUploadId?: () => string;
  log?: (message: string, detail: unknown) => void;
};

/** What the course author sees of a file. Never includes storage keys. */
export type CourseMaterial = {
  id: number;
  title: string;
  extension: string;
  contentType: string;
  bytes: number;
  status: MaterialStatus;
  visibility: MaterialVisibility;
  failureReason: string | null;
  createdAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toCourseMaterial(m: HostedMaterial): CourseMaterial {
  return {
    id: m.id,
    title: m.title,
    extension: m.extension,
    contentType: m.contentType,
    bytes: m.bytes,
    status: m.status,
    visibility: m.visibility,
    failureReason: m.failureReason ?? null,
    createdAt: m.createdAt,
  };
}

function refuse(
  code: "FORBIDDEN" | "BAD_REQUEST" | "NOT_FOUND" | "TOO_MANY_REQUESTS",
  message: string,
): TRPCError {
  return new TRPCError({ code, message });
}

/** May this user upload lesson files in this community, under its policy? */
export async function mayUploadMaterials(
  database: typeof db,
  communityId: string,
  userId: string,
): Promise<boolean> {
  const community = await database.query.communities.findFirst({
    where: and(eq(communities.id, communityId), isNull(communities.deletedAt)),
    columns: { classroomUploadPolicy: true },
  });
  if (!community) return false;
  const membership = await database.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { role: true },
  });
  return canUploadMaterials(
    community.classroomUploadPolicy,
    membership?.role ?? null,
  );
}

/**
 * Checks, in order: the caller edits this course; the community lets them
 * upload; the type is allowed; the size is 1 byte to 200 MB; the daily limit;
 * the storage allowance. Then records the upload and grants one presigned
 * POST pinned to the key, the derived type and the declared size.
 */
export async function startFileUpload(
  deps: HostedFileDeps,
  input: { userId: string; courseId: number; fileName: string; bytes: number },
): Promise<{ materialId: number; upload: PresignedUpload; contentType: string }> {
  const course = await requireEditableCourse(
    deps.payload,
    input.courseId,
    input.userId,
  );
  if (!(await mayUploadMaterials(deps.db, course.communityId, input.userId))) {
    throw refuse("FORBIDDEN", "UPLOADS_NOT_ALLOWED");
  }
  const extension = fileExtensionOf(input.fileName);
  if (!extension) throw refuse("BAD_REQUEST", "FILE_TYPE_NOT_ALLOWED");
  if (input.bytes < 1) throw refuse("BAD_REQUEST", "FILE_EMPTY");
  if (input.bytes > MAX_FILE_BYTES) {
    throw refuse("BAD_REQUEST", "FILE_TOO_LARGE");
  }

  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const { totalDocs } = await deps.payload.count({
    collection: "hosted-materials",
    where: {
      and: [
        { uploaderId: { equals: input.userId } },
        { createdAt: { greater_than: since } },
      ],
    },
  });
  if (totalDocs >= MATERIAL_UPLOADS_PER_DAY) {
    throw refuse("TOO_MANY_REQUESTS", "UPLOAD_LIMIT");
  }

  const [usage, allowance] = await Promise.all([
    usageFor(deps.payload, course.communityId),
    allowanceFor(course.communityId),
  ]);
  if (exceedsAllowance(usage, allowance, input.bytes)) {
    throw refuse("FORBIDDEN", "STORAGE_FULL");
  }

  const uploadId = deps.newUploadId?.() ?? randomUUID();
  const contentType = contentTypeFor(extension);
  const storageKey = materialObjectKey({
    communityId: course.communityId,
    courseId: course.id,
    uploadId,
    ext: extension,
  });
  const material = await deps.payload.create({
    collection: "hosted-materials",
    data: {
      communityId: course.communityId,
      course: course.id,
      uploaderId: input.userId,
      kind: "file",
      status: "uploading",
      title: titleFromFileName(input.fileName),
      visibility: "members",
      fileName: input.fileName.trim().slice(0, MATERIAL_FILE_NAME_MAX),
      extension,
      contentType,
      bytes: input.bytes,
      storageKey,
      uploadId,
    },
  });
  const upload = await deps.storage().presignUpload({
    key: storageKey,
    contentType,
    maxBytes: input.bytes,
  });
  return { materialId: material.id, upload, contentType };
}

/**
 * Checks the object S3 actually stored: it must exist, have the derived type,
 * and be 1 byte up to the declared size. Good → ready with the real size.
 * Bad → the object is deleted and the record marked failed. A second finish
 * of a ready file returns it unchanged. Past the finish window nothing is
 * touched: the daily cleanup may already be acting on the upload.
 */
export async function finishFileUpload(
  deps: HostedFileDeps,
  input: { userId: string; materialId: number },
): Promise<CourseMaterial> {
  const material = await deps.payload.findByID({
    collection: "hosted-materials",
    id: input.materialId,
    depth: 0,
    disableErrors: true,
  });
  if (!material || material.uploaderId !== input.userId) {
    throw refuse("NOT_FOUND", "UPLOAD_EXPIRED");
  }
  if (material.status === "ready") return toCourseMaterial(material);
  if (material.status === "failed") throw refuse("BAD_REQUEST", "UPLOAD_FAILED");

  const now = deps.now?.() ?? new Date();
  const cutoff = now.getTime() - FINISH_WINDOW_HOURS * 60 * 60 * 1000;
  if (new Date(material.createdAt).getTime() < cutoff) {
    throw refuse("NOT_FOUND", "UPLOAD_EXPIRED");
  }

  const storage = deps.storage();
  const stored = await storage.inspect(material.storageKey);
  const valid =
    stored !== null &&
    stored.contentType === material.contentType &&
    stored.bytes > 0 &&
    stored.bytes <= material.bytes &&
    stored.bytes <= MAX_FILE_BYTES;
  if (!stored || !valid) {
    try {
      await storage.remove([material.storageKey]);
    } catch (error) {
      (deps.log ?? console.error)(
        "[classroomMaterials.finishFileUpload] removing a bad upload failed",
        { materialId: material.id, key: material.storageKey, error },
      );
    }
    await deps.payload.update({
      collection: "hosted-materials",
      id: material.id,
      data: { status: "failed", failureReason: "UPLOAD_MISMATCH" },
    });
    throw refuse("BAD_REQUEST", "UPLOAD_FAILED");
  }
  const ready = await deps.payload.update({
    collection: "hosted-materials",
    id: material.id,
    data: { status: "ready", bytes: stored.bytes },
  });
  return toCourseMaterial(ready);
}

/**
 * A signed link to a ready file. Access is decided on the file's own course
 * (never the lesson's): members and managers get every file, visitors of a
 * public course only free-preview files; everyone else gets NOT_FOUND.
 */
export async function fileLink(
  deps: HostedFileDeps,
  input: {
    viewerId: string | null;
    materialId: number;
    disposition: "inline" | "attachment";
  },
): Promise<{ url: string }> {
  const material = await deps.payload.findByID({
    collection: "hosted-materials",
    id: input.materialId,
    depth: 0,
    disableErrors: true,
  });
  if (!material || material.status !== "ready") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  const course = await deps.payload.findByID({
    collection: "courses",
    id: material.course,
    depth: 0,
    disableErrors: true,
  });
  if (!course) throw new TRPCError({ code: "NOT_FOUND" });
  const access = await loadCourseAccess(deps.db, course, input.viewerId);
  if (!mayDownloadMaterial(access, material.visibility)) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (
    input.disposition === "inline" &&
    !isInlinePreviewable(material.extension)
  ) {
    throw new TRPCError({ code: "BAD_REQUEST" });
  }
  const url = await deps.storage().signedGetUrl(material.storageKey, {
    downloadName: downloadFileName(material.title, material.extension),
    disposition: input.disposition,
    contentType: material.contentType,
  });
  return { url };
}

/** Every file of a course, newest first, for its author. */
export async function listCourseMaterials(
  deps: HostedFileDeps,
  input: { userId: string; courseId: number },
): Promise<CourseMaterial[]> {
  await requireEditableCourse(deps.payload, input.courseId, input.userId);
  const { docs } = await deps.payload.find({
    collection: "hosted-materials",
    where: { course: { equals: input.courseId } },
    sort: "-createdAt",
    pagination: false,
    depth: 0,
  });
  return docs.map(toCourseMaterial);
}

async function requireEditableMaterial(
  deps: HostedFileDeps,
  materialId: number,
  userId: string,
): Promise<HostedMaterial> {
  const material = await deps.payload.findByID({
    collection: "hosted-materials",
    id: materialId,
    depth: 0,
    disableErrors: true,
  });
  if (!material) throw new TRPCError({ code: "NOT_FOUND" });
  await requireEditableCourse(deps.payload, material.course, userId);
  return material;
}

/** Rename a file or change who may download it. */
export async function updateMaterial(
  deps: HostedFileDeps,
  input: {
    userId: string;
    materialId: number;
    title?: string;
    visibility?: MaterialVisibility;
  },
): Promise<CourseMaterial> {
  const material = await requireEditableMaterial(
    deps,
    input.materialId,
    input.userId,
  );
  const data: { title?: string; visibility?: MaterialVisibility } = {};
  if (input.title !== undefined) {
    data.title = input.title.slice(0, MATERIAL_TITLE_MAX);
  }
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (Object.keys(data).length === 0) return toCourseMaterial(material);
  const updated = await deps.payload.update({
    collection: "hosted-materials",
    id: material.id,
    data,
  });
  return toCourseMaterial(updated);
}

/**
 * Delete a file: the stored object first (best effort — a failure is logged,
 * since nothing else will ever find that object again), then the record,
 * which frees the allowance. Lessons that still use it show it as removed.
 */
export async function deleteMaterial(
  deps: HostedFileDeps,
  input: { userId: string; materialId: number },
): Promise<{ ok: true }> {
  const material = await requireEditableMaterial(
    deps,
    input.materialId,
    input.userId,
  );
  try {
    await deps.storage().remove([material.storageKey]);
  } catch (error) {
    (deps.log ?? console.error)(
      "[classroomMaterials.deleteMaterial] removing the stored file failed",
      { materialId: material.id, key: material.storageKey, error },
    );
  }
  await deps.payload.delete({ collection: "hosted-materials", id: material.id });
  return { ok: true };
}
```

- [ ] **Step 7: Run the service test to verify it passes**

Run: `pnpm vitest run src/server/classroom/hosted-files.test.ts src/server/classroom/course-access.test.ts`
Expected: PASS.

- [ ] **Step 8: Write the router and register it**

`src/server/api/routers/classroom-materials.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  communityProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  MATERIAL_FILE_NAME_MAX,
  MATERIAL_TITLE_MAX,
  MATERIAL_VISIBILITIES,
} from "@/lib/classroom/material-rules";
import {
  deleteMaterial,
  fileLink,
  finishFileUpload,
  listCourseMaterials,
  startFileUpload,
  updateMaterial,
  type HostedFileDeps,
} from "@/server/classroom/hosted-files";
import { allowanceFor, usageFor } from "@/server/classroom/media-allowance";
import type { db } from "@/server/db";
import { getObjectStorage } from "@/server/media/object-storage";
import { getPayloadClient } from "@/server/payload";

async function depsFor(database: typeof db): Promise<HostedFileDeps> {
  // Storage is handed over lazily: listing and access checks never need S3.
  return {
    payload: await getPayloadClient(),
    db: database,
    storage: getObjectStorage,
  };
}

const materialId = z.number().int().positive();

/** Classroom hosted files (spec 2026-09-27 §4). Rules live in hosted-files.ts. */
export const classroomMaterialsRouter = createTRPCRouter({
  startFileUpload: protectedProcedure
    .input(
      z.object({
        courseId: z.number().int().positive(),
        fileName: z.string().trim().min(1).max(MATERIAL_FILE_NAME_MAX),
        bytes: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      startFileUpload(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        ...input,
      }),
    ),

  finishFileUpload: protectedProcedure
    .input(z.object({ materialId }))
    .mutation(async ({ ctx, input }) =>
      finishFileUpload(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        materialId: input.materialId,
      }),
    ),

  fileLink: publicProcedure
    .input(
      z.object({
        materialId,
        disposition: z.enum(["inline", "attachment"]).default("attachment"),
      }),
    )
    .query(async ({ ctx, input }) =>
      fileLink(await depsFor(ctx.db), {
        viewerId: ctx.session?.user?.id ?? null,
        materialId: input.materialId,
        disposition: input.disposition,
      }),
    ),

  listCourseMaterials: protectedProcedure
    .input(z.object({ courseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) =>
      listCourseMaterials(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        courseId: input.courseId,
      }),
    ),

  updateMaterial: protectedProcedure
    .input(
      z.object({
        materialId,
        title: z.string().trim().min(1).max(MATERIAL_TITLE_MAX).optional(),
        visibility: z.enum(MATERIAL_VISIBILITIES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      updateMaterial(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        ...input,
      }),
    ),

  deleteMaterial: protectedProcedure
    .input(z.object({ materialId }))
    .mutation(async ({ ctx, input }) =>
      deleteMaterial(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        materialId: input.materialId,
      }),
    ),

  /** Storage used vs allowed, for the classroom settings bar (owner/admin). */
  usage: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [usage, allowance] = await Promise.all([
        usageFor(await getPayloadClient(), ctx.community.id),
        allowanceFor(ctx.community.id),
      ]);
      return {
        fileBytesStored: usage.fileBytesStored,
        fileBytesAllowed: allowance.fileBytesStored,
      };
    }),
});
```

In `src/server/api/root.ts`, after line 45 (`import { classroomsRouter } from "@/server/api/routers/classrooms";`) add:

```ts
import { classroomMaterialsRouter } from "@/server/api/routers/classroom-materials";
```

and after `  classrooms: classroomsRouter,` add:

```ts
  classroomMaterials: classroomMaterialsRouter,
```

Run: `SKIP_ENV_VALIDATION=1 pnpm typecheck`
Expected: clean.

- [ ] **Step 9: Write the router DB integration test**

`src/server/api/routers/classroom-materials.integration.test.ts`:

```ts
// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// S3 is never reached: the router's storage getter hands out this fake.
const storage = vi.hoisted(() => ({
  presignUpload: vi.fn(),
  inspect: vi.fn(),
  signedGetUrl: vi.fn(),
  publicUrl: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/server/media/object-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/object-storage")>()),
  getObjectStorage: () => storage,
}));

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

const GB5 = 5 * 1024 ** 3;

describe.skipIf(!RUN_DB)("classroom hosted files [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    ownerId: string;
    authorId: string;
    memberId: string;
    memberAuthorId: string;
    outsiderId: string;
    communityId: string;
    communitySlug: string;
    membersOnlyId: number;
    publicId: number;
    memberCourseId: number;
  };
  let fx: Fixture;

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, { getPayloadClient }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
      ]);
    m = { db, schema, createCaller, payload: await getPayloadClient() };
  }, 120_000);

  async function createCourse(
    label: string,
    authorId: string,
    isPublic: boolean,
  ): Promise<number> {
    const course = await m.payload.create({
      collection: "courses",
      data: {
        title: `${label} ${fx.sfx}`,
        slug: `${label}-${fx.sfx}`,
        authorId,
        authorName: "Author",
        status: "published",
        communityId: fx.communityId,
        isPublic,
        enrollmentCount: 0,
      },
    });
    return course.id;
  }

  async function createMaterial(
    courseId: number,
    over: {
      visibility?: "members" | "preview";
      status?: "uploading" | "ready" | "failed";
      bytes?: number;
      title?: string;
      extension?: string;
      contentType?: string;
    } = {},
  ) {
    const uploadId = crypto.randomUUID();
    const extension = over.extension ?? "pdf";
    return m.payload.create({
      collection: "hosted-materials",
      data: {
        communityId: fx.communityId,
        course: courseId,
        uploaderId: fx.authorId,
        kind: "file",
        status: over.status ?? "ready",
        title: over.title ?? "Handout",
        visibility: over.visibility ?? "members",
        fileName: `Handout.${extension}`,
        extension,
        contentType: over.contentType ?? "application/pdf",
        bytes: over.bytes ?? 1000,
        storageKey: `private/classroom/${fx.communityId}/${courseId}/${uploadId}.${extension}`,
        uploadId,
      },
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    storage.presignUpload.mockImplementation(async ({ key }: { key: string }) => ({
      url: "https://s3.test/",
      fields: { key },
    }));
    storage.signedGetUrl.mockResolvedValue("https://signed.test/file");
    storage.remove.mockResolvedValue(undefined);

    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ids = {
      ownerId: `hf-owner-${sfx}`,
      authorId: `hf-author-${sfx}`,
      memberId: `hf-member-${sfx}`,
      memberAuthorId: `hf-member-author-${sfx}`,
      outsiderId: `hf-outsider-${sfx}`,
    };
    await m.db.insert(m.schema.user).values(
      Object.values(ids).map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Files ${sfx}`,
        slug: `files-${sfx}`,
        createdBy: ids.ownerId,
      })
      .returning();
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: community!.id, userId: ids.ownerId, role: "owner" },
      { communityId: community!.id, userId: ids.authorId, role: "admin" },
      { communityId: community!.id, userId: ids.memberId, role: "member" },
      {
        communityId: community!.id,
        userId: ids.memberAuthorId,
        role: "member",
      },
    ]);
    fx = {
      sfx,
      ...ids,
      communityId: community!.id,
      communitySlug: community!.slug,
      membersOnlyId: 0,
      publicId: 0,
      memberCourseId: 0,
    };
    fx.membersOnlyId = await createCourse("members-only", ids.authorId, false);
    fx.publicId = await createCourse("public", ids.authorId, true);
    fx.memberCourseId = await createCourse(
      "member-course",
      ids.memberAuthorId,
      false,
    );
  });

  afterEach(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    const courseIds = [fx.membersOnlyId, fx.publicId, fx.memberCourseId];
    await m.payload.delete({
      collection: "hosted-materials",
      where: { communityId: { equals: fx.communityId } },
    });
    await m.payload.delete({
      collection: "courses",
      where: { id: { in: courseIds } },
    });
    const userIds = [
      fx.ownerId,
      fx.authorId,
      fx.memberId,
      fx.memberAuthorId,
      fx.outsiderId,
    ];
    await m.db
      .delete(m.schema.activityEvents)
      .where(inArray(m.schema.activityEvents.actorId, userIds));
    await m.db
      .delete(m.schema.communityMemberships)
      .where(eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(eq(m.schema.communities.id, fx.communityId));
    for (const id of userIds) {
      await m.db.delete(m.schema.user).where(eq(m.schema.user.id, id));
    }
  });

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: userId ? ({ user: { id: userId }, session: {} } as never) : null,
    });
  }

  it("the author starts an upload: a record, then a grant pinned to its key, type and size", async () => {
    const grant = await callerAs(
      fx.authorId,
    ).classroomMaterials.startFileUpload({
      courseId: fx.membersOnlyId,
      fileName: "Week 1 slides.PDF",
      bytes: 2048,
    });
    expect(grant.contentType).toBe("application/pdf");
    expect(storage.presignUpload).toHaveBeenCalledTimes(1);
    const call = storage.presignUpload.mock.calls[0]![0] as {
      key: string;
      contentType: string;
      maxBytes: number;
    };
    expect(call.key).toMatch(
      new RegExp(
        `^private/classroom/${fx.communityId}/${fx.membersOnlyId}/[0-9a-f-]{36}\\.pdf$`,
      ),
    );
    expect(call).toMatchObject({
      contentType: "application/pdf",
      maxBytes: 2048,
    });
    const saved = await m.payload.findByID({
      collection: "hosted-materials",
      id: grant.materialId,
      depth: 0,
    });
    expect(saved).toMatchObject({
      status: "uploading",
      title: "Week 1 slides",
      visibility: "members",
      extension: "pdf",
      bytes: 2048,
      uploaderId: fx.authorId,
      communityId: fx.communityId,
      course: fx.membersOnlyId,
      storageKey: call.key,
    });
  });

  it("finishing checks the stored object and marks the file ready", async () => {
    const author = callerAs(fx.authorId);
    const grant = await author.classroomMaterials.startFileUpload({
      courseId: fx.membersOnlyId,
      fileName: "Workbook.docx",
      bytes: 2048,
    });
    storage.inspect.mockResolvedValue({
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: 2000,
    });
    await expect(
      author.classroomMaterials.finishFileUpload({
        materialId: grant.materialId,
      }),
    ).resolves.toMatchObject({
      id: grant.materialId,
      status: "ready",
      bytes: 2000,
    });
    const key = (storage.presignUpload.mock.calls[0]![0] as { key: string })
      .key;
    expect(storage.inspect).toHaveBeenCalledWith(key);
  });

  it("owners and admins only by default; after the owner opens uploads, a member author may upload", async () => {
    const memberAuthor = callerAs(fx.memberAuthorId);
    const start = () =>
      memberAuthor.classroomMaterials.startFileUpload({
        courseId: fx.memberCourseId,
        fileName: "a.pdf",
        bytes: 10,
      });
    await expect(start()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "UPLOADS_NOT_ALLOWED",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();

    await callerAs(fx.ownerId).communities.updateSettings({
      slug: fx.communitySlug,
      classroomUploadPolicy: "all_members",
    });
    await expect(start()).resolves.toMatchObject({
      contentType: "application/pdf",
    });
  });

  it("nobody uploads into a course they did not write", async () => {
    await expect(
      callerAs(fx.memberId).classroomMaterials.startFileUpload({
        courseId: fx.membersOnlyId,
        fileName: "a.pdf",
        bytes: 10,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an upload that would go past the storage allowance", async () => {
    await createMaterial(fx.membersOnlyId, { bytes: GB5 - 100 });
    const start = (bytes: number) =>
      callerAs(fx.authorId).classroomMaterials.startFileUpload({
        courseId: fx.membersOnlyId,
        fileName: "a.pdf",
        bytes,
      });
    await expect(start(101)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "STORAGE_FULL",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();
    await expect(start(100)).resolves.toMatchObject({
      contentType: "application/pdf",
    });
  });

  it("usage counts uploading and ready files, not failed ones, for owners and admins only", async () => {
    await createMaterial(fx.membersOnlyId, { bytes: 1000 });
    await createMaterial(fx.publicId, { bytes: 500, status: "uploading" });
    await createMaterial(fx.membersOnlyId, { bytes: 9999, status: "failed" });
    for (const id of [fx.ownerId, fx.authorId]) {
      await expect(
        callerAs(id).classroomMaterials.usage({ slug: fx.communitySlug }),
      ).resolves.toEqual({ fileBytesStored: 1500, fileBytesAllowed: GB5 });
    }
    await expect(
      callerAs(fx.memberId).classroomMaterials.usage({
        slug: fx.communitySlug,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("download links: members of a members-only course; visitors of a public course only for free-preview files", async () => {
    const file = await createMaterial(fx.membersOnlyId, { title: "Handout" });
    await expect(
      callerAs(fx.memberId).classroomMaterials.fileLink({
        materialId: file.id,
        disposition: "attachment",
      }),
    ).resolves.toEqual({ url: "https://signed.test/file" });
    expect(storage.signedGetUrl).toHaveBeenLastCalledWith(file.storageKey, {
      downloadName: "Handout.pdf",
      disposition: "attachment",
      contentType: "application/pdf",
    });
    for (const viewer of [fx.outsiderId, null]) {
      await expect(
        callerAs(viewer).classroomMaterials.fileLink({
          materialId: file.id,
          disposition: "attachment",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }

    const membersFile = await createMaterial(fx.publicId, {
      visibility: "members",
    });
    const previewFile = await createMaterial(fx.publicId, {
      visibility: "preview",
    });
    await expect(
      callerAs(null).classroomMaterials.fileLink({
        materialId: membersFile.id,
        disposition: "attachment",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerAs(null).classroomMaterials.fileLink({
        materialId: previewFile.id,
        disposition: "inline",
      }),
    ).resolves.toEqual({ url: "https://signed.test/file" });
    expect(storage.signedGetUrl).toHaveBeenLastCalledWith(
      previewFile.storageKey,
      {
        downloadName: "Handout.pdf",
        disposition: "inline",
        contentType: "application/pdf",
      },
    );
  });

  it("never links a file still uploading, and never shows a ZIP inline", async () => {
    const member = callerAs(fx.memberId);
    const uploading = await createMaterial(fx.membersOnlyId, {
      status: "uploading",
    });
    await expect(
      member.classroomMaterials.fileLink({
        materialId: uploading.id,
        disposition: "attachment",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const zip = await createMaterial(fx.membersOnlyId, {
      extension: "zip",
      contentType: "application/zip",
    });
    await expect(
      member.classroomMaterials.fileLink({
        materialId: zip.id,
        disposition: "inline",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("the author lists, renames, shares and deletes course files; nobody else may", async () => {
    const file = await createMaterial(fx.membersOnlyId, { title: "Old name" });
    await expect(
      callerAs(fx.memberId).classroomMaterials.listCourseMaterials({
        courseId: fx.membersOnlyId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const author = callerAs(fx.authorId);
    await author.classroomMaterials.updateMaterial({
      materialId: file.id,
      title: "  New name ",
      visibility: "preview",
    });
    const list = await author.classroomMaterials.listCourseMaterials({
      courseId: fx.membersOnlyId,
    });
    expect(list).toEqual([
      expect.objectContaining({
        id: file.id,
        title: "New name",
        visibility: "preview",
        status: "ready",
      }),
    ]);
    expect(list[0]).not.toHaveProperty("storageKey");

    await author.classroomMaterials.deleteMaterial({ materialId: file.id });
    expect(storage.remove).toHaveBeenCalledWith([file.storageKey]);
    await expect(
      author.classroomMaterials.listCourseMaterials({
        courseId: fx.membersOnlyId,
      }),
    ).resolves.toEqual([]);
  });
});
```

- [ ] **Step 10: Run the DB tests**

Run: `bash /Users/greg/coding-projects/aitcom/.claude/worktrees/classroom-hosted-files/dbtest.sh src/server/api/routers/classroom-materials.integration.test.ts`
Expected: PASS, 9 tests executed (not skipped).

- [ ] **Step 11: Verify and commit**

Run:
```bash
pnpm vitest run src/lib/classroom src/server/classroom src/server/media src/server/api/routers/feed-reels.test.ts src/server/api/routers/feed-post-writes.test.ts src/server/api/routers/feed-reports.test.ts src/server/api/routers/feed-visibility.test.ts
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
```
Expected: all PASS (the feed router tests build the root router, which now includes `classroomMaterials`), typecheck and lint clean.

```bash
pnpm exec prettier --write src/lib/classroom/material-access.ts src/lib/classroom/material-access.test.ts src/server/classroom/course-access.ts src/server/classroom/course-access.test.ts src/server/classroom/hosted-files.ts src/server/classroom/hosted-files.test.ts src/server/api/routers/classroom-materials.ts src/server/api/root.ts src/server/api/routers/classroom-materials.integration.test.ts
git branch --show-current
git add src/lib/classroom/material-access.ts src/lib/classroom/material-access.test.ts src/server/classroom/course-access.ts src/server/classroom/course-access.test.ts src/server/classroom/hosted-files.ts src/server/classroom/hosted-files.test.ts src/server/api/routers/classroom-materials.ts src/server/api/root.ts src/server/api/routers/classroom-materials.integration.test.ts
git diff --cached --stat
git commit -m "Classroom files: upload, check, link and manage course files

hosted-files.ts is the upload lifecycle: start checks the author, the
community's upload policy, the type, size, daily limit and storage
allowance, then records the upload and grants a presigned POST pinned to the
key, type and declared size. Finish checks what S3 stored and marks the file
ready, or deletes it and marks it failed. File links follow one access rule
(material-access.ts): members get every file, visitors of a public course
only free-preview files. The new classroomMaterials router is a thin shell."
```

---
### Task 5: `HostedFile` lesson block — server check on save and the read-time manifest

**Files:**
- Modify: `src/lib/classroom/lesson-body.ts` (whole file replaced; existing exports unchanged except `stripEmptyEmbeds` → `stripIncompleteMaterials`)
- Modify: `src/lib/classroom/lesson-body.test.ts` (rename + new imports + appended tests)
- Modify: `src/components/classroom/lesson-editor.tsx` (rename only: line 12 import, lines 293 and 395 calls)
- Modify: `src/collections/Lessons.ts:31-73` (new block)
- Create: `src/server/classroom/lesson-materials.ts`
- Test: `src/server/classroom/lesson-materials.test.ts`
- Modify: `src/server/api/routers/classrooms.ts` (imports near line 40; `addLesson` ~line 547; `updateLesson` ~line 632; `get` ~lines 355–372)
- Test: `src/server/api/routers/classroom-lesson-materials.integration.test.ts`

**Interfaces:**
- Consumes: Task 4 `buildMaterialsManifest`, `MaterialViewer`, `MaterialsManifest`, `mayUploadMaterials`.
- Produces (`@/lib/classroom/lesson-body`):
  ```ts
  export type HostedFileBlockNode = { type: "block"; version: 2; format: ""; fields: { id: string; blockName: ""; blockType: "HostedFile"; materialId: number } };
  export function hostedFileBlockNode(materialId: number, id: string): HostedFileBlockNode;
  export function isMaterialId(value: unknown): value is number;   // positive safe integer
  export function collectMaterialIds(body: unknown): number[];      // malformed → 0; repeats kept
  export function stripIncompleteMaterials(body: unknown): unknown; // replaces stripEmptyEmbeds
  ```
  (`embedBlockNode`, `collectEmbedUrls`, `invalidEmbedUrls`, `prependEmbedBlock`, `planYoutubeMigration`, `EmbedBlockNode`, `YoutubeMigrationStep` unchanged.)
- Produces (`@/server/classroom/lesson-materials`):
  ```ts
  export function assertLessonMaterials(payload: Payload, courseId: number, body: unknown): Promise<void>;
  export function loadMaterialsManifest(payload: Payload, input: { courseId: number; bodies: readonly unknown[]; viewer: MaterialViewer }): Promise<MaterialsManifest>;
  ```
- Produces (`classrooms.get` output): adds `materials: MaterialsManifest` and `viewerCanUpload: boolean`. `addLesson`/`updateLesson` refuse with BAD_REQUEST `INVALID_MATERIAL`.

- [ ] **Step 1: Rename the strip helper everywhere and update the test imports**

Run:
```bash
sed -i '' 's/stripEmptyEmbeds/stripIncompleteMaterials/g' src/lib/classroom/lesson-body.test.ts src/components/classroom/lesson-editor.tsx
grep -rn "stripEmptyEmbeds" src
```
Expected: the `grep` prints only lines in `src/lib/classroom/lesson-body.ts` (the definition, replaced in Step 3).

In `src/lib/classroom/lesson-body.test.ts` replace the two import statements at the top (lines 1–9) with:

```ts
import { describe, expect, it } from "vitest";
import {
  collectEmbedUrls,
  collectMaterialIds,
  embedBlockNode,
  hostedFileBlockNode,
  invalidEmbedUrls,
  isMaterialId,
  planYoutubeMigration,
  prependEmbedBlock,
  stripIncompleteMaterials,
} from "./lesson-body";
```

- [ ] **Step 2: Write the failing lesson-body tests**

Append to the end of `src/lib/classroom/lesson-body.test.ts`:

```ts

describe("hostedFileBlockNode / collectMaterialIds", () => {
  it("builds the stored Payload block shape", () => {
    expect(hostedFileBlockNode(42, "abc123abc123")).toEqual({
      type: "block",
      version: 2,
      format: "",
      fields: {
        id: "abc123abc123",
        blockName: "",
        blockType: "HostedFile",
        materialId: 42,
      },
    });
  });

  it("finds file ids at any depth, in order, and ignores other blocks", () => {
    const body = root([
      para("intro"),
      hostedFileBlockNode(5, "a"),
      embedBlockNode(YT, "b"),
      {
        type: "list",
        children: [
          {
            type: "listitem",
            children: [hostedFileBlockNode(9, "c"), hostedFileBlockNode(5, "d")],
          },
        ],
      },
    ]);
    expect(collectMaterialIds(body)).toEqual([5, 9, 5]);
    expect(collectEmbedUrls(body)).toEqual([YT]);
  });

  it.each([
    ["a string id", "12"],
    ["zero", 0],
    ["a negative id", -1],
    ["a fraction", 1.5],
    ["no id", undefined],
  ])("turns %s into 0", (_label, materialId) => {
    const body = root([
      { type: "block", fields: { blockType: "HostedFile", materialId } },
    ]);
    expect(collectMaterialIds(body)).toEqual([0]);
  });

  it("reads a JSON string body and tolerates junk", () => {
    expect(
      collectMaterialIds(JSON.stringify(root([hostedFileBlockNode(3, "a")]))),
    ).toEqual([3]);
    for (const junk of [null, undefined, "", "not json", 42, {}, { root: {} }]) {
      expect(collectMaterialIds(junk)).toEqual([]);
    }
  });

  it("knows a usable id", () => {
    expect(isMaterialId(1)).toBe(true);
    expect(isMaterialId(0)).toBe(false);
    expect(isMaterialId("1")).toBe(false);
    expect(isMaterialId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});

describe("stripIncompleteMaterials: HostedFile blocks", () => {
  const noFile = {
    type: "block",
    version: 2,
    format: "",
    fields: { id: "x", blockName: "", blockType: "HostedFile", materialId: 0 },
  };

  it("drops file blocks that never got a file, at any depth, and keeps the rest", () => {
    const body = root([
      hostedFileBlockNode(7, "a"),
      noFile,
      {
        type: "list",
        children: [{ type: "listitem", children: [noFile, para("item")] }],
      },
    ]);
    expect(stripIncompleteMaterials(body)).toEqual(
      root([
        hostedFileBlockNode(7, "a"),
        {
          type: "list",
          children: [{ type: "listitem", children: [para("item")] }],
        },
      ]),
    );
  });
});
```

Run: `pnpm vitest run src/lib/classroom/lesson-body.test.ts`
Expected: FAIL. `hostedFileBlockNode`, `collectMaterialIds`, `isMaterialId`, `stripIncompleteMaterials` are not exported.

- [ ] **Step 3: Rewrite `lesson-body.ts` around one block walker**

Replace the whole of `src/lib/classroom/lesson-body.ts` with:

```ts
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
```

Run: `pnpm vitest run src/lib/classroom/lesson-body.test.ts src/migrations/lesson-youtube-to-embed.integration.test.ts`
Expected: PASS — every existing Embed test (now through the shared walker) and the new HostedFile tests. (The migration integration file is skipped without the DB env; it is run with the DB in Step 9.)

- [ ] **Step 4: Add the `HostedFile` block to lessons**

In `src/collections/Lessons.ts`, directly after the `EmbedBlock` constant (ends line 34) add:

```ts

const HostedFileBlock: Block = {
  slug: "HostedFile",
  fields: [{ name: "materialId", type: "number", required: true }],
};
```

and change the `blocks: [ … ]` list to:

```ts
            blocks: [
              CodeBlock({ languages: codeLanguages }),
              ImageBlock,
              EmbedBlock,
              HostedFileBlock,
            ],
```

Run the type generator (it only reads the config):
```bash
set +eu; set -a; . /Users/greg/coding-projects/aitcom/.env.docker >/dev/null 2>&1; set +a; unset PAYLOAD_PUSH; SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test npx payload generate:types
git diff --stat -- src/payload-types.ts
```
Expected: no change (rich-text blocks are not typed in `payload-types.ts`). If it does change, keep only the `HostedFile` hunk.

- [ ] **Step 5: Write the failing lesson-materials test**

`src/server/classroom/lesson-materials.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { hostedFileBlockNode } from "@/lib/classroom/lesson-body";

import {
  assertLessonMaterials,
  loadMaterialsManifest,
} from "./lesson-materials";

const root = (children: unknown[]) => ({
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children,
  },
});
const withFiles = (...ids: number[]) =>
  root(ids.map((id, i) => hostedFileBlockNode(id, `block${i}`)));
const para = {
  type: "paragraph",
  version: 1,
  children: [{ type: "text", version: 1, text: "notes" }],
};

function payloadFinding(docs: unknown[]) {
  return { find: vi.fn().mockResolvedValue({ docs }) };
}

describe("assertLessonMaterials", () => {
  it("does nothing for a body without file blocks", async () => {
    const payload = payloadFinding([]);
    for (const body of [undefined, null, root([para])]) {
      await expect(
        assertLessonMaterials(payload as never, 12, body),
      ).resolves.toBeUndefined();
    }
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("refuses a file block without a usable id, without asking the database", async () => {
    const payload = payloadFinding([]);
    await expect(
      assertLessonMaterials(payload as never, 12, withFiles(5, 0)),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("refuses a file that belongs to another course", async () => {
    const payload = payloadFinding([{ id: 6 }]);
    await expect(
      assertLessonMaterials(payload as never, 12, withFiles(5, 6, 5)),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });
    expect(payload.find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [{ id: { in: [5, 6] } }, { course: { not_equals: 12 } }],
      },
      limit: 1,
      depth: 0,
    });
  });

  it("accepts this course's files and files that were since deleted", async () => {
    await expect(
      assertLessonMaterials(payloadFinding([]) as never, 12, withFiles(5, 99)),
    ).resolves.toBeUndefined();
  });
});

describe("loadMaterialsManifest", () => {
  const file = (id: number, visibility: "members" | "preview") => ({
    id,
    kind: "file",
    title: `File ${id}`,
    extension: "pdf",
    contentType: "application/pdf",
    bytes: 100,
    status: "ready",
    visibility,
    storageKey: `private/classroom/c/12/${id}.pdf`,
  });

  it("looks up only this course's files and describes every referenced id", async () => {
    const payload = payloadFinding([file(5, "members"), file(6, "preview")]);
    const manifest = await loadMaterialsManifest(payload as never, {
      courseId: 12,
      bodies: [withFiles(5, 6), null, withFiles(5, 99)],
      viewer: "visitor",
    });
    expect(payload.find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [{ id: { in: [5, 6, 99] } }, { course: { equals: 12 } }],
      },
      pagination: false,
      depth: 0,
    });
    expect(manifest[5]).toMatchObject({ access: "join", title: "File 5" });
    expect(manifest[6]).toMatchObject({ access: "download", title: "File 6" });
    expect(manifest[99]).toEqual({ access: "removed" });
    expect(JSON.stringify(manifest)).not.toContain("private/classroom");
  });

  it("skips the lookup when no lesson uses a file", async () => {
    const payload = payloadFinding([]);
    await expect(
      loadMaterialsManifest(payload as never, {
        courseId: 12,
        bodies: [root([para]), null],
        viewer: "member",
      }),
    ).resolves.toEqual({});
    expect(payload.find).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm vitest run src/server/classroom/lesson-materials.test.ts`
Expected: FAIL. `./lesson-materials` cannot be resolved.

- [ ] **Step 6: Write `lesson-materials.ts`**

`src/server/classroom/lesson-materials.ts`:

```ts
import { TRPCError } from "@trpc/server";

import { collectMaterialIds, isMaterialId } from "@/lib/classroom/lesson-body";
import {
  buildMaterialsManifest,
  type MaterialViewer,
  type MaterialsManifest,
} from "@/lib/classroom/material-access";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * Where lesson bodies meet hosted materials (spec 2026-09-27 §3.2–3.3).
 */

/**
 * Every HostedFile block must carry a usable id, and no id may belong to a
 * different course: otherwise a public course's lesson could point at
 * another course's members-only file. An id that no longer exists is
 * allowed — the author deleted that file, and the lesson shows it as
 * removed — so deleting a file never makes its lessons unsaveable.
 */
export async function assertLessonMaterials(
  payload: Payload,
  courseId: number,
  body: unknown,
): Promise<void> {
  if (body === undefined || body === null) return;
  const ids = collectMaterialIds(body);
  if (ids.length === 0) return;
  if (!ids.every(isMaterialId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });
  }
  const { docs } = await payload.find({
    collection: "hosted-materials",
    where: {
      and: [
        { id: { in: [...new Set(ids)] } },
        { course: { not_equals: courseId } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  if (docs.length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });
  }
}

/**
 * The read-time manifest for a course's lessons: one summary per referenced
 * file, as this viewer may see it. Only the course's own files are looked
 * up, so a crafted id can never surface another course's file. No links:
 * the lesson asks for one only when a file is opened.
 */
export async function loadMaterialsManifest(
  payload: Payload,
  input: {
    courseId: number;
    bodies: readonly unknown[];
    viewer: MaterialViewer;
  },
): Promise<MaterialsManifest> {
  const ids = [
    ...new Set(input.bodies.flatMap((body) => collectMaterialIds(body))),
  ].filter(isMaterialId);
  if (ids.length === 0) return {};
  const { docs } = await payload.find({
    collection: "hosted-materials",
    where: {
      and: [{ id: { in: ids } }, { course: { equals: input.courseId } }],
    },
    pagination: false,
    depth: 0,
  });
  return buildMaterialsManifest(ids, docs, input.viewer);
}
```

Run: `pnpm vitest run src/server/classroom/lesson-materials.test.ts`
Expected: PASS.

- [ ] **Step 7: Check bodies on save and return the manifest from `classrooms.get`**

In `src/server/api/routers/classrooms.ts`:

1. Directly after `import { invalidEmbedUrls } from "@/lib/classroom/lesson-body";` add:

```ts
import { mayUploadMaterials } from "@/server/classroom/hosted-files";
import {
  assertLessonMaterials,
  loadMaterialsManifest,
} from "@/server/classroom/lesson-materials";
```

2. In `addLesson`, replace:

```ts
      assertLessonBodyEmbeds(input.body);
      const lesson = await payload.create({
```

with:

```ts
      assertLessonBodyEmbeds(input.body);
      await assertLessonMaterials(payload, input.courseId, input.body);
      const lesson = await payload.create({
```

3. In `updateLesson`, replace:

```ts
      assertLessonBodyEmbeds(input.body);
      const data: Record<string, unknown> = {};
```

with:

```ts
      assertLessonBodyEmbeds(input.body);
      await assertLessonMaterials(payload, course.id, input.body);
      const data: Record<string, unknown> = {};
```

4. In `get`, replace:

```ts
      const safeLessons = isAuthor
        ? lessons
        : lessons.map((l) => ({ ...l, examQuestions: undefined }));
```

with:

```ts
      const safeLessons = isAuthor
        ? lessons
        : lessons.map((l) => ({ ...l, examQuestions: undefined }));

      // Hosted files used by any lesson, as this viewer may see them. No
      // links here: a file card asks for one only when it is used.
      const materials = await loadMaterialsManifest(payload, {
        courseId: course.id,
        bodies: lessons.map((l) => l.body),
        viewer: access,
      });
      const viewerCanUpload =
        userId && isAuthor
          ? await mayUploadMaterials(ctx.db, course.communityId, userId)
          : false;
```

and replace:

```ts
        certificateIssuedAt,
        passedCourse,
      };
```

with:

```ts
        certificateIssuedAt,
        passedCourse,
        materials,
        viewerCanUpload,
      };
```

Run: `SKIP_ENV_VALIDATION=1 pnpm typecheck`
Expected: clean. (`access` is already narrowed to `"visitor" | "member" | "manager"` by the `access === "none"` throw above it.)

- [ ] **Step 8: Write the DB integration test**

`src/server/api/routers/classroom-lesson-materials.integration.test.ts`:

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

describe.skipIf(!RUN_DB)("classroom lesson files [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
    hostedFileBlockNode: typeof import("@/lib/classroom/lesson-body").hostedFileBlockNode;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    authorId: string;
    memberId: string;
    communityId: string;
    publicCourse: { id: number; slug: string };
    otherCourse: { id: number; slug: string };
  };
  let fx: Fixture;

  const body = (children: unknown[]) => ({
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: null,
      children,
    },
  });
  const files = (...ids: number[]) =>
    body(ids.map((id, i) => m.hostedFileBlockNode(id, `abcdefabcd${10 + i}`)));

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
      db,
      schema,
      createCaller,
      payload: await getPayloadClient(),
      hostedFileBlockNode: lessonBody.hostedFileBlockNode,
    };
  }, 120_000);

  async function createCourse(label: string) {
    const course = await m.payload.create({
      collection: "courses",
      data: {
        title: `${label} ${fx.sfx}`,
        slug: `${label}-${fx.sfx}`,
        authorId: fx.authorId,
        authorName: "Author",
        status: "published",
        communityId: fx.communityId,
        isPublic: true,
        enrollmentCount: 0,
      },
    });
    return { id: course.id, slug: course.slug };
  }

  async function createMaterial(
    courseId: number,
    over: {
      visibility?: "members" | "preview";
      status?: "uploading" | "ready" | "failed";
      title?: string;
      bytes?: number;
    } = {},
  ) {
    const uploadId = crypto.randomUUID();
    return m.payload.create({
      collection: "hosted-materials",
      data: {
        communityId: fx.communityId,
        course: courseId,
        uploaderId: fx.authorId,
        kind: "file",
        status: over.status ?? "ready",
        title: over.title ?? "Handout",
        visibility: over.visibility ?? "members",
        fileName: "Handout.pdf",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: over.bytes ?? 1000,
        storageKey: `private/classroom/${fx.communityId}/${courseId}/${uploadId}.pdf`,
        uploadId,
      },
    });
  }

  beforeEach(async () => {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const authorId = `lf-author-${sfx}`;
    const memberId = `lf-member-${sfx}`;
    await m.db.insert(m.schema.user).values(
      [authorId, memberId].map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Lesson files ${sfx}`, slug: `lesson-files-${sfx}`, createdBy: authorId })
      .returning();
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: community!.id, userId: authorId, role: "admin" },
      { communityId: community!.id, userId: memberId, role: "member" },
    ]);
    fx = {
      sfx,
      authorId,
      memberId,
      communityId: community!.id,
      publicCourse: { id: 0, slug: "" },
      otherCourse: { id: 0, slug: "" },
    };
    fx.publicCourse = await createCourse("public");
    fx.otherCourse = await createCourse("other");
  });

  afterEach(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    const courseIds = [fx.publicCourse.id, fx.otherCourse.id];
    await m.payload.delete({
      collection: "lessons",
      where: { course: { in: courseIds } },
    });
    await m.payload.delete({
      collection: "hosted-materials",
      where: { communityId: { equals: fx.communityId } },
    });
    await m.payload.delete({
      collection: "courses",
      where: { id: { in: courseIds } },
    });
    await m.db
      .delete(m.schema.communityMemberships)
      .where(eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(eq(m.schema.communities.id, fx.communityId));
    await m.db
      .delete(m.schema.user)
      .where(inArray(m.schema.user.id, [fx.authorId, fx.memberId]));
  });

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: userId ? ({ user: { id: userId }, session: {} } as never) : null,
    });
  }

  it("saves a lesson whose files belong to its own course, and refuses another course's file", async () => {
    const author = callerAs(fx.authorId).classrooms;
    const own = await createMaterial(fx.publicCourse.id);
    const other = await createMaterial(fx.otherCourse.id, {
      visibility: "members",
    });

    await expect(
      author.addLesson({
        courseId: fx.publicCourse.id,
        title: "Ok",
        body: files(own.id),
      }),
    ).resolves.toMatchObject({ id: expect.any(Number) });
    await expect(
      author.addLesson({
        courseId: fx.publicCourse.id,
        title: "Bad",
        body: files(other.id),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });

    const { id } = await author.addLesson({
      courseId: fx.publicCourse.id,
      title: "Edit me",
    });
    await expect(
      author.updateLesson({ lessonId: id, body: files(own.id, other.id) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });
  });

  it("still saves a lesson that uses a file the author has since deleted", async () => {
    const gone = await createMaterial(fx.publicCourse.id);
    await m.payload.delete({ collection: "hosted-materials", id: gone.id });
    await expect(
      callerAs(fx.authorId).classrooms.addLesson({
        courseId: fx.publicCourse.id,
        title: "Still fine",
        body: files(gone.id),
      }),
    ).resolves.toMatchObject({ id: expect.any(Number) });
  });

  it("refuses a file block without a usable id", async () => {
    const bad = body([
      {
        type: "block",
        version: 2,
        format: "",
        fields: {
          id: "abcabcabcabc",
          blockName: "",
          blockType: "HostedFile",
          materialId: "12",
        },
      },
    ]);
    await expect(
      callerAs(fx.authorId).classrooms.addLesson({
        courseId: fx.publicCourse.id,
        title: "Bad id",
        body: bad,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });
  });

  it("classrooms.get: visitors get free-preview files and a join note for members files; the manifest never reaches another course", async () => {
    const membersFile = await createMaterial(fx.publicCourse.id, {
      visibility: "members",
      title: "Workbook",
      bytes: 4096,
    });
    const previewFile = await createMaterial(fx.publicCourse.id, {
      visibility: "preview",
      title: "Sample",
    });
    const uploading = await createMaterial(fx.publicCourse.id, {
      visibility: "preview",
      status: "uploading",
    });
    // Planted directly (bypassing the save check) to prove the read side
    // only ever looks inside the lesson's own course.
    const foreign = await createMaterial(fx.otherCourse.id, {
      visibility: "preview",
    });
    await m.payload.create({
      collection: "lessons",
      data: {
        course: fx.publicCourse.id,
        title: "Lesson one",
        order: 0,
        body: files(
          membersFile.id,
          previewFile.id,
          uploading.id,
          foreign.id,
          999_999_999,
        ),
      },
    });

    const visitor = await callerAs(null).classrooms.get({
      slug: fx.publicCourse.slug,
    });
    expect(visitor.materials[membersFile.id]).toEqual({
      access: "join",
      kind: "file",
      title: "Workbook",
      extension: "pdf",
      contentType: "application/pdf",
      bytes: 4096,
      status: "ready",
      visibility: "members",
    });
    expect(visitor.materials[previewFile.id]).toMatchObject({
      access: "download",
      title: "Sample",
    });
    expect(visitor.materials[uploading.id]).toMatchObject({
      access: "processing",
    });
    expect(visitor.materials[foreign.id]).toEqual({ access: "removed" });
    expect(visitor.materials[999_999_999]).toEqual({ access: "removed" });
    expect(JSON.stringify(visitor.materials)).not.toContain("private/classroom");
    expect(visitor.viewerCanUpload).toBe(false);

    const member = await callerAs(fx.memberId).classrooms.get({
      slug: fx.publicCourse.slug,
    });
    expect(member.materials[membersFile.id]).toMatchObject({
      access: "download",
    });
    expect(member.viewerCanUpload).toBe(false);

    const author = await callerAs(fx.authorId).classrooms.get({
      slug: fx.publicCourse.slug,
    });
    expect(author.viewerCanUpload).toBe(true);
  });
});
```

- [ ] **Step 9: Run the DB tests**

Run: `bash /Users/greg/coding-projects/aitcom/.claude/worktrees/classroom-hosted-files/dbtest.sh src/server/api/routers/classroom-lesson-materials.integration.test.ts src/server/api/routers/classroom-lessons.integration.test.ts src/server/api/routers/classroom-access.integration.test.ts src/migrations/lesson-youtube-to-embed.integration.test.ts`
Expected: PASS; all four files executed (the new file runs 4 tests).

- [ ] **Step 10: Verify and commit**

Run:
```bash
pnpm vitest run src/lib/classroom src/server/classroom src/components/classroom
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
```
Expected: all PASS, clean.

```bash
pnpm exec prettier --write src/lib/classroom/lesson-body.ts src/lib/classroom/lesson-body.test.ts src/components/classroom/lesson-editor.tsx src/collections/Lessons.ts src/server/classroom/lesson-materials.ts src/server/classroom/lesson-materials.test.ts src/server/api/routers/classrooms.ts src/server/api/routers/classroom-lesson-materials.integration.test.ts
git branch --show-current
git add src/lib/classroom/lesson-body.ts src/lib/classroom/lesson-body.test.ts src/components/classroom/lesson-editor.tsx src/collections/Lessons.ts src/server/classroom/lesson-materials.ts src/server/classroom/lesson-materials.test.ts src/server/api/routers/classrooms.ts src/server/api/routers/classroom-lesson-materials.integration.test.ts
git diff --cached --stat
git commit -m "Classroom files: HostedFile lesson block, checked on save, described at read time

A lesson body stores a file as a HostedFile block holding only its id.
Saving refuses a block without a usable id or one pointing at another
course's file; a file deleted since still saves and shows as removed.
classrooms.get returns a manifest of the files its lessons use, as the
viewer may see them (download, join, processing, failed, removed), with no
links, plus whether the viewer may upload. lesson-body.ts now has one block
walker shared by the Embed and HostedFile helpers."
```

---
### Task 6: Show hosted files in lessons

**Files:**
- Create: `src/components/classroom/materials/materials-context.tsx`
- Create: `src/components/classroom/materials/file-type-icon.tsx`
- Create: `src/components/classroom/materials/start-download.ts`
- Create: `src/components/classroom/materials/hosted-file-card.tsx`
- Test: `src/components/classroom/materials/hosted-file-card.test.tsx`
- Modify: `src/components/classroom/materials/block-renderers.tsx` (whole file)
- Modify: `src/components/classroom/course-view.tsx` (import near line 15; body render at lines 511–516)
- Modify: `messages/en.json`, `messages/nl.json` (new `classroom.files` object)

**Interfaces:**
- Consumes: Task 4 `MaterialSummary`, `MaterialsManifest`; Task 2 `fileTypeLabel`, `formatBytes`, `isInlinePreviewable`; Task 5 `isMaterialId`; tRPC `classroomMaterials.fileLink` (query, `{ materialId, disposition }` → `{ url }`); `classrooms.get().materials`.
- Produces:
  ```ts
  // materials-context.tsx
  export function MaterialsManifestProvider(props: { manifest: MaterialsManifest; children: ReactNode }): JSX.Element;
  export function useMaterialSummary(materialId: number): MaterialSummary; // unknown id → { access: "removed" }
  // file-type-icon.tsx
  export function FileTypeIcon(props: { extension: string; className?: string }): JSX.Element;
  // start-download.ts
  export function startDownload(url: string): void;
  // hosted-file-card.tsx
  export function HostedFileCard(props: { materialId: number }): JSX.Element;
  ```
  `classroomBlockRenderers.HostedFile` renders `HostedFileCard` for a usable id.

- [ ] **Step 1: Add the strings (en + nl)**

Run from `WS`:

```bash
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
const add = {
  en: {
    download: "Download",
    downloadFailed: "The download didn't start. Please try again.",
    previewTitle: "Preview of {title}",
    join: "Join the community to download this file.",
    removed: "This file was removed.",
    processing: "This file is still uploading.",
    failed: "This file didn't upload correctly.",
  },
  nl: {
    download: "Downloaden",
    downloadFailed: "Het downloaden is niet gestart. Probeer het opnieuw.",
    previewTitle: "Voorbeeld van {title}",
    join: "Word lid van de community om dit bestand te downloaden.",
    removed: "Dit bestand is verwijderd.",
    processing: "Dit bestand wordt nog geüpload.",
    failed: "Dit bestand is niet goed geüpload.",
  },
};
for (const locale of ["en", "nl"]) {
  const path = `messages/${locale}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.classroom.files = { ...(json.classroom.files ?? {}), ...add[locale] };
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}
EOF
node scripts/check-i18n-parity.mjs
git diff --stat -- messages/
```
Expected: `i18n parity OK — …`; the diff touches only the two catalogs, each gaining the `files` block at the end of `classroom`.

- [ ] **Step 2: Write the failing card test**

`src/components/classroom/materials/hosted-file-card.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import type { MaterialsManifest } from "@/lib/classroom/material-access";

const m = vi.hoisted(() => ({
  fetchLink: vi.fn(),
  useLinkQuery: vi.fn(),
  startDownload: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      classroomMaterials: { fileLink: { fetch: m.fetchLink } },
    }),
    classroomMaterials: { fileLink: { useQuery: m.useLinkQuery } },
  },
}));
vi.mock("./start-download", () => ({ startDownload: m.startDownload }));
vi.mock("sonner", () => ({ toast: { error: m.toastError } }));

import { LexicalRenderer } from "@/lib/lexical";
import { hostedFileBlockNode } from "@/lib/classroom/lesson-body";
import { classroomBlockRenderers } from "./block-renderers";
import { HostedFileCard } from "./hosted-file-card";
import { MaterialsManifestProvider } from "./materials-context";

const files = en.classroom.files;

const summary = (over: Record<string, unknown> = {}) =>
  ({
    access: "download",
    kind: "file",
    title: "Workbook",
    extension: "docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: 1536,
    status: "ready",
    visibility: "members",
    ...over,
  }) as MaterialsManifest[number];

function renderCard(manifest: MaterialsManifest, materialId = 5) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MaterialsManifestProvider manifest={manifest}>
        <HostedFileCard materialId={materialId} />
      </MaterialsManifestProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.useLinkQuery.mockReturnValue({ data: undefined });
  m.fetchLink.mockResolvedValue({ url: "https://signed.test/f" });
});

describe("HostedFileCard", () => {
  it("shows title, type and size, and downloads through a fresh link", async () => {
    renderCard({ 5: summary() });
    expect(screen.getByText("Workbook")).toBeInTheDocument();
    expect(screen.getByText("DOCX · 1.5 KB")).toBeInTheDocument();
    expect(m.fetchLink).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: files.download }));
    await waitFor(() =>
      expect(m.startDownload).toHaveBeenCalledWith("https://signed.test/f"),
    );
    expect(m.fetchLink).toHaveBeenCalledWith({
      materialId: 5,
      disposition: "attachment",
    });
    expect(m.useLinkQuery).not.toHaveBeenCalled();
  });

  it("says so when the download link can't be fetched", async () => {
    m.fetchLink.mockRejectedValue(new Error("NOT_FOUND"));
    renderCard({ 5: summary() });
    fireEvent.click(screen.getByRole("button", { name: files.download }));
    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(files.downloadFailed),
    );
    expect(m.startDownload).not.toHaveBeenCalled();
  });

  it("previews a PDF from an inline link", () => {
    m.useLinkQuery.mockReturnValue({
      data: { url: "https://signed.test/inline" },
    });
    renderCard({
      5: summary({ extension: "pdf", contentType: "application/pdf" }),
    });
    expect(m.useLinkQuery).toHaveBeenCalledWith(
      { materialId: 5, disposition: "inline" },
      expect.objectContaining({ staleTime: expect.any(Number) }),
    );
    const frame = screen.getByTitle("Preview of Workbook");
    expect(frame.getAttribute("src")).toBe("https://signed.test/inline");
  });

  it("tells a visitor to join for a members-only file, with no download", () => {
    renderCard({ 5: summary({ access: "join", extension: "pdf" }) });
    expect(screen.getByText(files.join)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: files.download })).toBeNull();
    expect(m.useLinkQuery).not.toHaveBeenCalled();
  });

  it.each([
    ["processing", files.processing],
    ["failed", files.failed],
  ])("shows a %s note instead of a download", (access, text) => {
    renderCard({ 5: summary({ access }) });
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: files.download })).toBeNull();
  });

  it("says a deleted file was removed", () => {
    renderCard({});
    expect(screen.getByText(files.removed)).toBeInTheDocument();
  });
});

describe("classroom block renderers: HostedFile", () => {
  it("renders a card only for a usable file id", () => {
    expect(classroomBlockRenderers.HostedFile!({ materialId: 5 })).not.toBeNull();
    expect(classroomBlockRenderers.HostedFile!({ materialId: "5" })).toBeNull();
    expect(classroomBlockRenderers.HostedFile!({ materialId: 0 })).toBeNull();
  });

  it("shows the file inside a rendered lesson body", () => {
    const body = {
      root: {
        type: "root",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        children: [hostedFileBlockNode(5, "abcabcabcabc")],
      },
    };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MaterialsManifestProvider manifest={{ 5: summary() }}>
          <LexicalRenderer
            content={body}
            blockRenderers={classroomBlockRenderers}
          />
        </MaterialsManifestProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Workbook")).toBeInTheDocument();
  });
});
```

Run: `pnpm vitest run src/components/classroom/materials/hosted-file-card.test.tsx`
Expected: FAIL. `./hosted-file-card` and `./materials-context` cannot be resolved.

- [ ] **Step 3: Write the context, icon and download seam**

`src/components/classroom/materials/materials-context.tsx`:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

import type {
  MaterialSummary,
  MaterialsManifest,
} from "@/lib/classroom/material-access";

const EMPTY: MaterialsManifest = {};
const REMOVED: MaterialSummary = { access: "removed" };

const ManifestContext = createContext<MaterialsManifest>(EMPTY);

/**
 * The course's materials manifest from `classrooms.get`, for the lesson
 * body's block renderers (which only receive a block's own fields).
 */
export function MaterialsManifestProvider({
  manifest,
  children,
}: {
  manifest: MaterialsManifest;
  children: ReactNode;
}) {
  return (
    <ManifestContext.Provider value={manifest}>
      {children}
    </ManifestContext.Provider>
  );
}

/** One file's summary; a file the manifest doesn't know is shown as removed. */
export function useMaterialSummary(materialId: number): MaterialSummary {
  return useContext(ManifestContext)[materialId] ?? REMOVED;
}
```

`src/components/classroom/materials/file-type-icon.tsx`:

```tsx
import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Presentation,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  ppt: Presentation,
  pptx: Presentation,
  key: Presentation,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  zip: FileArchive,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  webp: FileImage,
};

/** A decorative icon for a file's type. */
export function FileTypeIcon({
  extension,
  className,
}: {
  extension: string;
  className?: string;
}) {
  const Icon = ICONS[extension] ?? FileIcon;
  return <Icon className={className} aria-hidden="true" />;
}
```

`src/components/classroom/materials/start-download.ts`:

```ts
/**
 * Send the browser to a signed download link. S3 answers with
 * Content-Disposition: attachment, so the page stays where it is. A separate
 * module so tests can assert the exact link a click hands over.
 */
export function startDownload(url: string): void {
  window.location.assign(url);
}
```

- [ ] **Step 4: Write the card and the renderer**

`src/components/classroom/materials/hosted-file-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { MaterialSummary } from "@/lib/classroom/material-access";
import {
  fileTypeLabel,
  formatBytes,
  isInlinePreviewable,
} from "@/lib/classroom/material-rules";
import { api } from "@/trpc/react";
import { FileTypeIcon } from "./file-type-icon";
import { useMaterialSummary } from "./materials-context";
import { startDownload } from "./start-download";

type PresentSummary = Exclude<MaterialSummary, { access: "removed" }>;

/**
 * Signed links stay identical for a 30-minute window and live about an hour
 * past it, so a preview link is not refetched sooner than this.
 */
const LINK_STALE_MS = 25 * 60 * 1000;

function DownloadButton({ materialId }: { materialId: number }) {
  const t = useTranslations("classroom.files");
  const utils = api.useUtils();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { url } = await utils.classroomMaterials.fileLink.fetch({
        materialId,
        disposition: "attachment",
      });
      startDownload(url);
    } catch {
      toast.error(t("downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={busy}
      onClick={() => void download()}
    >
      <Download className="size-4" />
      {t("download")}
    </Button>
  );
}

/**
 * The PDF shown in the lesson. The link is fetched only when the card
 * mounts. No `sandbox`: browsers refuse to render PDFs in sandboxed frames,
 * and the file is served from the S3 origin, never ours.
 */
function PdfPreview({ materialId, title }: { materialId: number; title: string }) {
  const t = useTranslations("classroom.files");
  const link = api.classroomMaterials.fileLink.useQuery(
    { materialId, disposition: "inline" },
    { staleTime: LINK_STALE_MS, refetchOnWindowFocus: false },
  );
  if (!link.data) {
    return (
      <div
        className="border-border bg-muted/30 h-[70vh] min-h-[480px] border-t"
        aria-hidden="true"
      />
    );
  }
  return (
    <iframe
      src={link.data.url}
      title={t("previewTitle", { title })}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="border-border h-[70vh] min-h-[480px] w-full border-t"
    />
  );
}

/** What a card says instead of offering a download. */
const NOTE_KEYS: Record<Exclude<PresentSummary["access"], "download">, string> = {
  join: "join",
  processing: "processing",
  failed: "failed",
};

/** A hosted file inside a lesson: flat, border-defined card (DESIGN.md). */
export function HostedFileCard({ materialId }: { materialId: number }) {
  const t = useTranslations("classroom.files");
  const summary = useMaterialSummary(materialId);

  if (summary.access === "removed") {
    return (
      <p className="border-border text-muted-foreground my-6 rounded-lg border border-dashed px-4 py-3 text-sm">
        {t("removed")}
      </p>
    );
  }

  return (
    <div className="border-border my-6 overflow-hidden rounded-lg border">
      <div className="flex items-center gap-3 px-4 py-3">
        <FileTypeIcon
          extension={summary.extension}
          className="text-muted-foreground size-5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{summary.title}</p>
          <p className="text-muted-foreground font-mono text-xs">
            {`${fileTypeLabel(summary.extension)} · ${formatBytes(summary.bytes)}`}
          </p>
        </div>
        {summary.access === "download" ? (
          <DownloadButton materialId={materialId} />
        ) : (
          <p className="text-muted-foreground max-w-[50%] text-right text-sm">
            {t(NOTE_KEYS[summary.access])}
          </p>
        )}
      </div>
      {summary.access === "download" &&
      isInlinePreviewable(summary.extension) ? (
        <PdfPreview materialId={materialId} title={summary.title} />
      ) : null}
    </div>
  );
}
```

Replace the whole of `src/components/classroom/materials/block-renderers.tsx` with:

```tsx
import type { BlockRenderers } from "@/lib/lexical";
import { isMaterialId } from "@/lib/classroom/lesson-body";
import { EmbedFrame } from "./embed-frame";
import { HostedFileCard } from "./hosted-file-card";

/** Lesson-body blocks only the classroom renders. Module-level: stable identity. */
export const classroomBlockRenderers: BlockRenderers = {
  Embed: (fields) =>
    typeof fields.url === "string" ? <EmbedFrame url={fields.url} /> : null,
  HostedFile: (fields) =>
    isMaterialId(fields.materialId) ? (
      <HostedFileCard materialId={fields.materialId} />
    ) : null,
};
```

- [ ] **Step 5: Provide the manifest in the lesson view**

In `src/components/classroom/course-view.tsx`, after `import { classroomBlockRenderers } from "./materials/block-renderers";` add:

```tsx
import { MaterialsManifestProvider } from "./materials/materials-context";
```

and replace:

```tsx
              {selectedLesson.body ? (
                <LexicalRenderer
                  content={selectedLesson.body}
                  blockRenderers={classroomBlockRenderers}
                />
              ) : null}
```

with:

```tsx
              {selectedLesson.body ? (
                <MaterialsManifestProvider manifest={data.materials}>
                  <LexicalRenderer
                    content={selectedLesson.body}
                    blockRenderers={classroomBlockRenderers}
                  />
                </MaterialsManifestProvider>
              ) : null}
```

(`data` is non-null here: the component returns early at line 149 when it is missing.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/classroom src/lib/lexical-renderers.test.tsx`
Expected: PASS (the new card tests and every existing classroom component test).

- [ ] **Step 7: Verify and commit**

Run:
```bash
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
node scripts/check-i18n-parity.mjs
```
Expected: clean; parity OK.

```bash
pnpm exec prettier --write src/components/classroom/materials/materials-context.tsx src/components/classroom/materials/file-type-icon.tsx src/components/classroom/materials/start-download.ts src/components/classroom/materials/hosted-file-card.tsx src/components/classroom/materials/hosted-file-card.test.tsx src/components/classroom/materials/block-renderers.tsx src/components/classroom/course-view.tsx
git branch --show-current
git add src/components/classroom/materials/materials-context.tsx src/components/classroom/materials/file-type-icon.tsx src/components/classroom/materials/start-download.ts src/components/classroom/materials/hosted-file-card.tsx src/components/classroom/materials/hosted-file-card.test.tsx src/components/classroom/materials/block-renderers.tsx src/components/classroom/course-view.tsx messages/en.json messages/nl.json
git diff --cached --stat
git commit -m "Classroom files: show uploaded files in lessons

A HostedFile block renders as a flat file card: type icon, title, type and
size, and a Download button that fetches a fresh signed link on click. PDFs
also show a preview in the lesson. Visitors see a join note for
members-only files; a deleted file shows as removed. The lesson view hands
the course's manifest to the renderer through a React context."
```

---
### Task 7: Add and reuse files in the lesson editor

**Files:**
- Modify: `src/components/article-editor/rich-text-editor.tsx` (type at lines 274–280; `executeSlashCommand` line 423; `extensionCommands` lines 532–535; `extraItems` lines 631–636)
- Create: `src/lib/upload-to-grant.ts`
- Test: `src/lib/upload-to-grant.test.ts`
- Modify: `src/components/communities/feed/use-video-post.ts` (line 35 type; lines 66–114 removed; import)
- Must stay unchanged: `src/components/communities/feed/use-video-post.test.tsx`
- Create: `src/components/classroom/materials/use-file-upload.ts`
- Test: `src/components/classroom/materials/use-file-upload.test.tsx`
- Create: `src/components/classroom/materials/lesson-editor-context.tsx`
- Create: `src/components/classroom/materials/hosted-file-node.tsx`
- Test: `src/components/classroom/materials/hosted-file-node.test.tsx`
- Create: `src/components/classroom/materials/editor-extensions.ts`
- Modify: `src/components/classroom/materials/embed-node.tsx` (lines 191–221)
- Modify: `src/components/classroom/materials/embed-node.test.tsx` (imports, lines 13–17)
- Modify: `src/components/classroom/materials/embed-insert.test.tsx` (import line 14; lines 69–75)
- Modify: `src/components/classroom/lesson-editor.tsx`
- Test: `src/components/classroom/lesson-editor.test.tsx`
- Modify: `src/components/classroom/course-editor.tsx` (lines 493–497)
- Modify: `messages/en.json`, `messages/nl.json`

**Interfaces:**
- Consumes: Task 5 `hostedFileBlockNode`, `isMaterialId`; Task 6 `FileTypeIcon`; Task 2 `MATERIAL_ACCEPT`, `fileTypeLabel`, `formatBytes`; tRPC `classroomMaterials.startFileUpload` (`{ courseId, fileName, bytes }` → `{ materialId, upload: { url, fields }, contentType }`), `finishFileUpload` (`{ materialId }` → `CourseMaterial`), `deleteMaterial`, `listCourseMaterials` (`{ courseId }` → `CourseMaterial[]`); `classrooms.get().viewerCanUpload`.
- Produces:
  ```ts
  // rich-text-editor.tsx
  export type RichTextEditorExtension = BlockNodeMapping & { node: Klass<LexicalNode>; create: () => LexicalNode }
    & ({ command: SlashCommand; toolbar?: { title: string; icon: ReactNode } } | { command?: undefined; toolbar?: undefined });
  // @/lib/upload-to-grant
  export type UploadGrant = { url: string; fields: Record<string, string> };
  export function uploadToGrant(grant: UploadGrant, blob: Blob, onProgress: (share: number) => void, signal: AbortSignal): Promise<void>;
  // use-file-upload.ts
  export type FileUploadState = { step: "idle" } | { step: "uploading"; share: number } | { step: "finishing" } | { step: "error"; message: string };
  export function useFileUpload(courseId: number | null): { state: FileUploadState; upload(file: File): Promise<{ id: number } | null>; cancel(): void };
  // lesson-editor-context.tsx
  export type LessonEditorContextValue = { courseId: number | null; canUpload: boolean };
  export const LessonEditorProvider: React.Provider<LessonEditorContextValue>;
  export function useLessonEditorContext(): LessonEditorContextValue;
  // hosted-file-node.tsx
  export class HostedFileNode extends DecoratorNode<React.JSX.Element> { /* type "hosted-file" */ }
  export function $createHostedFileNode(materialId?: number | null): HostedFileNode;
  export const hostedFileExtension: RichTextEditorExtension;   // registered, not insertable
  export const hostedFileInsertable: RichTextEditorExtension;  // + "Add a file"
  // embed-node.tsx
  export const embedExtension: RichTextEditorExtension;
  // editor-extensions.ts
  export const classroomEditorExtensions: readonly RichTextEditorExtension[];            // [embedExtension, hostedFileExtension]
  export const classroomEditorExtensionsWithUploads: readonly RichTextEditorExtension[]; // [embedExtension, hostedFileInsertable]
  // lesson-editor.tsx
  export function LessonEditor(props: { courseId: number; lessons: LessonLike[]; modules: ModuleLike[]; canUpload: boolean }): JSX.Element;
  ```

- [ ] **Step 1: Add the strings (en + nl)**

```bash
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
const add = {
  en: {
    addFileHelp: "PDF, slides, documents, spreadsheets, ZIP files or images, up to 200 MB.",
    chooseFile: "Upload a file",
    reuseLabel: "Use a file already in this course",
    reusePlaceholder: "Pick a course file",
    uploadingProgress: "Uploading… {percent}%",
    finishing: "Checking the file…",
    cancelUpload: "Cancel",
    remove: "Remove",
    visibilityMembers: "Members only",
    visibilityPreview: "Free preview",
    errorType: "This kind of file can't be added. Use a PDF, slides, a document, a spreadsheet, a ZIP file or an image.",
    errorEmpty: "This file is empty.",
    errorTooLarge: "This file is too big. Files can be up to 200 MB.",
    errorStorageFull: "Your community has reached its file storage limit. Delete files you no longer need, or ask a community admin.",
    errorNotAllowed: "You can't upload files in this community. Ask a community admin.",
    errorDailyLimit: "You've uploaded the most files allowed for today. Try again tomorrow.",
    errorFailed: "The file didn't upload. Please try again.",
    invalidOnSave: "One of the files in this lesson belongs to another course. Remove it, then save again.",
  },
  nl: {
    addFileHelp: "PDF, dia's, documenten, spreadsheets, ZIP-bestanden of afbeeldingen, tot 200 MB.",
    chooseFile: "Bestand uploaden",
    reuseLabel: "Gebruik een bestand dat al in deze cursus staat",
    reusePlaceholder: "Kies een cursusbestand",
    uploadingProgress: "Uploaden… {percent}%",
    finishing: "Bestand controleren…",
    cancelUpload: "Annuleren",
    remove: "Verwijderen",
    visibilityMembers: "Alleen leden",
    visibilityPreview: "Gratis voorbeeld",
    errorType: "Dit soort bestand kan niet worden toegevoegd. Gebruik een PDF, dia's, een document, een spreadsheet, een ZIP-bestand of een afbeelding.",
    errorEmpty: "Dit bestand is leeg.",
    errorTooLarge: "Dit bestand is te groot. Bestanden mogen maximaal 200 MB zijn.",
    errorStorageFull: "Je community heeft de opslaglimiet voor bestanden bereikt. Verwijder bestanden die je niet meer nodig hebt, of vraag het een beheerder van de community.",
    errorNotAllowed: "Je kunt in deze community geen bestanden uploaden. Vraag het een beheerder van de community.",
    errorDailyLimit: "Je hebt vandaag het maximale aantal bestanden geüpload. Probeer het morgen opnieuw.",
    errorFailed: "Het bestand is niet geüpload. Probeer het opnieuw.",
    invalidOnSave: "Een van de bestanden in deze les hoort bij een andere cursus. Verwijder het en sla opnieuw op.",
  },
};
for (const locale of ["en", "nl"]) {
  const path = `messages/${locale}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.classroom.files = { ...(json.classroom.files ?? {}), ...add[locale] };
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}
EOF
node scripts/check-i18n-parity.mjs
```
Expected: `i18n parity OK — …`.

- [ ] **Step 2: Write the failing upload helper test**

`src/lib/upload-to-grant.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadToGrant } from "./upload-to-grant";

type Sent = {
  url: string;
  fields: Record<string, string>;
  file: { type: string; size: number };
  order: string[];
};

/** Records every presigned POST and answers according to `mode`. */
class FakeXHR {
  static sent: Sent[] = [];
  static mode: "ok" | "http-error" | "network-error" | "hang" = "ok";
  status = 0;
  url = "";
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  send(form: FormData) {
    const fields: Record<string, string> = {};
    const order: string[] = [];
    let file = { type: "", size: -1 };
    for (const [name, value] of form.entries()) {
      order.push(name);
      if (typeof value === "string") fields[name] = value;
      else file = { type: value.type, size: value.size };
    }
    FakeXHR.sent.push({ url: this.url, fields, file, order });
    if (FakeXHR.mode === "hang") return;
    queueMicrotask(() => {
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: 5,
        total: 10,
      } as ProgressEvent);
      if (FakeXHR.mode === "network-error") {
        this.onerror?.();
        return;
      }
      this.status = FakeXHR.mode === "http-error" ? 403 : 204;
      this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

const grant = {
  url: "https://s3.test/bucket",
  fields: {
    key: "private/classroom/c/1/u.pdf",
    "Content-Type": "application/pdf",
    Policy: "p",
  },
};
const blob = new Blob(["%PDF-1.7"], { type: "application/pdf" });

beforeEach(() => {
  FakeXHR.sent = [];
  FakeXHR.mode = "ok";
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadToGrant", () => {
  it("posts the signed fields, then the file last, and reports progress", async () => {
    const progress = vi.fn();
    await uploadToGrant(grant, blob, progress, new AbortController().signal);
    expect(FakeXHR.sent).toEqual([
      {
        url: "https://s3.test/bucket",
        fields: grant.fields,
        file: { type: "application/pdf", size: 8 },
        order: ["key", "Content-Type", "Policy", "file"],
      },
    ]);
    expect(progress).toHaveBeenCalledWith(0.5);
  });

  it("rejects when S3 refuses the upload", async () => {
    FakeXHR.mode = "http-error";
    await expect(
      uploadToGrant(grant, blob, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("upload failed with HTTP 403");
  });

  it("rejects on a network failure", async () => {
    FakeXHR.mode = "network-error";
    await expect(
      uploadToGrant(grant, blob, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("upload network error");
  });

  it("rejects with an AbortError when cancelled mid-upload", async () => {
    FakeXHR.mode = "hang";
    const controller = new AbortController();
    const sending = uploadToGrant(grant, blob, vi.fn(), controller.signal);
    controller.abort();
    await expect(sending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("sends nothing when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadToGrant(grant, blob, vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXHR.sent).toEqual([]);
  });
});
```

Run: `pnpm vitest run src/lib/upload-to-grant.test.ts`
Expected: FAIL. `./upload-to-grant` cannot be resolved.

- [ ] **Step 3: Extract the helper; make the Reels hook use it**

`src/lib/upload-to-grant.ts`:

```ts
/** A presigned S3 POST: where to send the form, and the fields S3 signed. */
export type UploadGrant = { url: string; fields: Record<string, string> };

/** The abort reason as an Error (it is an `AbortError` unless one was given). */
function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The upload was cancelled.", "AbortError");
}

/**
 * POSTs a blob to a presigned S3 form. Uses XHR because fetch has no upload
 * progress. Settles on success, HTTP failure, network failure, or abort.
 * Shared by Reels video posts and classroom file uploads.
 */
export function uploadToGrant(
  grant: UploadGrant,
  blob: Blob,
  onProgress: (share: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(grant.fields)) {
      form.append(name, value);
    }
    form.append("file", blob); // S3 requires the file field last.

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const settle = (error?: Error) => {
      signal.removeEventListener("abort", onAbort);
      if (error === undefined) resolve();
      else reject(error);
    };
    xhr.open("POST", grant.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? settle()
        : settle(new Error(`upload failed with HTTP ${xhr.status}`));
    xhr.onerror = () => settle(new Error("upload network error"));
    xhr.onabort = () => settle(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(form);
  });
}
```

In `src/components/communities/feed/use-video-post.ts` (line numbers are of the unedited file; make the edits bottom-up):
- after `import { api } from "@/trpc/react";` add `import { uploadToGrant, type UploadGrant } from "@/lib/upload-to-grant";`
- delete line 35: `type UploadGrant = { url: string; fields: Record<string, string> };`
- delete lines 66–114: the `abortError` helper (starts with the doc comment "The abort reason as an Error …") and the whole `uploadToGrant` function, ending just before the doc comment that starts "Posts a video: prepare it on the device". Keep `CannotConvertHereError` (line 64).

Run:
```bash
pnpm vitest run src/lib/upload-to-grant.test.ts src/components/communities/feed/use-video-post.test.tsx
git diff --stat -- src/components/communities/feed/use-video-post.test.tsx
```
Expected: PASS (5 new tests and every existing `useVideoPost` test); the `git diff --stat` prints nothing.

- [ ] **Step 4: Write the failing upload hook test**

`src/components/classroom/materials/use-file-upload.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

const m = vi.hoisted(() => ({
  start: vi.fn(),
  finish: vi.fn(),
  discard: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      classroomMaterials: {
        listCourseMaterials: { invalidate: m.invalidate },
      },
    }),
    classroomMaterials: {
      startFileUpload: { useMutation: () => ({ mutateAsync: m.start }) },
      finishFileUpload: { useMutation: () => ({ mutateAsync: m.finish }) },
      deleteMaterial: { useMutation: () => ({ mutateAsync: m.discard }) },
    },
  },
}));

import { useFileUpload } from "./use-file-upload";

type Sent = {
  url: string;
  fields: Record<string, string>;
  file: { type: string; size: number };
  order: string[];
};

class FakeXHR {
  static sent: Sent[] = [];
  static status = 204;
  static hang = false;
  status = 0;
  url = "";
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  send(form: FormData) {
    const fields: Record<string, string> = {};
    const order: string[] = [];
    let file = { type: "", size: -1 };
    for (const [name, value] of form.entries()) {
      order.push(name);
      if (typeof value === "string") fields[name] = value;
      else file = { type: value.type, size: value.size };
    }
    FakeXHR.sent.push({ url: this.url, fields, file, order });
    if (FakeXHR.hang) return;
    queueMicrotask(() => {
      this.status = FakeXHR.status;
      this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

const files = en.classroom.files;
// The browser often reports no type for .key or .csv files; the grant's type wins.
const pdf = new File(["%PDF-1.7 hello"], "Week 1.pdf", { type: "" });
const grant = {
  materialId: 7,
  upload: {
    url: "https://s3.test/",
    fields: { key: "k", "Content-Type": "application/pdf" },
  },
  contentType: "application/pdf",
};

function renderIt(courseId: number | null = 5) {
  return renderHook(() => useFileUpload(courseId), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={en}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}

beforeEach(() => {
  FakeXHR.sent = [];
  FakeXHR.status = 204;
  FakeXHR.hang = false;
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  m.start.mockResolvedValue(grant);
  m.finish.mockResolvedValue({ id: 7, status: "ready" });
  m.discard.mockResolvedValue({ ok: true });
  m.invalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useFileUpload", () => {
  it("asks for a grant with the picked file's real name and size, uploads with the server's type, then finishes", async () => {
    const { result } = renderIt();
    let done: { id: number } | null = null;
    await act(async () => {
      done = await result.current.upload(pdf);
    });
    expect(done).toEqual({ id: 7 });
    expect(m.start).toHaveBeenCalledWith({
      courseId: 5,
      fileName: "Week 1.pdf",
      bytes: pdf.size,
    });
    expect(FakeXHR.sent).toEqual([
      {
        url: "https://s3.test/",
        fields: grant.upload.fields,
        file: { type: "application/pdf", size: pdf.size },
        order: ["key", "Content-Type", "file"],
      },
    ]);
    expect(m.finish).toHaveBeenCalledWith({ materialId: 7 });
    expect(m.invalidate).toHaveBeenCalledWith({ courseId: 5 });
    expect(m.discard).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ step: "idle" });
  });

  it.each([
    ["FILE_TYPE_NOT_ALLOWED", files.errorType],
    ["FILE_EMPTY", files.errorEmpty],
    ["FILE_TOO_LARGE", files.errorTooLarge],
    ["STORAGE_FULL", files.errorStorageFull],
    ["UPLOADS_NOT_ALLOWED", files.errorNotAllowed],
    ["UPLOAD_LIMIT", files.errorDailyLimit],
    ["SOMETHING_ELSE", files.errorFailed],
  ])("explains a refused start (%s) in everyday words", async (code, message) => {
    m.start.mockRejectedValue(new Error(code));
    const { result } = renderIt();
    await act(async () => {
      await result.current.upload(pdf);
    });
    expect(result.current.state).toEqual({ step: "error", message });
    expect(FakeXHR.sent).toEqual([]);
    expect(m.discard).not.toHaveBeenCalled();
  });

  it("discards the record when sending the file fails", async () => {
    FakeXHR.status = 403;
    const { result } = renderIt();
    await act(async () => {
      await result.current.upload(pdf);
    });
    expect(result.current.state).toEqual({
      step: "error",
      message: files.errorFailed,
    });
    expect(m.discard).toHaveBeenCalledWith({ materialId: 7 });
    expect(m.finish).not.toHaveBeenCalled();
  });

  it("keeps the record when finishing fails (the server marked it failed)", async () => {
    m.finish.mockRejectedValue(new Error("UPLOAD_FAILED"));
    const { result } = renderIt();
    await act(async () => {
      await result.current.upload(pdf);
    });
    expect(result.current.state).toEqual({
      step: "error",
      message: files.errorFailed,
    });
    expect(m.discard).not.toHaveBeenCalled();
  });

  it("cancelling goes back to idle and discards the record", async () => {
    FakeXHR.hang = true;
    const { result } = renderIt();
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.upload(pdf);
    });
    await waitFor(() => expect(FakeXHR.sent).toHaveLength(1));
    await act(async () => {
      result.current.cancel();
      await pending;
    });
    expect(result.current.state).toEqual({ step: "idle" });
    expect(m.discard).toHaveBeenCalledWith({ materialId: 7 });
  });

  it("does nothing without a course", async () => {
    const { result } = renderIt(null);
    await act(async () => {
      expect(await result.current.upload(pdf)).toBeNull();
    });
    expect(m.start).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm vitest run src/components/classroom/materials/use-file-upload.test.tsx`
Expected: FAIL. `./use-file-upload` cannot be resolved.

- [ ] **Step 5: Write the upload hook**

`src/components/classroom/materials/use-file-upload.ts`:

```ts
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { uploadToGrant } from "@/lib/upload-to-grant";
import { api } from "@/trpc/react";

export type FileUploadState =
  | { step: "idle" }
  | { step: "uploading"; share: number }
  | { step: "finishing" }
  | { step: "error"; message: string };

/** Server refusal codes (TRPCError messages) → keys under classroom.files. */
const MESSAGE_KEYS: Record<string, string> = {
  FILE_TYPE_NOT_ALLOWED: "errorType",
  FILE_EMPTY: "errorEmpty",
  FILE_TOO_LARGE: "errorTooLarge",
  STORAGE_FULL: "errorStorageFull",
  UPLOADS_NOT_ALLOWED: "errorNotAllowed",
  UPLOAD_LIMIT: "errorDailyLimit",
};

/**
 * Uploads one lesson file: ask the server for a grant (it checks policy,
 * type, size and storage), POST the file straight to S3 with the type the
 * server chose, then ask the server to check what arrived.
 *
 * One upload at a time. `cancel()` stops the transfer and returns to idle.
 * When the transfer is cancelled or fails before finish, the new record is
 * deleted at once so it doesn't hold storage until the daily cleanup.
 */
export function useFileUpload(courseId: number | null) {
  const t = useTranslations("classroom.files");
  const utils = api.useUtils();
  const start = api.classroomMaterials.startFileUpload.useMutation();
  const finish = api.classroomMaterials.finishFileUpload.useMutation();
  const discard = api.classroomMaterials.deleteMaterial.useMutation();
  const [state, setState] = useState<FileUploadState>({ step: "idle" });
  const inFlight = useRef<AbortController | null>(null);

  function messageFor(error: unknown): string {
    const code = (error as { message?: unknown } | null)?.message;
    const key = typeof code === "string" ? MESSAGE_KEYS[code] : undefined;
    return t(key ?? "errorFailed");
  }

  async function upload(file: File): Promise<{ id: number } | null> {
    if (courseId === null || inFlight.current) return null;
    const controller = new AbortController();
    inFlight.current = controller;
    let materialId: number | null = null;
    let finishing = false;
    try {
      setState({ step: "uploading", share: 0 });
      const grant = await start.mutateAsync({
        courseId,
        fileName: file.name,
        bytes: file.size,
      });
      materialId = grant.materialId;
      await uploadToGrant(
        grant.upload,
        file.slice(0, file.size, grant.contentType),
        (share) => setState({ step: "uploading", share }),
        controller.signal,
      );
      finishing = true;
      setState({ step: "finishing" });
      const done = await finish.mutateAsync({ materialId: grant.materialId });
      void utils.classroomMaterials.listCourseMaterials.invalidate({ courseId });
      setState({ step: "idle" });
      return { id: done.id };
    } catch (error) {
      if (materialId !== null && !finishing) {
        const abandoned = materialId;
        void discard
          .mutateAsync({ materialId: abandoned })
          .catch(() => undefined);
      }
      setState(
        controller.signal.aborted
          ? { step: "idle" }
          : { step: "error", message: messageFor(error) },
      );
      return null;
    } finally {
      inFlight.current = null;
    }
  }

  return { state, upload, cancel: () => inFlight.current?.abort() };
}
```

Run: `pnpm vitest run src/components/classroom/materials/use-file-upload.test.tsx`
Expected: PASS (12 tests).

- [ ] **Step 6: Make insertion optional in the editor seam**

In `src/components/article-editor/rich-text-editor.tsx`:

1. Replace:

```ts
/** A feature-owned block node (e.g. classroom Embed): registered, insertable from the slash menu and toolbar, and mapped to/from its stored Payload block. */
export type RichTextEditorExtension = BlockNodeMapping & {
  node: Klass<LexicalNode>;
  command: SlashCommand;
  toolbar: { title: string; icon: ReactNode };
  create: () => LexicalNode;
};
```

with:

```ts
/**
 * How an author inserts an extension's node: a slash command, optionally
 * with a toolbar button. An extension without one is only registered — its
 * stored blocks load and save, but it can't be newly inserted.
 */
type ExtensionInsertion =
  | { command: SlashCommand; toolbar?: { title: string; icon: ReactNode } }
  | { command?: undefined; toolbar?: undefined };

/** A feature-owned block node (e.g. classroom Embed): registered, mapped to/from its stored Payload block, and optionally insertable. */
export type RichTextEditorExtension = BlockNodeMapping & {
  node: Klass<LexicalNode>;
  create: () => LexicalNode;
} & ExtensionInsertion;
```

2. Replace `const extension = extensions.find((e) => e.command.id === id);` with:

```ts
      const extension = extensions.find((e) => e.command?.id === id);
```

3. Replace:

```ts
  const extensionCommands = useMemo(
    () => extensions.map((e) => e.command),
    [extensions],
  );
```

with:

```ts
  const extensionCommands = useMemo(
    () => extensions.flatMap((e) => (e.command ? [e.command] : [])),
    [extensions],
  );
```

4. Replace:

```tsx
        extraItems={extensions.map((e) => ({
          key: e.command.id,
          title: e.toolbar.title,
          icon: e.toolbar.icon,
          run: () => executeSlashCommand(e.command.id),
        }))}
```

with:

```tsx
        extraItems={extensions.flatMap((e) => {
          if (!e.command || !e.toolbar) return [];
          const id = e.command.id;
          return [
            {
              key: id,
              title: e.toolbar.title,
              icon: e.toolbar.icon,
              run: () => executeSlashCommand(id),
            },
          ];
        })}
```

- [ ] **Step 7: Write the failing file-node test**

`src/components/classroom/materials/hosted-file-node.test.tsx`:

```tsx
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  $createParagraphNode,
  $getRoot,
  createEditor,
} from "@payloadcms/richtext-lexical/lexical";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  upload: vi.fn(),
  cancel: vi.fn(),
  files: [] as unknown[],
}));

vi.mock("@/trpc/react", () => ({
  api: {
    classroomMaterials: {
      listCourseMaterials: { useQuery: () => ({ data: m.files }) },
    },
  },
}));
vi.mock("./use-file-upload", () => ({
  useFileUpload: () => ({
    state: { step: "idle" },
    upload: m.upload,
    cancel: m.cancel,
  }),
}));

import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import {
  postprocessEditorState,
  preprocessEditorState,
} from "@/components/article-editor/utils";
import {
  hostedFileBlockNode,
  stripIncompleteMaterials,
} from "@/lib/classroom/lesson-body";
import en from "../../../../messages/en.json";
import {
  classroomEditorExtensions,
  classroomEditorExtensionsWithUploads,
} from "./editor-extensions";
import { $createHostedFileNode, HostedFileNode } from "./hosted-file-node";
import { LessonEditorProvider } from "./lesson-editor-context";

type Node = {
  type?: string;
  fields?: { blockType?: string; materialId?: unknown; id?: string };
  children?: Node[];
};

function hostedFileIds(state: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (nodes?: Node[]) => {
    for (const n of nodes ?? []) {
      if (n.type === "block" && n.fields?.blockType === "HostedFile") {
        out.push(n.fields.materialId);
      }
      walk(n.children);
    }
  };
  walk((state as { root?: { children?: Node[] } } | null)?.root?.children);
  return out;
}

function newEditor() {
  return createEditor({
    namespace: "hosted-file-node-test",
    nodes: [HostedFileNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("HostedFileNode ↔ stored HostedFile block", () => {
  it("saves a node with a file as exactly the stored block shape", () => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot().append($createHostedFileNode(42), $createParagraphNode());
      },
      { discrete: true },
    );
    const saved = postprocessEditorState(
      editor.getEditorState().toJSON(),
      classroomEditorExtensions,
    ) as unknown as { root: { children: Node[] } };
    const first = saved.root.children[0]!;
    expect(first).toEqual(hostedFileBlockNode(42, first.fields!.id!));
    expect(first.fields!.id).toMatch(/^[a-f0-9]{12}$/);
  });

  it("loads a stored block into a HostedFileNode and saves it back unchanged", () => {
    const stored = {
      root: {
        type: "root",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        children: [hostedFileBlockNode(7, "abc123def456")],
      },
    };
    const editor = newEditor();
    editor.setEditorState(
      editor.parseEditorState(
        preprocessEditorState(stored as never, classroomEditorExtensions)!,
      ),
    );
    const node = editor.getEditorState().read(() => $getRoot().getFirstChild());
    expect(node).toBeInstanceOf(HostedFileNode);
    const saved = postprocessEditorState(
      editor.getEditorState().toJSON(),
      classroomEditorExtensions,
    ) as unknown as { root: { children: unknown[] } };
    expect(saved.root.children).toEqual([hostedFileBlockNode(7, "abc123def456")]);
  });

  it("a node that never got a file is dropped before saving", () => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot().append($createHostedFileNode(), $createParagraphNode());
      },
      { discrete: true },
    );
    const saved = stripIncompleteMaterials(
      postprocessEditorState(
        editor.getEditorState().toJSON(),
        classroomEditorExtensions,
      ),
    );
    expect(hostedFileIds(saved)).toEqual([]);
  });
});

describe("lesson editor: adding a file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.files = [];
    m.upload.mockResolvedValue({ id: 42 });
  });

  function renderEditor(
    extensions: typeof classroomEditorExtensions,
    onChange = vi.fn(),
  ) {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LessonEditorProvider value={{ courseId: 5, canUpload: true }}>
          <RichTextEditor onChange={onChange} extensions={extensions} />
        </LessonEditorProvider>
      </NextIntlClientProvider>,
    );
    return onChange;
  }

  async function insertFileBlock() {
    const button = await screen.findByTitle("Add a file");
    await waitFor(() => expect(button).toBeEnabled());
    const editable = document.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )!;
    act(() => {
      editable.focus();
      fireEvent.click(editable);
    });
    fireEvent.click(button);
  }

  it("uploads the picked file and puts its id into the saved lesson body", async () => {
    const onChange = renderEditor(classroomEditorExtensionsWithUploads);
    await insertFileBlock();
    const input = await screen.findByLabelText(en.classroom.files.chooseFile);
    const file = new File(["%PDF-1.7"], "Week 1.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(m.upload).toHaveBeenCalledWith(file));
    await waitFor(
      () => expect(hostedFileIds(onChange.mock.lastCall?.[0])).toEqual([42]),
      { timeout: 2000 },
    );
  });

  it("reuses a file already in the course", async () => {
    m.files = [
      {
        id: 9,
        title: "Handout",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: 10,
        status: "ready",
        visibility: "members",
        failureReason: null,
        createdAt: "2026-09-28T10:00:00.000Z",
      },
    ];
    const onChange = renderEditor(classroomEditorExtensionsWithUploads);
    await insertFileBlock();
    fireEvent.change(
      await screen.findByLabelText(en.classroom.files.reuseLabel),
      { target: { value: "9" } },
    );
    await waitFor(
      () => expect(hostedFileIds(onChange.mock.lastCall?.[0])).toEqual([9]),
      { timeout: 2000 },
    );
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("offers no 'Add a file' button without upload rights", async () => {
    renderEditor(classroomEditorExtensions);
    await screen.findByTitle("Embed slides or video");
    expect(screen.queryByTitle("Add a file")).toBeNull();
  });
});
```

Run: `pnpm vitest run src/components/classroom/materials/hosted-file-node.test.tsx`
Expected: FAIL. `./editor-extensions` and `./hosted-file-node` cannot be resolved.

- [ ] **Step 8: Write the editor context, the file node and the extension lists**

`src/components/classroom/materials/lesson-editor-context.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";

/**
 * What lesson-editor nodes need to know about the lesson they sit in. Lexical
 * decorators are rendered inside the editor's React tree, so they read this
 * context like any other component.
 */
export type LessonEditorContextValue = {
  courseId: number | null;
  canUpload: boolean;
};

const LessonEditorContext = createContext<LessonEditorContextValue>({
  courseId: null,
  canUpload: false,
});

export const LessonEditorProvider = LessonEditorContext.Provider;

export function useLessonEditorContext(): LessonEditorContextValue {
  return useContext(LessonEditorContext);
}
```

`src/components/classroom/materials/hosted-file-node.tsx`:

```tsx
"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Paperclip, X } from "lucide-react";
import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "@payloadcms/richtext-lexical/lexical";

import type { RichTextEditorExtension } from "@/components/article-editor/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { hostedFileBlockNode, isMaterialId } from "@/lib/classroom/lesson-body";
import {
  MATERIAL_ACCEPT,
  fileTypeLabel,
  formatBytes,
} from "@/lib/classroom/material-rules";
import { api } from "@/trpc/react";
import { FileTypeIcon } from "./file-type-icon";
import { useLessonEditorContext } from "./lesson-editor-context";
import { useFileUpload } from "./use-file-upload";

/**
 * The editor's form of a stored HostedFile block. Apart from `type` (which
 * the editor remaps to "block" on save) it is exactly `HostedFileBlockNode`
 * from `@/lib/classroom/lesson-body`. A node that never got a file carries
 * `materialId: 0` and is dropped before saving.
 */
export type SerializedHostedFileNode = SerializedLexicalNode & {
  type: "hosted-file";
  version: 2;
  format: "";
  fields: {
    id: string;
    blockName: "";
    blockType: "HostedFile";
    materialId: number;
  };
};

function HostedFileEditor({
  materialId,
  nodeKey,
  editor,
}: {
  materialId: number | null;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const t = useTranslations("classroom.files");
  const { courseId, canUpload } = useLessonEditorContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const files = api.classroomMaterials.listCourseMaterials.useQuery(
    { courseId: courseId ?? 0 },
    { enabled: courseId !== null },
  );
  const { state, upload, cancel } = useFileUpload(courseId);

  const choose = useCallback(
    (id: number) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof HostedFileNode) node.setMaterialId(id);
      });
    },
    [editor, nodeKey],
  );

  const remove = useCallback(() => {
    editor.update(() => $getNodeByKey(nodeKey)?.remove());
  }, [editor, nodeKey]);

  const removeButton = (
    <button
      type="button"
      onClick={remove}
      className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
      aria-label={t("remove")}
      title={t("remove")}
    >
      <X className="size-4" />
    </button>
  );

  if (materialId !== null) {
    const file = files.data?.find((f) => f.id === materialId);
    return (
      <div className="border-border my-4 flex items-center gap-3 rounded-lg border px-3 py-2">
        <FileTypeIcon
          extension={file?.extension ?? ""}
          className="text-muted-foreground size-5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {file ? file.title : t("removed")}
          </p>
          {file ? (
            <p className="text-muted-foreground font-mono text-xs">
              {`${fileTypeLabel(file.extension)} · ${formatBytes(file.bytes)}`}
            </p>
          ) : null}
        </div>
        {file ? (
          <Badge variant="outline">
            {file.visibility === "preview"
              ? t("visibilityPreview")
              : t("visibilityMembers")}
          </Badge>
        ) : null}
        {removeButton}
      </div>
    );
  }

  const reusable = (files.data ?? []).filter((f) => f.status === "ready");
  const percent = state.step === "uploading" ? Math.round(state.share * 100) : 0;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    const done = await upload(picked);
    if (done) choose(done.id);
  }

  return (
    <div className="border-border my-4 space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs">{t("addFileHelp")}</p>
        {removeButton}
      </div>
      {state.step === "uploading" ? (
        <div className="space-y-2">
          <Progress
            value={percent}
            aria-label={t("uploadingProgress", { percent })}
          />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-xs">
              {t("uploadingProgress", { percent })}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              {t("cancelUpload")}
            </Button>
          </div>
        </div>
      ) : state.step === "finishing" ? (
        <p className="text-muted-foreground text-xs">{t("finishing")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {canUpload ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <Paperclip className="size-4" />
                {t("chooseFile")}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept={MATERIAL_ACCEPT}
                aria-label={t("chooseFile")}
                className="hidden"
                onChange={(e) => void onPick(e)}
              />
            </>
          ) : null}
          {reusable.length > 0 ? (
            <select
              aria-label={t("reuseLabel")}
              defaultValue=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (isMaterialId(id)) choose(id);
              }}
              className="border-border bg-background rounded-md border px-2 py-1 text-sm"
            >
              <option value="" disabled>
                {t("reusePlaceholder")}
              </option>
              {reusable.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}
      {state.step === "error" ? (
        <p className="text-destructive text-xs">{state.message}</p>
      ) : null}
    </div>
  );
}

function generateBlockId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

export class HostedFileNode extends DecoratorNode<React.JSX.Element> {
  __materialId: number | null;
  __blockId: string;

  static getType(): string {
    return "hosted-file";
  }

  static clone(node: HostedFileNode): HostedFileNode {
    return new HostedFileNode(node.__materialId, node.__blockId, node.__key);
  }

  constructor(materialId: number | null, blockId?: string, key?: NodeKey) {
    super(key);
    this.__materialId = materialId;
    this.__blockId = blockId ?? generateBlockId();
  }

  static importJSON(json: SerializedHostedFileNode): HostedFileNode {
    const id = json.fields?.materialId;
    return new HostedFileNode(isMaterialId(id) ? id : null, json.fields?.id);
  }

  exportJSON(): SerializedHostedFileNode {
    return {
      ...hostedFileBlockNode(this.__materialId ?? 0, this.__blockId),
      type: "hosted-file",
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  setMaterialId(materialId: number): void {
    this.getWritable().__materialId = materialId;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <HostedFileEditor
        materialId={this.__materialId}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

export function $createHostedFileNode(
  materialId: number | null = null,
): HostedFileNode {
  return new HostedFileNode(materialId);
}

export function $isHostedFileNode(
  node: LexicalNode | null | undefined,
): node is HostedFileNode {
  return node instanceof HostedFileNode;
}

/** Registered so lessons with files always load; not insertable. */
export const hostedFileExtension: RichTextEditorExtension = {
  node: HostedFileNode,
  nodeType: "hosted-file",
  blockType: "HostedFile",
  create: () => $createHostedFileNode(),
};

/** The same node, insertable from the slash menu and the toolbar. */
export const hostedFileInsertable: RichTextEditorExtension = {
  ...hostedFileExtension,
  command: {
    id: "hosted-file",
    label: "Add a file",
    group: "Basic",
    keywords: [
      "file",
      "upload",
      "pdf",
      "slides",
      "document",
      "spreadsheet",
      "download",
      "attachment",
    ],
  },
  toolbar: {
    title: "Add a file",
    icon: <Paperclip className="size-4" />,
  },
};
```

In `src/components/classroom/materials/embed-node.tsx` replace everything from `/** The classroom's lesson-editor extensions. Module-level: stable identity. */` (line 191) to the end of the file with:

```tsx
/** The Embed block, insertable from the slash menu and the toolbar. */
export const embedExtension: RichTextEditorExtension = {
  node: EmbedNode,
  nodeType: "embed",
  blockType: "Embed",
  command: {
    id: "embed",
    label: "Embed slides or video",
    group: "Basic",
    keywords: [
      "embed",
      "video",
      "youtube",
      "vimeo",
      "loom",
      "slides",
      "google",
      "docs",
      "sheets",
      "drive",
      "figma",
    ],
  },
  toolbar: {
    title: "Embed slides or video",
    icon: <Presentation className="size-4" />,
  },
  create: () => $createEmbedNode(""),
};
```

`src/components/classroom/materials/editor-extensions.ts`:

```ts
import type { RichTextEditorExtension } from "@/components/article-editor/rich-text-editor";
import { embedExtension } from "./embed-node";
import {
  hostedFileExtension,
  hostedFileInsertable,
} from "./hosted-file-node";

/**
 * The lesson editor's block nodes. Both lists register the same nodes, so a
 * lesson that already has files always loads and saves; they differ only in
 * whether "Add a file" is offered. Module-level: stable identity.
 */
export const classroomEditorExtensions: readonly RichTextEditorExtension[] = [
  embedExtension,
  hostedFileExtension,
];

/** For authors the community lets upload files. */
export const classroomEditorExtensionsWithUploads: readonly RichTextEditorExtension[] =
  [embedExtension, hostedFileInsertable];
```

Point the two existing Embed tests at the new module:

- In `src/components/classroom/materials/embed-node.test.tsx` replace:

```ts
import {
  $createEmbedNode,
  EmbedNode,
  classroomEditorExtensions,
} from "./embed-node";
```

with:

```ts
import { classroomEditorExtensions } from "./editor-extensions";
import { $createEmbedNode, EmbedNode } from "./embed-node";
```

- In `src/components/classroom/materials/embed-insert.test.tsx` replace `import { classroomEditorExtensions } from "./embed-node";` with `import { classroomEditorExtensions } from "./editor-extensions";`, and replace:

```ts
  it("the slash menu offers the Embed command for 'slides'", () => {
    const ids = filterSlashCommands(
      "slides",
      classroomEditorExtensions.map((e) => e.command),
    ).map((c) => c.id);
    expect(ids).toContain("embed");
  });
```

with:

```ts
  it("the slash menu offers the Embed command for 'slides'", () => {
    const commands = classroomEditorExtensions.flatMap((e) =>
      e.command ? [e.command] : [],
    );
    expect(filterSlashCommands("slides", commands).map((c) => c.id)).toContain(
      "embed",
    );
    // Without upload rights the file block is registered but not offered.
    expect(filterSlashCommands("file", commands).map((c) => c.id)).not.toContain(
      "hosted-file",
    );
  });
```

Run: `pnpm vitest run src/components/classroom/materials/hosted-file-node.test.tsx src/components/classroom/materials/embed-node.test.tsx src/components/classroom/materials/embed-insert.test.tsx`
Expected: PASS (the six new file-node tests and the existing Embed tests through the new module).

- [ ] **Step 9: Write the failing lesson-editor test**

`src/components/classroom/lesson-editor.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ classrooms: { get: { invalidate: vi.fn() } } }),
    classrooms: {
      addLesson: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    classroomMaterials: {
      listCourseMaterials: { useQuery: () => ({ data: [] }) },
    },
  },
}));

import { LessonEditor } from "./lesson-editor";

function renderEditor(canUpload: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LessonEditor
        courseId={5}
        lessons={[]}
        modules={[]}
        canUpload={canUpload}
      />
    </NextIntlClientProvider>,
  );
}

describe("LessonEditor", () => {
  it("offers 'Add a file' to an author the community lets upload", async () => {
    renderEditor(true);
    expect(await screen.findByTitle("Add a file")).toBeInTheDocument();
    expect(screen.getByTitle("Embed slides or video")).toBeInTheDocument();
  });

  it("offers only embeds to an author who may not upload", async () => {
    renderEditor(false);
    expect(
      await screen.findByTitle("Embed slides or video"),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("Add a file")).toBeNull();
  });
});
```

Run: `pnpm vitest run src/components/classroom/lesson-editor.test.tsx`
Expected: FAIL. No toolbar button is found: `lesson-editor.tsx` still imports `classroomEditorExtensions` from `./materials/embed-node`, which no longer exports it, and there is no `canUpload` prop yet.

- [ ] **Step 10: Use it in the lesson editor and the course editor**

In `src/components/classroom/lesson-editor.tsx`:

1. Replace `import { useState } from "react";` with `import { useMemo, useState } from "react";`.
2. Replace `import { classroomEditorExtensions } from "./materials/embed-node";` with:

```tsx
import {
  classroomEditorExtensions,
  classroomEditorExtensionsWithUploads,
} from "./materials/editor-extensions";
import {
  LessonEditorProvider,
  useLessonEditorContext,
} from "./materials/lesson-editor-context";
```

3. Replace the `useLessonSaveErrorMessage` function (its doc comment and body, lines 41–48) with:

```tsx
/** Toast text for a failed lesson save: the router's body refusals get friendly messages. */
function useLessonSaveErrorMessage() {
  const t = useTranslations("classroom");
  return (message: string | undefined) => {
    if (message === "INVALID_EMBED") return t("embedInvalidOnSave");
    if (message === "INVALID_MATERIAL") return t("files.invalidOnSave");
    return message ?? t("saveFailed");
  };
}
```

4. In `LessonFields`, replace:

```tsx
  const t = useTranslations("classroom");
  return (
    <div className="flex flex-col gap-3">
```

with:

```tsx
  const t = useTranslations("classroom");
  const { canUpload } = useLessonEditorContext();
  return (
    <div className="flex flex-col gap-3">
```

and replace `            extensions={classroomEditorExtensions}` with:

```tsx
            extensions={
              canUpload
                ? classroomEditorExtensionsWithUploads
                : classroomEditorExtensions
            }
```

5. Replace the `LessonEditor` signature:

```tsx
export function LessonEditor({
  courseId,
  lessons,
  modules,
}: {
  courseId: number;
  lessons: LessonLike[];
  modules: ModuleLike[];
}) {
  const t = useTranslations("classroom");
```

with:

```tsx
export function LessonEditor({
  courseId,
  lessons,
  modules,
  canUpload,
}: {
  courseId: number;
  lessons: LessonLike[];
  modules: ModuleLike[];
  /** From `classrooms.get().viewerCanUpload`: the author may upload files. */
  canUpload: boolean;
}) {
  const t = useTranslations("classroom");
  const editorContext = useMemo(
    () => ({ courseId, canUpload }),
    [courseId, canUpload],
  );
```

6. Replace:

```tsx
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{t("lessons")}</h2>
```

with:

```tsx
  return (
    <LessonEditorProvider value={editorContext}>
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{t("lessons")}</h2>
```

and replace the end of the file:

```tsx
          <Plus className="mr-1.5 size-4" /> {t("addLesson")}
        </Button>
      </div>
    </div>
  );
}
```

with:

```tsx
          <Plus className="mr-1.5 size-4" /> {t("addLesson")}
        </Button>
      </div>
    </div>
    </LessonEditorProvider>
  );
}
```

(Prettier re-indents this in the commit step.)

In `src/components/classroom/course-editor.tsx` replace:

```tsx
          <LessonEditor
            courseId={data.course.id}
            lessons={data.lessons}
            modules={data.modules}
          />
```

with:

```tsx
          <LessonEditor
            courseId={data.course.id}
            lessons={data.lessons}
            modules={data.modules}
            canUpload={data.viewerCanUpload}
          />
```

- [ ] **Step 11: Verify and commit**

Run:
```bash
pnpm vitest run src/components/classroom src/components/article-editor src/lib/upload-to-grant.test.ts src/components/communities/feed
git diff --stat -- src/components/communities/feed/use-video-post.test.tsx
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
node scripts/check-i18n-parity.mjs
```
Expected: all PASS (including the blog article editor tests and every `useVideoPost` test); the `git diff --stat` prints nothing; typecheck, lint and parity clean.

Describe in the task report what the screen hands the code (tested above): the file input hands the picked `File` to `upload`; the hook sends `{ courseId, fileName: file.name, bytes: file.size }` to `startFileUpload`, POSTs the file under the server's content type, then `finishFileUpload({ materialId })`; the node then saves as `hostedFileBlockNode(<id>, <blockId>)`.

```bash
pnpm exec prettier --write src/components/article-editor/rich-text-editor.tsx src/lib/upload-to-grant.ts src/lib/upload-to-grant.test.ts src/components/communities/feed/use-video-post.ts src/components/classroom/materials/use-file-upload.ts src/components/classroom/materials/use-file-upload.test.tsx src/components/classroom/materials/lesson-editor-context.tsx src/components/classroom/materials/hosted-file-node.tsx src/components/classroom/materials/hosted-file-node.test.tsx src/components/classroom/materials/editor-extensions.ts src/components/classroom/materials/embed-node.tsx src/components/classroom/materials/embed-node.test.tsx src/components/classroom/materials/embed-insert.test.tsx src/components/classroom/lesson-editor.tsx src/components/classroom/lesson-editor.test.tsx src/components/classroom/course-editor.tsx
git branch --show-current
git add src/components/article-editor/rich-text-editor.tsx src/lib/upload-to-grant.ts src/lib/upload-to-grant.test.ts src/components/communities/feed/use-video-post.ts src/components/classroom/materials/use-file-upload.ts src/components/classroom/materials/use-file-upload.test.tsx src/components/classroom/materials/lesson-editor-context.tsx src/components/classroom/materials/hosted-file-node.tsx src/components/classroom/materials/hosted-file-node.test.tsx src/components/classroom/materials/editor-extensions.ts src/components/classroom/materials/embed-node.tsx src/components/classroom/materials/embed-node.test.tsx src/components/classroom/materials/embed-insert.test.tsx src/components/classroom/lesson-editor.tsx src/components/classroom/lesson-editor.test.tsx src/components/classroom/course-editor.tsx messages/en.json messages/nl.json
git diff --cached --stat
git commit -m "Classroom files: upload or reuse a file from the lesson editor

Authors the community lets upload get \"Add a file\": pick a file, watch it
upload straight to storage, and it lands in the lesson; or reuse a file
already in the course. The file node is always registered, so lessons with
files load for every author. The editor seam's insertion is now optional,
and the presigned-POST helper moves out of the Reels hook into
src/lib/upload-to-grant.ts, shared by both."
```

---
### Task 8: Course files panel and classroom settings

**Files:**
- Create: `src/components/classroom/course-files-panel.tsx`
- Test: `src/components/classroom/course-files-panel.test.tsx`
- Modify: `src/components/classroom/course-editor.tsx` (import after line 22; render after the `LessonEditor` element)
- Modify: `src/components/communities/settings/classroom-settings.tsx` (whole file)
- Test: `src/components/communities/settings/classroom-settings.test.tsx`
- Modify: `messages/en.json`, `messages/nl.json`

**Interfaces:**
- Consumes: tRPC `classroomMaterials.listCourseMaterials`, `updateMaterial` (`{ materialId, title?, visibility? }`), `deleteMaterial` (`{ materialId }`), `usage` (`{ slug }` → `{ fileBytesStored, fileBytesAllowed }`); `communities.getBySlug().classroomUploadPolicy`; `communities.updateSettings({ slug, classroomUploadPolicy })`; `useConfirm` (`src/components/confirm-dialog.tsx:121`); Task 6 `FileTypeIcon`; Task 2 `formatBytes`, `fileTypeLabel`, `MATERIAL_TITLE_MAX`, `ClassroomUploadPolicy`.
- Produces: `export function CourseFilesPanel(props: { courseId: number }): JSX.Element | null;` and `ClassroomSettings` with the upload policy select and storage bar.

- [ ] **Step 1: Add the strings (en + nl)**

```bash
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
const files = {
  en: {
    panelTitle: "Course files",
    panelHelp: "Files you upload belong to this course. You can use each one in any of its lessons.",
    panelEmpty: "No files yet. Upload one while editing a lesson.",
    titleLabel: "File name",
    previewToggle: "Free preview",
    previewHelp: "Visitors of a public course can download free preview files. Other files are for members only.",
    deleteFile: "Delete file",
    deleteConfirm: "Delete this file? Lessons that use it will show that it was removed.",
    deleted: "File deleted",
    saved: "Saved",
    saveFailed: "Could not save. Please try again.",
    statusUploading: "Still uploading",
    statusFailed: "Didn't upload",
  },
  nl: {
    panelTitle: "Cursusbestanden",
    panelHelp: "Bestanden die je uploadt horen bij deze cursus. Je kunt ze in elke les van de cursus gebruiken.",
    panelEmpty: "Nog geen bestanden. Upload er een terwijl je een les bewerkt.",
    titleLabel: "Bestandsnaam",
    previewToggle: "Gratis voorbeeld",
    previewHelp: "Bezoekers van een openbare cursus kunnen bestanden met gratis voorbeeld downloaden. Andere bestanden zijn alleen voor leden.",
    deleteFile: "Bestand verwijderen",
    deleteConfirm: "Dit bestand verwijderen? Lessen die het gebruiken laten zien dat het is verwijderd.",
    deleted: "Bestand verwijderd",
    saved: "Opgeslagen",
    saveFailed: "Opslaan is niet gelukt. Probeer het opnieuw.",
    statusUploading: "Wordt nog geüpload",
    statusFailed: "Niet geüpload",
  },
};
const settings = {
  en: {
    uploadPolicyTitle: "Who can upload files to courses",
    uploadPolicySubtitle: "Uploaded files use your community's storage. Links to YouTube, Google Slides and similar sites don't.",
    uploadPolicyAllMembers: "All members who write a course",
    uploadPolicyAdminsOnly: "Owners and admins",
    storageTitle: "File storage",
    storageUsed: "{used} of {allowed} used",
  },
  nl: {
    uploadPolicyTitle: "Wie kan bestanden uploaden naar cursussen",
    uploadPolicySubtitle: "Geüploade bestanden gebruiken de opslag van je community. Links naar YouTube, Google Slides en vergelijkbare sites niet.",
    uploadPolicyAllMembers: "Alle leden die een cursus maken",
    uploadPolicyAdminsOnly: "Eigenaren en beheerders",
    storageTitle: "Bestandsopslag",
    storageUsed: "{used} van {allowed} gebruikt",
  },
};
for (const locale of ["en", "nl"]) {
  const path = `messages/${locale}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.classroom.files = { ...(json.classroom.files ?? {}), ...files[locale] };
  json.communities.settings.classroom = {
    ...json.communities.settings.classroom,
    ...settings[locale],
  };
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}
EOF
node scripts/check-i18n-parity.mjs
```
Expected: `i18n parity OK — …`.

- [ ] **Step 2: Write the failing panel test**

`src/components/classroom/course-files-panel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const m = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  invalidate: vi.fn(),
  files: [] as unknown[],
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      classroomMaterials: {
        listCourseMaterials: { invalidate: m.invalidate },
      },
      classrooms: { get: { invalidate: m.invalidate } },
    }),
    classroomMaterials: {
      listCourseMaterials: {
        useQuery: () => ({ data: m.files, isLoading: false, isError: false }),
      },
      updateMaterial: {
        useMutation: () => ({ mutate: m.update, isPending: false }),
      },
      deleteMaterial: {
        useMutation: () => ({ mutate: m.remove, isPending: false }),
      },
    },
  },
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => m.confirm }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CourseFilesPanel } from "./course-files-panel";

const files = en.classroom.files;
const file = (over: Record<string, unknown> = {}) => ({
  id: 7,
  title: "Handout",
  extension: "pdf",
  contentType: "application/pdf",
  bytes: 2048,
  status: "ready",
  visibility: "members",
  failureReason: null,
  createdAt: "2026-09-28T10:00:00.000Z",
  ...over,
});

function renderPanel() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CourseFilesPanel courseId={5} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.files = [file()];
});

describe("CourseFilesPanel", () => {
  it("lists each file with its name, type and size", () => {
    renderPanel();
    expect(screen.getByDisplayValue("Handout")).toBeInTheDocument();
    expect(screen.getByText("PDF · 2 KB")).toBeInTheDocument();
  });

  it("turns a file into a free preview, and back to members only", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("switch", { name: files.previewToggle }));
    expect(m.update).toHaveBeenCalledWith({
      materialId: 7,
      visibility: "preview",
    });

    m.files = [file({ visibility: "preview" })];
    renderPanel();
    fireEvent.click(
      screen.getAllByRole("switch", { name: files.previewToggle })[1]!,
    );
    expect(m.update).toHaveBeenLastCalledWith({
      materialId: 7,
      visibility: "members",
    });
  });

  it("renames on blur, and ignores an unchanged or empty name", () => {
    renderPanel();
    const input = screen.getByLabelText(files.titleLabel);
    fireEvent.change(input, { target: { value: "  Week 1 handout " } });
    fireEvent.blur(input);
    expect(m.update).toHaveBeenCalledWith({
      materialId: 7,
      title: "Week 1 handout",
    });

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("Handout");
  });

  it("asks before deleting, then deletes", async () => {
    m.confirm.mockResolvedValue(true);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: files.deleteFile }));
    await waitFor(() =>
      expect(m.remove).toHaveBeenCalledWith({ materialId: 7 }),
    );
    expect(m.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description: files.deleteConfirm,
        destructive: true,
      }),
    );
  });

  it("keeps the file when the author says no", async () => {
    m.confirm.mockResolvedValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: files.deleteFile }));
    await waitFor(() => expect(m.confirm).toHaveBeenCalled());
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("shows files still uploading or that failed", () => {
    m.files = [
      file({ id: 8, status: "uploading" }),
      file({ id: 9, status: "failed" }),
    ];
    renderPanel();
    expect(screen.getByText(files.statusUploading)).toBeInTheDocument();
    expect(screen.getByText(files.statusFailed)).toBeInTheDocument();
  });

  it("says when there are no files yet", () => {
    m.files = [];
    renderPanel();
    expect(screen.getByText(files.panelEmpty)).toBeInTheDocument();
  });
});
```

Run: `pnpm vitest run src/components/classroom/course-files-panel.test.tsx`
Expected: FAIL. `./course-files-panel` cannot be resolved.

- [ ] **Step 3: Write the panel and show it in the course editor**

`src/components/classroom/course-files-panel.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MATERIAL_TITLE_MAX,
  fileTypeLabel,
  formatBytes,
  type MaterialVisibility,
} from "@/lib/classroom/material-rules";
import { api, type RouterOutputs } from "@/trpc/react";
import { FileTypeIcon } from "./materials/file-type-icon";

type CourseFile =
  RouterOutputs["classroomMaterials"]["listCourseMaterials"][number];

function CourseFileRow({
  file,
  busy,
  onRename,
  onVisibility,
  onDelete,
}: {
  file: CourseFile;
  busy: boolean;
  onRename: (title: string) => void;
  onVisibility: (visibility: MaterialVisibility) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("classroom.files");
  const switchId = `course-file-preview-${file.id}`;
  return (
    <li className="border-border flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
      <FileTypeIcon
        extension={file.extension}
        className="text-muted-foreground size-5 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <Input
          defaultValue={file.title}
          aria-label={t("titleLabel")}
          maxLength={MATERIAL_TITLE_MAX}
          disabled={busy}
          className="h-8"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== file.title) onRename(next);
            else e.target.value = file.title;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {`${fileTypeLabel(file.extension)} · ${formatBytes(file.bytes)}`}
          </span>
          {file.status === "uploading" ? (
            <span className="text-muted-foreground text-xs">
              {t("statusUploading")}
            </span>
          ) : null}
          {file.status === "failed" ? (
            <span className="text-destructive text-xs">
              {t("statusFailed")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          aria-label={t("previewToggle")}
          checked={file.visibility === "preview"}
          disabled={busy}
          onCheckedChange={(on) => onVisibility(on ? "preview" : "members")}
        />
        <Label htmlFor={switchId} className="text-sm font-normal">
          {t("previewToggle")}
        </Label>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t("deleteFile")}
        title={t("deleteFile")}
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

/**
 * The course's uploaded files (spec 2026-09-27 §4): rename, free preview or
 * members only, delete. Deleting frees the community's storage; lessons that
 * still use the file show that it was removed.
 */
export function CourseFilesPanel({ courseId }: { courseId: number }) {
  const t = useTranslations("classroom.files");
  const utils = api.useUtils();
  const confirm = useConfirm();
  const list = api.classroomMaterials.listCourseMaterials.useQuery({
    courseId,
  });

  const refresh = () => {
    void utils.classroomMaterials.listCourseMaterials.invalidate({ courseId });
    void utils.classrooms.get.invalidate();
  };
  const update = api.classroomMaterials.updateMaterial.useMutation({
    onSuccess: () => {
      toast.success(t("saved"));
      refresh();
    },
    onError: () => toast.error(t("saveFailed")),
  });
  const remove = api.classroomMaterials.deleteMaterial.useMutation({
    onSuccess: () => {
      toast.success(t("deleted"));
      refresh();
    },
    onError: () => toast.error(t("saveFailed")),
  });

  async function askToDelete(materialId: number) {
    const ok = await confirm({
      description: t("deleteConfirm"),
      confirmLabel: t("deleteFile"),
      destructive: true,
    });
    if (ok) remove.mutate({ materialId });
  }

  // Only the course author may list its files; anyone else sees nothing here.
  if (list.isLoading || list.isError) return null;
  const files = list.data ?? [];
  const busy = update.isPending || remove.isPending;

  return (
    <section className="space-y-3" aria-labelledby="course-files-title">
      <div className="space-y-1">
        <h2 id="course-files-title" className="text-base font-semibold">
          {t("panelTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("panelHelp")}</p>
        <p className="text-muted-foreground text-xs">{t("previewHelp")}</p>
      </div>
      {files.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("panelEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <CourseFileRow
              key={file.id}
              file={file}
              busy={busy}
              onRename={(title) =>
                update.mutate({ materialId: file.id, title })
              }
              onVisibility={(visibility) =>
                update.mutate({ materialId: file.id, visibility })
              }
              onDelete={() => void askToDelete(file.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
```

In `src/components/classroom/course-editor.tsx`, after `import { LessonEditor } from "@/components/classroom/lesson-editor";` add:

```tsx
import { CourseFilesPanel } from "@/components/classroom/course-files-panel";
```

and directly after the `LessonEditor` element (`canUpload={data.viewerCanUpload}\n          />`) add:

```tsx
          <CourseFilesPanel courseId={data.course.id} />
```

Run: `pnpm vitest run src/components/classroom/course-files-panel.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 4: Write the failing settings test**

`src/components/communities/settings/classroom-settings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

type Usage = { fileBytesStored: number; fileBytesAllowed: number };
const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  usage: { data: undefined } as { data?: Usage },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ communities: { getBySlug: { invalidate: vi.fn() } } }),
    communities: {
      getBySlug: {
        useQuery: () => ({
          data: {
            classroomCreatePolicy: "all_members",
            classroomUploadPolicy: "admins_only",
          },
          isLoading: false,
        }),
      },
      updateSettings: {
        useMutation: () => ({ mutate: m.mutate, isPending: false }),
      },
    },
    classroomMaterials: { usage: { useQuery: () => m.usage } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ClassroomSettings } from "./classroom-settings";

const settings = en.communities.settings.classroom;

function renderSettings() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClassroomSettings slug="town" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.usage = {
    data: { fileBytesStored: 1_288_490_189, fileBytesAllowed: 5 * 1024 ** 3 },
  };
});

describe("ClassroomSettings", () => {
  it("shows how much file storage the community uses", () => {
    renderSettings();
    expect(screen.getByText("1.2 GB of 5 GB used")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: settings.storageTitle }),
    ).toHaveAttribute("aria-valuenow", "24");
  });

  it("asks who can upload files to courses", () => {
    renderSettings();
    expect(screen.getByText(settings.uploadPolicyTitle)).toBeInTheDocument();
    expect(screen.getByText(settings.uploadPolicySubtitle)).toBeInTheDocument();
  });

  it("shows no storage bar until the usage is known", () => {
    m.usage = { data: undefined };
    renderSettings();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
```

Run: `pnpm vitest run src/components/communities/settings/classroom-settings.test.tsx`
Expected: FAIL. The usage text and the upload policy title are not rendered.

- [ ] **Step 5: Add the upload policy and the storage bar to classroom settings**

Replace the whole of `src/components/communities/settings/classroom-settings.tsx` with:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ClassroomCreatePolicy,
  ClassroomUploadPolicy,
} from "@/lib/classroom";
import { formatBytes } from "@/lib/classroom/material-rules";
import { api } from "@/trpc/react";

interface ClassroomSettingsProps {
  slug: string;
}

/**
 * The community's file storage as a bar. Neutral, not Signal Orange (it is
 * a status, not an action); red once the hard limit is reached.
 */
function StorageUsage({ slug }: { slug: string }) {
  const t = useTranslations("communities.settings.classroom");
  const usage = api.classroomMaterials.usage.useQuery({ slug });
  if (!usage.data) return null;
  const { fileBytesStored, fileBytesAllowed } = usage.data;
  const percent =
    fileBytesAllowed > 0
      ? Math.min(100, Math.round((fileBytesStored / fileBytesAllowed) * 100))
      : 100;
  return (
    <div className="space-y-2">
      <Label>{t("storageTitle")}</Label>
      <Progress
        value={percent}
        aria-label={t("storageTitle")}
        className="bg-muted"
        indicatorClassName={
          percent >= 100 ? "bg-destructive" : "bg-foreground/70"
        }
      />
      <p className="text-muted-foreground font-mono text-xs">
        {t("storageUsed", {
          used: formatBytes(fileBytesStored),
          allowed: formatBytes(fileBytesAllowed),
        })}
      </p>
    </div>
  );
}

export function ClassroomSettings({ slug }: ClassroomSettingsProps) {
  const t = useTranslations("communities.settings.classroom");
  const utils = api.useUtils();

  const { data: community, isLoading } = api.communities.getBySlug.useQuery({
    slug,
  });

  const [policy, setPolicy] = useState<ClassroomCreatePolicy>("all_members");
  const [uploadPolicy, setUploadPolicy] =
    useState<ClassroomUploadPolicy>("admins_only");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (community && !initialized) {
      setPolicy(community.classroomCreatePolicy ?? "all_members");
      setUploadPolicy(community.classroomUploadPolicy ?? "admins_only");
      setInitialized(true);
    }
  }, [community, initialized]);

  const updateMutation = api.communities.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(t("saved"));
      void utils.communities.getBySlug.invalidate({ slug });
    },
    onError: () => {
      toast.error(t("saveFailed"));
    },
  });

  const handleChange = (value: ClassroomCreatePolicy) => {
    setPolicy(value);
    updateMutation.mutate({ slug, classroomCreatePolicy: value });
  };

  const handleUploadPolicyChange = (value: ClassroomUploadPolicy) => {
    setUploadPolicy(value);
    updateMutation.mutate({ slug, classroomUploadPolicy: value });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="classroomCreatePolicy">{t("policyTitle")}</Label>
        <p className="text-muted-foreground text-sm">{t("policySubtitle")}</p>
        <Select
          value={policy}
          onValueChange={(v) => handleChange(v as ClassroomCreatePolicy)}
          disabled={updateMutation.isPending}
        >
          <SelectTrigger id="classroomCreatePolicy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_members">{t("policyAllMembers")}</SelectItem>
            <SelectItem value="admins_only">{t("policyAdminsOnly")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="classroomUploadPolicy">{t("uploadPolicyTitle")}</Label>
        <p className="text-muted-foreground text-sm">
          {t("uploadPolicySubtitle")}
        </p>
        <Select
          value={uploadPolicy}
          onValueChange={(v) =>
            handleUploadPolicyChange(v as ClassroomUploadPolicy)
          }
          disabled={updateMutation.isPending}
        >
          <SelectTrigger id="classroomUploadPolicy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admins_only">
              {t("uploadPolicyAdminsOnly")}
            </SelectItem>
            <SelectItem value="all_members">
              {t("uploadPolicyAllMembers")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <StorageUsage slug={slug} />

      {updateMutation.isPending && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-3.5 animate-spin" />
        </div>
      )}
    </div>
  );
}
```

Run: `pnpm vitest run src/components/communities/settings/classroom-settings.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify and commit**

Run:
```bash
pnpm vitest run src/components/classroom src/components/communities/settings
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
node scripts/check-i18n-parity.mjs
```
Expected: all PASS; clean.

```bash
pnpm exec prettier --write src/components/classroom/course-files-panel.tsx src/components/classroom/course-files-panel.test.tsx src/components/classroom/course-editor.tsx src/components/communities/settings/classroom-settings.tsx src/components/communities/settings/classroom-settings.test.tsx
git branch --show-current
git add src/components/classroom/course-files-panel.tsx src/components/classroom/course-files-panel.test.tsx src/components/classroom/course-editor.tsx src/components/communities/settings/classroom-settings.tsx src/components/communities/settings/classroom-settings.test.tsx messages/en.json messages/nl.json
git diff --cached --stat
git commit -m "Classroom files: course files panel and classroom settings

Course authors see every file of the course: rename it, make it a free
preview or members only, or delete it (after a confirm) to free storage.
Community owners and admins choose who can upload files to courses and see
how much of the community's file storage is used."
```

---

### Task 9: Clean up abandoned file uploads

**Files:**
- Create: `src/server/classroom/material-uploads-cleanup.ts`
- Test: `src/server/classroom/material-uploads-cleanup.test.ts`
- Modify: `src/app/api/cron/video-uploads-cleanup/route.ts` (whole file; path and schedule unchanged)
- Test: `src/app/api/cron/video-uploads-cleanup/route.test.ts`

**Interfaces:**
- Consumes: `ABANDONED_UPLOAD_HOURS` (`video-rules.ts:24`); Task 1 `ObjectStorage`, `ObjectStorageSource`, `getObjectStorage`; existing `cleanupAbandonedUploads` (`video-uploads-cleanup.ts:32`), `getVideoStorage`.
- Produces: `cleanupAbandonedMaterialUploads(deps: { payload: Payload; storage: ObjectStorageSource; now?: () => Date; warn?: (message: string, detail: unknown) => void }): Promise<{ removed: number; failed: number }>`. The cron response gains `materials: { removed, failed }` next to the existing `removed`/`failed` (videos).

- [ ] **Step 1: Write the failing cleanup test**

`src/server/classroom/material-uploads-cleanup.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { cleanupAbandonedMaterialUploads } from "./material-uploads-cleanup";

const NOW = new Date("2026-09-28T12:00:00.000Z");

function fakes(
  over: {
    materials?: unknown[];
    removeImpl?: (keys: string[]) => Promise<void>;
  } = {},
) {
  const payload = {
    find: vi.fn().mockResolvedValue({ docs: over.materials ?? [] }),
    delete: vi.fn().mockResolvedValue({}),
  };
  const storage = {
    remove: vi
      .fn()
      .mockImplementation(over.removeImpl ?? (() => Promise.resolve())),
  };
  const getStorage = vi.fn(() => storage);
  const warn = vi.fn();
  return {
    payload,
    storage,
    getStorage,
    warn,
    deps: {
      payload: payload as never,
      storage: getStorage as never,
      now: () => NOW,
      warn,
    },
  };
}

const upload = (id: number) => ({
  id,
  storageKey: `private/classroom/c1/12/${id}.pdf`,
});

describe("cleanupAbandonedMaterialUploads", () => {
  it("deletes the file and the record of uploads unfinished after 24 hours", async () => {
    const { deps, payload, storage } = fakes({ materials: [upload(1)] });
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 1,
      failed: 0,
    });
    expect(payload.find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { status: { equals: "uploading" } },
          { createdAt: { less_than: "2026-09-27T12:00:00.000Z" } },
        ],
      },
      sort: "createdAt",
      limit: 200,
      depth: 0,
    });
    expect(storage.remove).toHaveBeenCalledWith([
      "private/classroom/c1/12/1.pdf",
    ]);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 1,
    });
  });

  it("reaches storage only when there is something to remove", async () => {
    const { deps, getStorage } = fakes();
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 0,
      failed: 0,
    });
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("keeps going when one upload fails, and leaves that one for tomorrow", async () => {
    const { deps, payload } = fakes({
      materials: [upload(1), upload(2)],
      removeImpl: (keys) =>
        keys[0]?.endsWith("/1.pdf")
          ? Promise.reject(new Error("s3 down"))
          : Promise.resolve(),
    });
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 1,
      failed: 1,
    });
    expect(payload.delete).toHaveBeenCalledTimes(1);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 2,
    });
  });

  it("warns when a full page means more may remain", async () => {
    const { deps, warn } = fakes({
      materials: Array.from({ length: 200 }, (_, i) => upload(i + 1)),
    });
    await cleanupAbandonedMaterialUploads(deps);
    expect(warn).toHaveBeenCalledWith(
      "[material-uploads-cleanup] page full; more abandoned uploads may remain",
      { pageSize: 200 },
    );
  });
});
```

Run: `pnpm vitest run src/server/classroom/material-uploads-cleanup.test.ts`
Expected: FAIL. `./material-uploads-cleanup` cannot be resolved.

- [ ] **Step 2: Write the cleanup**

`src/server/classroom/material-uploads-cleanup.ts`:

```ts
import { ABANDONED_UPLOAD_HOURS } from "@/lib/video-rules";
import type {
  ObjectStorage,
  ObjectStorageSource,
} from "@/server/media/object-storage";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/** Uploads handled per run; the oldest go first, the rest wait a day. */
const CLEANUP_PAGE_SIZE = 200;

/**
 * Daily sweep for classroom file uploads nobody finished within
 * ABANDONED_UPLOAD_HOURS (spec 2026-09-27 §5.2 step 5). The stored object (if
 * any) and the record are both deleted, which also frees the community's
 * storage allowance. finishFileUpload refuses uploads older than
 * FINISH_WINDOW_HOURS (< ABANDONED_UPLOAD_HOURS), so a finish and this sweep
 * never act on the same upload at once.
 *
 * One upload's failure must not abort the run: it's caught, logged, and the
 * upload is left for tomorrow's run. Storage is reached only when there is
 * something to remove.
 */
export async function cleanupAbandonedMaterialUploads(deps: {
  payload: Payload;
  storage: ObjectStorageSource;
  now?: () => Date;
  warn?: (message: string, detail: unknown) => void;
}): Promise<{ removed: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(
    now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000,
  );
  const { docs } = await deps.payload.find({
    collection: "hosted-materials",
    where: {
      and: [
        { status: { equals: "uploading" } },
        { createdAt: { less_than: cutoff.toISOString() } },
      ],
    },
    sort: "createdAt",
    limit: CLEANUP_PAGE_SIZE,
    depth: 0,
  });
  if (docs.length >= CLEANUP_PAGE_SIZE) {
    (deps.warn ?? console.warn)(
      "[material-uploads-cleanup] page full; more abandoned uploads may remain",
      { pageSize: CLEANUP_PAGE_SIZE },
    );
  }

  let storage: ObjectStorage | null = null;
  let removed = 0;
  let failed = 0;
  for (const material of docs) {
    try {
      storage ??= deps.storage();
      await storage.remove([material.storageKey]);
      await deps.payload.delete({
        collection: "hosted-materials",
        id: material.id,
      });
      removed++;
    } catch (error) {
      failed++;
      console.error("[material-uploads-cleanup] failed", {
        materialId: material.id,
        error,
      });
    }
  }
  return { removed, failed };
}
```

Run: `pnpm vitest run src/server/classroom/material-uploads-cleanup.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Write the failing cron route test**

`src/app/api/cron/video-uploads-cleanup/route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  videos: vi.fn(),
  materials: vi.fn(),
  getVideoStorage: vi.fn(),
  getObjectStorage: vi.fn(),
  payload: { name: "payload" },
}));

vi.mock("@/server/communities/video-uploads-cleanup", () => ({
  cleanupAbandonedUploads: m.videos,
}));
vi.mock("@/server/classroom/material-uploads-cleanup", () => ({
  cleanupAbandonedMaterialUploads: m.materials,
}));
vi.mock("@/server/media/video-storage", () => ({
  getVideoStorage: m.getVideoStorage,
}));
vi.mock("@/server/media/object-storage", () => ({
  getObjectStorage: m.getObjectStorage,
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => m.payload,
}));

import { GET } from "./route";

const CRON_URL = "https://app.test/api/cron/video-uploads-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
  m.videos.mockResolvedValue({ removed: 1, failed: 0 });
  m.materials.mockResolvedValue({ removed: 2, failed: 1 });
});

describe("video-uploads-cleanup cron", () => {
  it("refuses a caller without the cron secret", async () => {
    const res = await GET(new Request(CRON_URL));
    expect(res.status).toBe(401);
    expect(m.videos).not.toHaveBeenCalled();
    expect(m.materials).not.toHaveBeenCalled();
  });

  it("sweeps abandoned video and classroom file uploads, handing storage over lazily", async () => {
    const res = await GET(
      new Request(CRON_URL, { headers: { authorization: "Bearer cron-secret" } }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      removed: 1,
      failed: 0,
      materials: { removed: 2, failed: 1 },
    });
    expect(m.videos).toHaveBeenCalledWith({
      payload: m.payload,
      storage: m.getVideoStorage,
    });
    expect(m.materials).toHaveBeenCalledWith({
      payload: m.payload,
      storage: m.getObjectStorage,
    });
    expect(m.getObjectStorage).not.toHaveBeenCalled();
    expect(m.getVideoStorage).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm vitest run src/app/api/cron/video-uploads-cleanup/route.test.ts`
Expected: FAIL. The second test finds no `materials` in the response and `m.materials` not called.

- [ ] **Step 4: Run both sweeps from the existing cron**

Replace the whole of `src/app/api/cron/video-uploads-cleanup/route.ts` with:

```ts
import { NextResponse } from "next/server";

import { cleanupAbandonedMaterialUploads } from "@/server/classroom/material-uploads-cleanup";
import { cleanupAbandonedUploads } from "@/server/communities/video-uploads-cleanup";
import { getObjectStorage } from "@/server/media/object-storage";
import { getVideoStorage } from "@/server/media/video-storage";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron job: runs daily to delete the files and records of uploads nobody
 * finished within ABANDONED_UPLOAD_HOURS — Reels video grants and classroom
 * file uploads. Protected by CRON_SECRET header. The path keeps its old name
 * so the Vercel cron schedule is unchanged.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();
  // Lazy storage: only reached when an abandoned upload's files need removing.
  const videos = await cleanupAbandonedUploads({
    payload,
    storage: getVideoStorage,
  });
  const materials = await cleanupAbandonedMaterialUploads({
    payload,
    storage: getObjectStorage,
  });

  return NextResponse.json({
    success: true,
    removed: videos.removed,
    failed: videos.failed,
    materials,
    timestamp: new Date().toISOString(),
  });
}
```

Run: `pnpm vitest run src/app/api/cron/video-uploads-cleanup/route.test.ts src/server/communities/video-uploads-cleanup.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run:
```bash
pnpm vitest run src/server/classroom src/server/communities/video-uploads-cleanup.test.ts src/app/api/cron
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
```
Expected: all PASS; clean.

```bash
pnpm exec prettier --write src/server/classroom/material-uploads-cleanup.ts src/server/classroom/material-uploads-cleanup.test.ts src/app/api/cron/video-uploads-cleanup/route.ts src/app/api/cron/video-uploads-cleanup/route.test.ts
git branch --show-current
git add src/server/classroom/material-uploads-cleanup.ts src/server/classroom/material-uploads-cleanup.test.ts src/app/api/cron/video-uploads-cleanup/route.ts src/app/api/cron/video-uploads-cleanup/route.test.ts
git diff --cached --stat
git commit -m "Classroom files: the daily cleanup also removes abandoned file uploads

A classroom file upload still unfinished after 24 hours has its stored file
and record deleted, which frees the community's storage. The existing
upload-cleanup cron runs both sweeps; its path and schedule are unchanged."
```

---

### Task 10: Whole-branch verification and PR

**Files:** none new. This task checks the whole branch; the controller opens the PR.

- [ ] **Step 1: Full suites**

Run:
```bash
SKIP_ENV_VALIDATION=1 pnpm typecheck
pnpm lint
SKIP_ENV_VALIDATION=1 pnpm test
node scripts/check-i18n-parity.mjs
bash /Users/greg/coding-projects/aitcom/.claude/worktrees/classroom-hosted-files/dbtest.sh src/server/api/routers/classroom-materials.integration.test.ts src/server/api/routers/classroom-lesson-materials.integration.test.ts src/server/api/routers/classroom-lessons.integration.test.ts src/server/api/routers/classroom-access.integration.test.ts src/server/api/routers/communities.integration.test.ts src/migrations/lesson-youtube-to-embed.integration.test.ts
```
Expected: all green; the DB files executed (not skipped). Record any pre-existing unrelated failure by name and show it also fails on `origin/main`.

- [ ] **Step 2: Hop-by-hop check of the new fields**

Confirm each new value travels every hop (grep, then read the hits):
```bash
grep -rn "classroomUploadPolicy" src --include='*.ts' --include='*.tsx' | grep -v payload-types
grep -rn "viewerCanUpload\|materials\b" src/server/api/routers/classrooms.ts src/components/classroom/course-view.tsx src/components/classroom/course-editor.tsx
grep -rn "HostedFile" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```
Expected hops:
- `classroomUploadPolicy`: schema → migration → `updateSettings` input → `getBySlug` (row spread) → `classroom-settings.tsx` → `mayUploadMaterials` → `startFileUpload` and `classrooms.get().viewerCanUpload` → `course-editor.tsx` → `LessonEditor canUpload` → the editor's extension list.
- `HostedFile`: `Lessons.ts` block → `lesson-body.ts` helpers → `lesson-materials.ts` (save check + manifest) → `block-renderers.tsx` → `hosted-file-card.tsx`; and `hosted-file-node.tsx` → `editor-extensions.ts` → `lesson-editor.tsx`.

- [ ] **Step 3: Parallel-work check**

```bash
git fetch origin -q
git log origin/main --oneline -20
gh pr list --state open --json number,title,headRefName
git ls-tree --name-only origin/main src/migrations/ | tail -5
```
Look for another session shipping hosted files, the same collection, or a migration named `20260928c_*` / `20260928d_*`. If `main` moved, rebase this branch onto the updated base (this branch is stacked on `feat/classroom-lesson-embeds`; after #361 merges, rebase onto `origin/main`). If a migration name collides, rename ours to the next free letter (file, `index.ts` import + entry, shape tests) and re-apply to the test DB with the guarded one-off script from Task 2 Step 11.

- [ ] **Step 4: Clean tree**

Run: `git status --short`
Expected: empty (no stray `scripts/tmp-apply-test-migration.ts`, no untracked files of ours).

- [ ] **Step 5: Push and open the PR** (the controller does this after the final review)

PR description (no AI credit lines) must include:
- **What trainers get:** upload a PDF, slides, a document, a spreadsheet, a ZIP or an image (up to 200 MB) into a lesson; reuse it in any lesson of the course; members-only or free preview; course files panel. Community owners/admins: who can upload (default owners and admins) and a storage bar (5 GB per community today).
- **Patterns:** Adapter (`object-storage.ts`) + Facade (`video-storage.ts` unchanged API, Reels tests untouched); pure rule modules (`material-rules.ts`, `material-access.ts` — one download rule for links and the manifest); service with injected dependencies (`hosted-files.ts`) behind a thin router; single allowance seam (`media-allowance.ts`) for future paid plans; references-only lesson blocks with a read-time manifest; optional insertion in the editor extension seam.
- **Rejected:** growing `classrooms.ts` (new router instead); putting links in the manifest (links are minted on demand); trusting the browser's content type or size (derived type; grant pinned to the declared size; HEAD check at finish); refusing saves that reference a deleted file (it would lock authors out of their own lessons).
- **Known gap:** editor toolbar/slash labels ("Add a file", like the existing "Embed slides or video") are English-only because the shared editor has no translation seam; noted on the classroom materials ticket.
- **Deploy:** migrations `20260928c_classroom_upload_policy` and `20260928d_hosted_materials` run automatically in the Vercel build before the new code serves traffic.
- **Setup the product owner runs before uploads work in production (AWS IAM):** grant the app's IAM user `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/private/classroom/*` and `s3:ListBucket` on `arn:aws:s3:::<bucket>` with condition `s3:prefix` = `private/classroom/*` (today's grants cover `media/videos/*` and `private/videos/*` only). Confirm `private/` stays non-public. Bucket CORS already allows POST from the site (Reels).

---

## Self-review notes

- **Spec coverage (slice 2):**
  - §1 access policy: `fileLink` uses `loadCourseAccess` on the file's own course; manifest uses the viewer's course access (Tasks 4, 5).
  - §2.1 `hosted-materials`: Task 3 (video fields deferred to slice 3, as the brief says).
  - §2.3 `classroomUploadPolicy`: Task 2 (+ settings UI in Task 8).
  - §3.2 `HostedFile` block, §3.3 manifest without URLs: Task 5; renderer: Task 6.
  - §3.5 editor "Upload a file" and "Reuse from this course": Task 7 (the file node offers both). "Upload a video" is slice 3.
  - §4.1 object storage generalisation: Task 1. §4.2 upload flow: Task 4 (+ Task 7 client). §4.3 download with Content-Disposition: Tasks 1, 4, 6.
  - §7 allowance (files): Task 3 (+ checks Task 4, usage bar Task 8). Video/viewing allowance is slice 3.
  - §8 errors: interrupted upload (retry by picking again; record discarded), never finished (Task 9), deleted-but-referenced (Tasks 5, 6), allowance exceeded (Tasks 4, 7).
  - §9 tests: pure units (rules, policy, allowance, manifest, lesson body), adapter, service fakes, router DB tests with S3 mocked, component tests asserting the calls the screen makes, Reels suites unchanged (Tasks 1, 7).
  - §10 setup: IAM note in Global Constraints and Task 10.
- **Placeholder scan:** every code step has complete code; commands and expected results are given.
- **Names used across tasks:** `ObjectStorage`, `ObjectStorageSource`, `getObjectStorage`, `contentDisposition`; `MAX_FILE_BYTES`, `MATERIAL_*`, `fileExtensionOf`, `materialObjectKey`, `downloadFileName`, `formatBytes`, `fileTypeLabel`, `isInlinePreviewable`; `canUploadMaterials`, `ClassroomUploadPolicy`; `HostedMaterial`, `allowanceFor`, `usageFor`, `exceedsAllowance`; `mayDownloadMaterial`, `materialAccessFor`, `buildMaterialsManifest`, `MaterialSummary`, `MaterialsManifest`, `MaterialViewer`; `requireEditableCourse`; `HostedFileDeps`, `CourseMaterial`, `mayUploadMaterials`, `startFileUpload`, `finishFileUpload`, `fileLink`, `listCourseMaterials`, `updateMaterial`, `deleteMaterial`; `hostedFileBlockNode`, `isMaterialId`, `collectMaterialIds`, `stripIncompleteMaterials`; `assertLessonMaterials`, `loadMaterialsManifest`; `MaterialsManifestProvider`, `useMaterialSummary`, `HostedFileCard`, `FileTypeIcon`, `startDownload`; `uploadToGrant`, `UploadGrant`, `useFileUpload`, `LessonEditorProvider`, `useLessonEditorContext`, `HostedFileNode`, `hostedFileExtension`, `hostedFileInsertable`, `embedExtension`, `classroomEditorExtensions`, `classroomEditorExtensionsWithUploads`; `CourseFilesPanel`; `cleanupAbandonedMaterialUploads`.
- **Review Focus coverage:** (1) Task 2 rules tests + Task 4 "refuses … and leaves nothing behind"; (2) Task 4 "bigger than declared" + grant `maxBytes: 2048` assertions (unit and DB); (3) Task 5 `INVALID_MATERIAL` DB test + foreign id → `removed` in the manifest; (4) Task 5 "still saves a lesson that uses a file the author has since deleted" + Task 6 "says a deleted file was removed"; (5) Task 4 "returns a ready file unchanged on a second finish" and "answers UPLOAD_EXPIRED … touches nothing".
