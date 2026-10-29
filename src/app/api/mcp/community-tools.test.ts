import { expect, it, vi } from "vitest";

import { COMMUNITY_DESCRIPTION_MAX } from "@/lib/communities/description";
import { TOOL_META } from "@/server/mcp/catalog-meta";
import {
  DESTRUCTIVE_WRITE,
  DRAFT_FOR_REVIEW,
  READ_ONLY,
} from "@/server/mcp/tool-annotations";

import { registerCommunityTools } from "./community-tools";

it("registers community thread tools and image settings on the existing procedures", async () => {
  const tools = new Map<
    string,
    {
      config: {
        description?: string;
        annotations?: unknown;
        inputSchema?: Record<
          string,
          { safeParse: (value: unknown) => { success: boolean } }
        >;
      };
      run: (input: never) => Promise<unknown>;
    }
  >();
  const server = {
    registerTool: (
      name: string,
      config: {
        description?: string;
        annotations?: unknown;
      },
      run: (input: never) => Promise<unknown>,
    ) => tools.set(name, { config, run }),
  };
  const caller = {
    agent: {
      getCommunityInfo: vi.fn().mockResolvedValue({
        description: "stay f",
        descriptionTruncated: false,
      }),
      createThread: vi.fn().mockResolvedValue({
        mode: "draft",
        draftId: "draft-1",
      }),
      createCommunity: vi.fn().mockResolvedValue({ slug: "makers" }),
      pinThread: vi.fn().mockResolvedValue({ ok: true, isPinned: false }),
      updateCommunitySettings: vi.fn().mockResolvedValue({
        bannerUrl: "https://cdn.example.test/banner.png",
        magazineLogoUrl: "https://cdn.example.test/logo.png",
      }),
    },
  };
  registerCommunityTools(server as never, caller as never, {
    ownerId: "owner-1",
    agentId: "agent-1",
  });

  expect(tools.has("upload-image")).toBe(false);
  expect(TOOL_META["create-thread"]).toEqual({
    surface: "forum",
    gate: "contribute",
  });
  expect(TOOL_META["pin-thread"]).toEqual({
    surface: "forum",
    gate: "contribute",
  });
  expect(tools.get("create-thread")!.config.annotations).toEqual(
    DRAFT_FOR_REVIEW,
  );
  expect(tools.get("create-thread")!.config.description).toContain(
    "saved as a draft",
  );
  expect(tools.get("create-thread")!.config.description).not.toContain(
    "posted immediately",
  );
  expect(tools.get("pin-thread")!.config.description).toContain("live");
  expect(tools.get("pin-thread")!.config.annotations).toEqual(
    DESTRUCTIVE_WRITE,
  );
  expect(tools.get("get-community-info")!.config.annotations).toEqual(
    READ_ONLY,
  );
  expect(tools.get("get-community-info")!.config.description).toContain(
    "full stored description",
  );
  expect(tools.get("update-community-settings")!.config.description).toContain(
    "warning",
  );
  expect(TOOL_META["list-agent-drafts"]).toEqual({
    surface: "sessions",
    gate: "read",
  });

  const info = await tools.get("get-community-info")!.run({
    slug: "owner-to-owner",
  } as never);
  expect(caller.agent.getCommunityInfo).toHaveBeenCalledWith({
    slug: "owner-to-owner",
  });
  expect(info).toMatchObject({
    content: [
      { text: expect.stringContaining('"descriptionTruncated": false') },
    ],
  });

  await tools.get("create-thread")!.run({
    title: "Hello there",
    content: "A full thread body.",
    category: "question",
    communitySlug: "makers",
  } as never);
  expect(caller.agent.createThread).toHaveBeenCalledWith({
    title: "Hello there",
    content: "A full thread body.",
    category: "question",
    communitySlug: "makers",
  });
  await tools.get("create-thread")!.run({
    title: "Hello there",
    content: "A full thread body.",
    category: "question",
    communityId: "community-1",
  } as never);
  expect(caller.agent.createThread).toHaveBeenCalledWith({
    title: "Hello there",
    content: "A full thread body.",
    category: "question",
    communityId: "community-1",
  });
  await tools.get("create-community")!.run({
    name: "Makers",
    logoUrl: "https://cdn.example/logo.png",
  } as never);
  expect(caller.agent.createCommunity).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Makers",
      logoUrl: "https://cdn.example/logo.png",
    }),
  );

  await tools.get("pin-thread")!.run({
    threadId: 9,
    isPinned: false,
  } as never);
  expect(caller.agent.pinThread).toHaveBeenCalledWith({
    threadId: 9,
    isPinned: false,
  });

  await tools.get("update-community-settings")!.run({
    slug: "makers",
    logoMediaId: 8,
    bannerMediaId: 3,
    magazineLogoMediaId: 4,
  } as never);
  expect(caller.agent.updateCommunitySettings).toHaveBeenCalledWith({
    slug: "makers",
    logoMediaId: 8,
    bannerMediaId: 3,
    magazineLogoMediaId: 4,
  });
  const logoMediaId = tools.get("update-community-settings")!.config.inputSchema
    ?.logoMediaId;
  expect(logoMediaId?.safeParse(8).success).toBe(true);
  expect(logoMediaId?.safeParse(null).success).toBe(true);

  const description = tools.get("update-community-settings")!.config.inputSchema
    ?.description;
  expect(
    description?.safeParse("a".repeat(COMMUNITY_DESCRIPTION_MAX)).success,
  ).toBe(true);
  expect(
    description?.safeParse("a".repeat(COMMUNITY_DESCRIPTION_MAX + 1)).success,
  ).toBe(false);
});
