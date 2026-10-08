# One composer for posts and comments — design

**Date:** 2026-10-08
**Status:** proposed
**Builds on:** the feed post editor (`src/components/communities/feed/editor/`),
post mentions (`src/server/communities/post-mentions.ts`), post media
(`src/server/communities/post-media.ts`, `feed-images.ts`)

## Problem

A feed comment is a plain textarea: no emoji, no formatting, no clickable
links, no mentions, no GIF, no picture. Writing a post has all of these. A
reply is where most conversation happens, and today it is the poorest place
to write.

The post composer and the post edit form also repeat much of the same
wiring (text + mentions + draft setup, the media "one kind at a time" rules,
the toolbar, hidden file inputs, GIF error mapping, busy state). A comment
box built the same way would be a third copy.

## Goal

1. **A comment can say what a post can say, at reply size:** formatting,
   emoji, links, @mentions, and one GIF or one picture.
2. **One composer, configured per screen.** Posts, post edits, comments and
   comment edits are the same component with a different tool set. A new tool,
   or a changed limit, is one change in one place.
3. **The server handles media and mentions for "a post or a comment"
   through shared seams,** not a copy of the post code.

What makes this ours: replies stay light on purpose. No video, no polls,
one attachment. The conversation stays readable.

## Non-goals

- Forum replies. They store Lexical rich text, not the feed's text format,
  and get their own design later.
- Video or polls in comments.
- More than one picture per comment (the field allows raising the cap later).
- Agents writing comments with media or mentions. Agents keep writing plain
  text; they only *read* the new fields.
- Email for comment mentions (see Open questions).
- Changing post behaviour, apart from the edit form uploading on pick (below).

## Decisions taken in brainstorming

| Question | Decision |
|---|---|
| Pictures per comment | One |
| GIF and picture together | No: one attachment kind at a time, as on posts |
| Comment without words | Allowed with a GIF or picture |
| Comment length | 1,000 characters (unchanged) |
| Drafts | Yes, per post (new comment) and per comment (edit) |
| Mention notification link | The post, with its comments open |
| Structure | One `Composer` configured by a tool set (approach A); rejected: shared hooks with separate forms (B), a third form from existing parts (C) |
| Rollout | Three PRs in order, each safe alone; no feature flag |

## Design

### 1. Data model (`feed-comments`, one migration)

| Field | Type | Notes |
|---|---|---|
| `images` | upload → `media`, `hasMany`, `maxRows: 1` | Same shape as posts so `imageIdsOf` and the gallery work unchanged |
| `gif` | group: `giphyId, title, mp4Url, stillUrl, width, height` | Same fields as `feed-posts.gif` |
| `mentions` | json `[{ userId, name }]` | Same shape as posts |
| `content` | text, `maxLength: 1000`, **no longer `required`** | The router requires words or media |

The migration is additive: new columns on `feed_comments`, a new
`feed_comments_rels` table (Payload's `hasMany` upload storage) and
`content` dropping `NOT NULL`. Regenerate `payload-types.ts`.

### 2. Server

**Router (`feed.ts`).**

```ts
// shared with posts, narrowed per target
type CommentMedia =
  | { kind: "images"; images: [{ id: number; alt: string }] } // exactly 1
  | { kind: "gif"; giphyId: string };

addComment:  { postId, content: string (0..1000), media?: CommentMedia, mentions?: string[] (≤10) }
editComment: { commentId, content, media: { kind: "keep" } | { kind: "none" } | CommentMedia, mentions?: string[] }
```

- Words or media required (the post rule `mayGoWithoutWords`, applied to
  comments: a GIF or picture may go without words).
- `getComments` returns the new fields, with mentions decorated the same
  way as posts (`loadMentionViews`).
- `deleteComment` clears `content`, `images`, `gif` and `mentions`.

**Shared seams (one place each, target-aware).**

- **Media owner.** `claimFeedImages(payload, userId, choices, owner)` where
  `owner` is `{ collection: "feed-posts" | "feed-comments", id?: number }`.
  It refuses a picture used by *any* post or comment other than `owner`.
  Same purpose value (`feed-post`); the `Media.purpose` description is
  updated to "belongs to one post or comment".
- **Media writes.** `post-media.ts` already owns `lookUpGif`, `gifFields`,
  `NO_GIF`. A comment media change goes through the same functions; a
  `setCommentMedia` beside `setPostMedia` handles the comment's own columns,
  sharing the release-old-pictures step.
- **Cleanup.** `unused-feed-images-sweep.ts` counts a picture as used if any
  post *or comment* links it (`feed_comments_rels` path `images`). The media
  before-delete hook also unlinks it from comments.
- **Mentions (Strategy).** `notifyNewMentions` takes a `MentionTarget`:

  ```ts
  interface MentionTarget {
    type: "post_mention" | "comment_mention";  // notification type
    dedupeKey: { field: "postId" | "commentId"; id: number };
    message(actorName: string): LocalizedText;  // "mentioned you in a comment"
    path(): string;                              // post URL with comments open
  }
  ```

  `postMentionTarget(post)` and `commentMentionTarget(comment, post)` build
  it. `resolveMentions` (active members whose name appears in the text) and
  `mentionsIn` (merge on edit) are reused as they are.
- **Hooks on `feed-comments`** mirror posts: `beforeChange` merges mentions
  (empties them on delete); `afterChange` notifies new mentions. Every Payload
  call inside them passes `req`, so it stays in the same transaction (the
  2026-10-07 comment hang came from a hook that did not, see #429). The
  comment counter stays in `syncFeedPostCounters`.
- **Agents.** `getFeedComments` / MCP `get-feed-comments` add optional
  `imageUrl` and `gif.mp4Url` to each comment. Additive; agent writes are
  unchanged and plain-text only.

### 3. Client

**Tool set (`editor/composer-tools.ts`).**

```ts
export interface ComposerTools {
  format: boolean; emoji: boolean; mention: boolean;
  gif: boolean; pictures: number; // 0 = none
  video: boolean; poll: boolean;
  maxLength: number;
}
export const POST_TOOLS: ComposerTools    = { format: true, emoji: true, mention: true, gif: true, pictures: 4, video: true,  poll: true,  maxLength: POST_MAX_LENGTH };
export const COMMENT_TOOLS: ComposerTools = { format: true, emoji: true, mention: true, gif: true, pictures: 1, video: false, poll: false, maxLength: COMMENT_MAX_LENGTH };
```

**`useComposerMedia(tools, initial?)`.** Owns the attachment state
(`none | pictures | gif | video | poll`), "one kind at a time" with the
existing undo toast, picture uploads capped by `tools.pictures`
(`usePictureUploads` takes the cap instead of its constant), and produces
`createMedia()` and `editMedia()` (`keep | none | …`) for the server.

**`Composer`.** `PostEditor` + a toolbar rendered from `tools` + attachment
previews + draft + shortcuts. Props: `tools`, `communitySlug`, `draftKey`,
`initial` (for edits), `submitLabel`, `onSubmit(value)`, `variant:
"full" | "compact"`, and an `extras` slot for screen-only controls (topic
picker, Discard). `PostEditor` and `usePostText` take `maxLength` instead of
the fixed `POST_MAX_LENGTH`.

**Screens.**

| Screen | Built as |
|---|---|
| Post box | `Composer` + `POST_TOOLS` + topic picker in `extras` |
| Post edit form | `Composer` + `POST_TOOLS`, `initial` from the post, Discard / Escape in `extras` |
| Comment box (new) | `Composer` + `COMMENT_TOOLS`, `variant="compact"`, draft `comment:<postId>` |
| Comment edit | same, `initial` from the comment, draft `comment-edit:<commentId>` |

The reels viewer uses `FeedComments`, so it gets the new box with no
separate work.

**Behaviour change:** the post edit form uploads a picture when it is
picked, as the post box does, instead of on Save. A picture picked and then
discarded is removed by the existing unused-image sweep.

**Display.** Comment text renders with `FormattedPostText` (formatting,
links, mentions). A comment's GIF (`FeedGif`) or picture
(`FeedImageGallery`, one item) shows under the text at a smaller size.
Visuals follow DESIGN.md: compact icon toolbar, border-defined surfaces,
Signal Orange only on the Post button (One Voice Rule).

### 4. Errors and edge cases

- **Upload failed or running:** the picture shows its state with retry; Post
  is disabled until it is uploaded.
- **GIF gone / GIPHY down:** the existing `gifGone` / `gifBusy` messages.
- **Mentions:** active community members only, at most 10, self-mentions
  ignored, only newly added people are told on edit, nobody is told twice,
  a deleted comment tells no one.
- **Picture reuse:** a picture already on another post or comment is refused.
- **No words:** allowed only with a GIF or picture; otherwise Post is
  disabled and the server refuses.
- **Delete:** media and mentions cleared; the picture is released for the
  sweep. Moderators delete as today.
- **Drafts** clear after a successful send.
- **Accessibility (WCAG 2.2 AA):** alt text required for a picture, as on
  posts; toolbar reachable by keyboard with labelled icons; GIF honours
  reduced motion.
- **i18n:** every new string in `messages/en.json` and `messages/nl.json`
  under `communities.feed`.

## Rollout

Three PRs, merged in order. Each is safe alone, so no feature flag.

1. **Shared composer for posts.** `ComposerTools`, `useComposerMedia`,
   `Composer`; the post box and edit form rebuilt on them. The existing
   `post-composer` and `post-edit-form` tests pass **unchanged**.
2. **Comments learn media and mentions (migration).** Fields, router,
   shared seams, sweep, `comment_mention`, agent read fields. Additive: the
   current comment box keeps working.
3. **Comment box and display.** `COMMENT_TOOLS`, compact variant, rendering,
   drafts, en/nl strings.

## Testing

- **Unit:** `useComposerMedia` (one kind at a time, undo, cap from tools,
  create/edit output); `Composer` shows only the tools in its set and
  enforces `maxLength`; `commentMentionTarget` message, path and dedupe key.
- **DB integration (local test DB):** comment with a picture, with a GIF,
  GIF without words; edit swapping picture → GIF releases the picture;
  delete clears media and mentions; the sweep keeps a comment's picture; a
  mention notifies once and an edit does not repeat it; someone else's or an
  already used picture is refused.
- **Component:** the comment box sends the expected payload (assert the
  mutation call, not the rendered result).
- **Browser:** on the local Docker stack (not `pnpm dev`, whose `.env` is
  production): a comment with a GIF, one with a picture, one with a mention.
- **Each PR:** full vitest suite, `tsc`, eslint, prettier.

## Open questions

1. **Email for comment mentions.** Post mentions also email the member
   (`app.post_mention_mail_log`, one email per member per post). This design
   sends comment mentions in-app only. Adding email means deciding whether a
   comment mention on a post that already emailed the member sends again.
