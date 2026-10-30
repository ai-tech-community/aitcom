// src/app/api/mcp/community-tools.ts
//
// Registers community MCP tools on the McpServer instance.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";
import { COMMUNITY_DESCRIPTION_MAX } from "@/lib/communities/description";
import {
  FORUM_THREAD_CONTENT_MAX,
  FORUM_THREAD_TITLE_MAX,
  FORUM_THREAD_TITLE_MIN,
} from "@/server/communities/forum-thread-draft";
import {
  ADDITIVE_WRITE,
  DESTRUCTIVE_WRITE,
  DRAFT_FOR_REVIEW,
  READ_ONLY,
} from "@/server/mcp/tool-annotations";

type Caller = ReturnType<typeof createCaller>;

export function registerCommunityTools(
  server: McpServer,
  caller: Caller,
  _keyData: { ownerId: string | null; agentId: string },
): void {
  // ── Community read ──────────────────────────────────────────────────────

  server.registerTool(
    "browse-communities",
    {
      description:
        "Browse public communities listed in the directory. Optionally filter by name. Returns community name, slug, description, join policy, and member count.",
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe("Optional search term to filter communities by name."),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max communities to return."),
      },
      annotations: READ_ONLY,
    },
    async ({ search, limit }) => {
      const result = await caller.agent.browseCommunities({ search, limit });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "get-community-info",
    {
      description:
        "Get detailed information about a specific community by slug. Returns settings, member count, the owner's membership status/role, spaces, the community magazine's logo and cover when it has one, and the full stored description. spaces lists each space with type (forum, events, classroom, ideas, members, magazine, or room), enabled (false when the space is hidden), and slug. logoUrl and bannerUrl are the stored image URLs. logoMediaId and bannerMediaId are the media ids for those URLs when the image is in shared media, or null. bannerAlt is the banner's alt text. The magazine object includes logo and cover media id, URL, and alt text. descriptionTruncated is false: this tool does not shorten the text. A row saved under an older 500-character limit is returned as stored.",
      inputSchema: {
        slug: z.string().describe("The community slug."),
      },
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const result = await caller.agent.getCommunityInfo({ slug });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "get-owner-communities",
    {
      description:
        "List all communities the owner belongs to, including their role and membership status in each.",
      annotations: READ_ONLY,
    },
    async () => {
      const result = await caller.agent.getOwnerCommunities();
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── Community membership ────────────────────────────────────────────────

  server.registerTool(
    "join-community",
    {
      description:
        "Join an open community on behalf of the owner. Only works for communities with an 'open' join policy.",
      inputSchema: {
        slug: z.string().describe("The community slug to join."),
      },
      annotations: ADDITIVE_WRITE,
    },
    async ({ slug }) => {
      const result = await caller.agent.joinCommunity({ slug });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "request-to-join-community",
    {
      description:
        "Request to join a community that requires approval. Creates a pending membership request for community admins to review.",
      inputSchema: {
        slug: z
          .string()
          .describe("The community slug to request membership in."),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ slug }) => {
      const result = await caller.agent.requestToJoinCommunity({ slug });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "leave-community",
    {
      description:
        "Leave a community on behalf of the owner. Cannot leave if the owner is the last owner — transfer ownership first.",
      inputSchema: {
        slug: z.string().describe("The community slug to leave."),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ slug }) => {
      const result = await caller.agent.leaveCommunity({ slug });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "accept-community-invite",
    {
      description:
        "Accept a community invite link on behalf of the owner. Uses the invite code to join the community.",
      inputSchema: {
        code: z.string().describe("The invite code (from the invite link)."),
      },
      annotations: ADDITIVE_WRITE,
    },
    async ({ code }) => {
      const result = await caller.agent.acceptCommunityInvite({ code });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── Community creation ──────────────────────────────────────────────────

  server.registerTool(
    "create-community",
    {
      description:
        "Create a new community on behalf of the owner. The owner becomes the community owner automatically. logoUrl is an optional http(s) logo.",
      inputSchema: {
        name: z
          .string()
          .min(2)
          .max(100)
          .describe("Community name (2-100 characters)."),
        description: z
          .string()
          .max(COMMUNITY_DESCRIPTION_MAX)
          .optional()
          .describe(
            `Community description (max ${COMMUNITY_DESCRIPTION_MAX} characters, same as the create form).`,
          ),
        joinPolicy: z
          .enum(["open", "invite_only", "approval_required"])
          .default("open")
          .describe("Who can join: open, invite_only, or approval_required."),
        isListedInDirectory: z
          .boolean()
          .default(false)
          .describe("Whether the community appears in the public directory."),
        logoUrl: z
          .string()
          .url()
          .max(1000)
          .optional()
          .describe("Optional http(s) logo URL."),
      },
      annotations: ADDITIVE_WRITE,
    },
    async ({ name, description, joinPolicy, isListedInDirectory, logoUrl }) => {
      const result = await caller.agent.createCommunity({
        name,
        description,
        joinPolicy,
        isListedInDirectory,
        ...(logoUrl !== undefined ? { logoUrl } : {}),
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── Community admin ─────────────────────────────────────────────────────

  server.registerTool(
    "update-community-settings",
    {
      description:
        "Update community settings. Name, description, logo, banner, join policy, directory listing, and who can create classrooms require the owner's admin or owner role, the same as the settings pages. logoUrl is a logo URL (null removes it) and remains for compatibility. logoMediaId is a media id from upload-image (null removes the logo); send logoUrl or logoMediaId, not both. bannerUrl is an http(s) banner URL and bannerMediaId is a media id from upload-image; send one of them, not both. Null removes the banner. bannerAlt is the banner's alt text. magazineLogoMediaId is a media id from upload-image (null removes the logo) and requires the same manage permission as the magazine settings page. Magazine logo and cover are also written by update-magazine. If the community has no magazine yet, or the media id is unknown, that field is skipped and the response includes a warning for magazineLogoMediaId; the other fields are still saved. A saved magazine logo bumps updatedAt. The description limit matches the settings form.",
      inputSchema: {
        slug: z.string().describe("The community slug to update."),
        name: z
          .string()
          .min(2)
          .max(100)
          .optional()
          .describe("New community name."),
        description: z
          .string()
          .max(COMMUNITY_DESCRIPTION_MAX)
          .optional()
          .describe(
            `New community description (max ${COMMUNITY_DESCRIPTION_MAX} characters).`,
          ),
        logoUrl: z
          .string()
          .url()
          .optional()
          .nullable()
          .describe(
            "New community logo URL, or null to remove. Omit this when you send logoMediaId.",
          ),
        logoMediaId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe(
            "Media id from upload-image for the community logo. Null removes it. Requires admin or owner. Omit this when you send logoUrl.",
          ),
        bannerUrl: z
          .string()
          .url()
          .nullable()
          .optional()
          .describe(
            "http(s) banner URL. Null removes the banner. Send bannerUrl or bannerMediaId, not both.",
          ),
        bannerMediaId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe(
            "Media id from upload-image for the community banner. Null removes it. Requires admin or owner.",
          ),
        bannerAlt: z
          .string()
          .max(200)
          .nullable()
          .optional()
          .describe("Alt text for the banner. Null clears it."),
        magazineLogoMediaId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe(
            "Media id from upload-image for the magazine logo. Null removes it. Requires magazine manage permission.",
          ),
        joinPolicy: z
          .enum(["open", "invite_only", "approval_required"])
          .optional()
          .describe("New join policy."),
        isListedInDirectory: z
          .boolean()
          .optional()
          .describe("Whether to list in the public directory."),
        classroomCreatePolicy: z
          .enum(["all_members", "admins_only"])
          .optional()
          .describe(
            "Who may create a classroom. Same setting as the classroom settings page. all_members is the default and matches current communities.",
          ),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({
      slug,
      name,
      description,
      logoUrl,
      logoMediaId,
      bannerUrl,
      bannerMediaId,
      bannerAlt,
      magazineLogoMediaId,
      joinPolicy,
      isListedInDirectory,
      classroomCreatePolicy,
    }) => {
      const result = await caller.agent.updateCommunitySettings({
        slug,
        name,
        description,
        logoUrl,
        logoMediaId,
        ...(bannerUrl !== undefined ? { bannerUrl } : {}),
        bannerMediaId,
        ...(bannerAlt !== undefined ? { bannerAlt } : {}),
        magazineLogoMediaId,
        joinPolicy,
        isListedInDirectory,
        classroomCreatePolicy,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "create-thread",
    {
      description:
        "Create a forum thread. Always saved as a draft for the owner to review and publish in their own name — agents never post directly to human community surfaces (ADR-0015). Same rules as the forum form: title 3–255 characters, body up to 10000 characters, category general, question, showcase, or job. An optional image is a media id from upload-image or an http(s) URL, with alt text. Send one of those, not both. Pass communitySlug or communityId to post in that community (it must exist). When both are sent they must name the same community. The owner must have accepted that community's rules. Requires contribute scope. Nothing is public until the owner approves the draft. The response includes the stored body and the slug the thread would publish at.",
      inputSchema: {
        title: z
          .string()
          .min(FORUM_THREAD_TITLE_MIN)
          .max(FORUM_THREAD_TITLE_MAX)
          .describe("Thread title."),
        content: z
          .string()
          .min(1)
          .max(FORUM_THREAD_CONTENT_MAX)
          .describe(
            "Thread body. The same markdown as the forum form: links, **bold**, _italic_, and lists.",
          ),
        category: z
          .enum(["general", "question", "showcase", "job"])
          .default("general")
          .describe("Thread category."),
        communitySlug: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Community slug to post in. Omit both this and communityId for a hub-wide thread.",
          ),
        communityId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Community id to post in. Omit both this and communitySlug for a hub-wide thread.",
          ),
        imageMediaId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Media id from upload-image. Send imageMediaId or imageUrl, not both.",
          ),
        imageUrl: z
          .string()
          .url()
          .optional()
          .describe(
            "http(s) image URL. Send imageMediaId or imageUrl, not both.",
          ),
        imageAlt: z
          .string()
          .max(200)
          .optional()
          .describe("Alt text for the image."),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async ({
      title,
      content,
      category,
      communitySlug,
      communityId,
      imageMediaId,
      imageUrl,
      imageAlt,
    }) => {
      const result = await caller.agent.createThread({
        title,
        content,
        category,
        ...(communitySlug !== undefined ? { communitySlug } : {}),
        ...(communityId !== undefined ? { communityId } : {}),
        ...(imageMediaId !== undefined ? { imageMediaId } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        ...(imageAlt !== undefined ? { imageAlt } : {}),
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "pin-thread",
    {
      description:
        "Pin or unpin a live community forum thread. Requires contribute scope. A deleted thread, a thread whose community has been removed, or a thread that exists only as an agent draft is not live and is not found. The owner must be an active owner, admin, or moderator of that thread's community — the same roles that see Pin in the forum. isPinned false unpins. Threads that are not in a community cannot be pinned with this tool.",
      inputSchema: {
        threadId: z.number().int().positive().describe("The thread id."),
        isPinned: z
          .boolean()
          .describe("True pins the thread. False unpins it."),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ threadId, isPinned }) => {
      const result = await caller.agent.pinThread({ threadId, isPinned });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "get-community-invites",
    {
      description:
        "List active invite links for a community. Requires admin or owner role.",
      inputSchema: {
        slug: z.string().describe("The community slug."),
      },
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const result = await caller.agent.getCommunityInviteLinks({ slug });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "create-community-invite",
    {
      description:
        "Create a new invite link for a community. Optionally set max uses and expiration. Requires admin or owner role.",
      inputSchema: {
        slug: z.string().describe("The community slug."),
        maxUses: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Maximum number of times this invite can be used."),
        expiresInDays: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Number of days until the invite expires."),
      },
      annotations: ADDITIVE_WRITE,
    },
    async ({ slug, maxUses, expiresInDays }) => {
      const result = await caller.agent.createCommunityInviteLink({
        slug,
        maxUses,
        expiresInDays,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "revoke-community-invite",
    {
      description:
        "Revoke (delete) an existing community invite link. Requires admin or owner role.",
      inputSchema: {
        slug: z.string().describe("The community slug."),
        inviteId: z.string().describe("The invite link ID to revoke."),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ slug, inviteId }) => {
      const result = await caller.agent.revokeCommunityInviteLink({
        slug,
        inviteId,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── Community admin ghost mode ──────────────────────────────────────────

  server.registerTool(
    "suggest-ban-member",
    {
      description:
        "Suggest banning a member from a community. Saved for owner review (not executed immediately). Requires admin or owner role.",
      inputSchema: {
        slug: z.string().describe("The community slug."),
        userId: z.string().describe("The user ID of the member to ban."),
        reason: z.string().max(1000).describe("Reason for the ban suggestion."),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async ({ slug, userId, reason }) => {
      const result = await caller.agent.suggestBanMember({
        slug,
        userId,
        reason,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "suggest-remove-member",
    {
      description:
        "Suggest removing a member from a community. Saved for owner review (not executed immediately). Requires admin or owner role.",
      inputSchema: {
        slug: z.string().describe("The community slug."),
        userId: z.string().describe("The user ID of the member to remove."),
        reason: z
          .string()
          .max(1000)
          .describe("Reason for the removal suggestion."),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async ({ slug, userId, reason }) => {
      const result = await caller.agent.suggestRemoveMember({
        slug,
        userId,
        reason,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "suggest-transfer-ownership",
    {
      description:
        "Suggest transferring community ownership to another member. Saved for owner review (not executed immediately). Only the current owner can initiate this.",
      inputSchema: {
        slug: z.string().describe("The community slug."),
        userId: z
          .string()
          .describe("The user ID of the member to transfer ownership to."),
        reason: z
          .string()
          .max(1000)
          .describe("Reason for the ownership transfer suggestion."),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async ({ slug, userId, reason }) => {
      const result = await caller.agent.suggestTransferOwnership({
        slug,
        userId,
        reason,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "suggest-set-member-role",
    {
      description:
        "Suggest changing a member's role in a community. Saved for owner review (not executed immediately). Requires admin or owner role. Cannot set a role higher than your own.",
      inputSchema: {
        slug: z.string().describe("The community slug."),
        userId: z
          .string()
          .describe("The user ID of the member whose role to change."),
        role: z
          .enum(["admin", "moderator", "member"])
          .describe("The new role to assign."),
        reason: z
          .string()
          .max(1000)
          .describe("Reason for the role change suggestion."),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async ({ slug, userId, role, reason }) => {
      const result = await caller.agent.suggestSetMemberRole({
        slug,
        userId,
        role,
        reason,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "list-agent-drafts",
    {
      description:
        "List drafts this API key created. Each row has id, kind, status, slug, and body. Slug is the address the draft would publish at, or null when that kind has no address. Requires read scope. Drafts created by another key are omitted, including another key that belongs to the same owner.",
      inputSchema: {
        status: z
          .enum(["pending", "approved", "rejected", "draft", "published"])
          .optional()
          .describe("Limit to one status. Omit to return every status."),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: READ_ONLY,
    },
    async (input) => {
      const result = await caller.agent.listAgentDrafts(input);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
