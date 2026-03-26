// src/app/api/mcp/community-tools.ts
//
// Registers 16 community MCP tools on the McpServer instance.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";

type Caller = ReturnType<typeof createCaller>;

export function registerCommunityTools(
  server: McpServer,
  caller: Caller,
  _keyData: { ownerId: string | null; agentId: string },
): void {
  // ── Community read ──────────────────────────────────────────────────────

  server.registerTool("browse-communities", {
    description:
      "Browse public communities listed in the directory. Optionally filter by name. Returns community name, slug, description, join policy, and member count.",
    inputSchema: {
      search: z.string().optional().describe("Optional search term to filter communities by name."),
      limit: z.number().min(1).max(50).default(20).describe("Max communities to return."),
    },
  }, async ({ search, limit }) => {
    const result = await caller.agent.browseCommunities({ search, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-community-info", {
    description:
      "Get detailed information about a specific community by slug. Returns settings, member count, and the owner's membership status/role.",
    inputSchema: {
      slug: z.string().describe("The community slug."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.getCommunityInfo({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-owner-communities", {
    description:
      "List all communities the owner belongs to, including their role and membership status in each.",
  }, async () => {
    const result = await caller.agent.getOwnerCommunities();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community membership ────────────────────────────────────────────────

  server.registerTool("join-community", {
    description:
      "Join an open community on behalf of the owner. Only works for communities with an 'open' join policy.",
    inputSchema: {
      slug: z.string().describe("The community slug to join."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.joinCommunity({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("request-to-join-community", {
    description:
      "Request to join a community that requires approval. Creates a pending membership request for community admins to review.",
    inputSchema: {
      slug: z.string().describe("The community slug to request membership in."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.requestToJoinCommunity({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("leave-community", {
    description:
      "Leave a community on behalf of the owner. Cannot leave if the owner is the last owner — transfer ownership first.",
    inputSchema: {
      slug: z.string().describe("The community slug to leave."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.leaveCommunity({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("accept-community-invite", {
    description:
      "Accept a community invite link on behalf of the owner. Uses the invite code to join the community.",
    inputSchema: {
      code: z.string().describe("The invite code (from the invite link)."),
    },
  }, async ({ code }) => {
    const result = await caller.agent.acceptCommunityInvite({ code });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community creation ──────────────────────────────────────────────────

  server.registerTool("create-community", {
    description:
      "Create a new community on behalf of the owner. The owner becomes the community owner automatically.",
    inputSchema: {
      name: z.string().min(2).max(100).describe("Community name (2-100 characters)."),
      description: z.string().max(500).optional().describe("Community description (max 500 characters)."),
      joinPolicy: z
        .enum(["open", "invite_only", "approval_required"])
        .default("open")
        .describe("Who can join: open, invite_only, or approval_required."),
      isListedInDirectory: z.boolean().default(false).describe("Whether the community appears in the public directory."),
    },
  }, async ({ name, description, joinPolicy, isListedInDirectory }) => {
    const result = await caller.agent.createCommunity({ name, description, joinPolicy, isListedInDirectory });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community admin ─────────────────────────────────────────────────────

  server.registerTool("update-community-settings", {
    description:
      "Update community settings such as name, description, logo, join policy, and directory listing. Requires admin or owner role.",
    inputSchema: {
      slug: z.string().describe("The community slug to update."),
      name: z.string().min(2).max(100).optional().describe("New community name."),
      description: z.string().max(500).optional().describe("New community description."),
      logoUrl: z.string().url().optional().nullable().describe("New logo URL, or null to remove."),
      joinPolicy: z
        .enum(["open", "invite_only", "approval_required"])
        .optional()
        .describe("New join policy."),
      isListedInDirectory: z.boolean().optional().describe("Whether to list in the public directory."),
    },
  }, async ({ slug, name, description, logoUrl, joinPolicy, isListedInDirectory }) => {
    const result = await caller.agent.updateCommunitySettings({ slug, name, description, logoUrl, joinPolicy, isListedInDirectory });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-community-invites", {
    description:
      "List active invite links for a community. Requires admin or owner role.",
    inputSchema: {
      slug: z.string().describe("The community slug."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.getCommunityInviteLinks({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("create-community-invite", {
    description:
      "Create a new invite link for a community. Optionally set max uses and expiration. Requires admin or owner role.",
    inputSchema: {
      slug: z.string().describe("The community slug."),
      maxUses: z.number().int().positive().optional().describe("Maximum number of times this invite can be used."),
      expiresInDays: z.number().int().positive().optional().describe("Number of days until the invite expires."),
    },
  }, async ({ slug, maxUses, expiresInDays }) => {
    const result = await caller.agent.createCommunityInviteLink({ slug, maxUses, expiresInDays });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("revoke-community-invite", {
    description:
      "Revoke (delete) an existing community invite link. Requires admin or owner role.",
    inputSchema: {
      slug: z.string().describe("The community slug."),
      inviteId: z.string().describe("The invite link ID to revoke."),
    },
  }, async ({ slug, inviteId }) => {
    const result = await caller.agent.revokeCommunityInviteLink({ slug, inviteId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community admin ghost mode ──────────────────────────────────────────

  server.registerTool("suggest-ban-member", {
    description:
      "Suggest banning a member from a community. Saved for owner review (not executed immediately). Requires admin or owner role.",
    inputSchema: {
      slug: z.string().describe("The community slug."),
      userId: z.string().describe("The user ID of the member to ban."),
      reason: z.string().max(1000).describe("Reason for the ban suggestion."),
    },
  }, async ({ slug, userId, reason }) => {
    const result = await caller.agent.suggestBanMember({ slug, userId, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("suggest-remove-member", {
    description:
      "Suggest removing a member from a community. Saved for owner review (not executed immediately). Requires admin or owner role.",
    inputSchema: {
      slug: z.string().describe("The community slug."),
      userId: z.string().describe("The user ID of the member to remove."),
      reason: z.string().max(1000).describe("Reason for the removal suggestion."),
    },
  }, async ({ slug, userId, reason }) => {
    const result = await caller.agent.suggestRemoveMember({ slug, userId, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("suggest-transfer-ownership", {
    description:
      "Suggest transferring community ownership to another member. Saved for owner review (not executed immediately). Only the current owner can initiate this.",
    inputSchema: {
      slug: z.string().describe("The community slug."),
      userId: z.string().describe("The user ID of the member to transfer ownership to."),
      reason: z.string().max(1000).describe("Reason for the ownership transfer suggestion."),
    },
  }, async ({ slug, userId, reason }) => {
    const result = await caller.agent.suggestTransferOwnership({ slug, userId, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("suggest-set-member-role", {
    description:
      "Suggest changing a member's role in a community. Saved for owner review (not executed immediately). Requires admin or owner role. Cannot set a role higher than your own.",
    inputSchema: {
      slug: z.string().describe("The community slug."),
      userId: z.string().describe("The user ID of the member whose role to change."),
      role: z.enum(["admin", "moderator", "member"]).describe("The new role to assign."),
      reason: z.string().max(1000).describe("Reason for the role change suggestion."),
    },
  }, async ({ slug, userId, role, reason }) => {
    const result = await caller.agent.suggestSetMemberRole({ slug, userId, role, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
}
