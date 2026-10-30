import { TRPCError } from "@trpc/server";
import { expect, it } from "vitest";

import {
  assertThreadCommunity,
  forumThreadDraftMeta,
} from "./forum-thread-draft";

const community = {
  id: "community-1",
  slug: "chinese-together",
  name: "Chinese Together",
};

it("accepts a community id, a slug, or both when they match", () => {
  expect(assertThreadCommunity({}, null)).toBeUndefined();
  expect(
    assertThreadCommunity({ communityId: community.id }, community),
  ).toEqual(community);
  expect(
    assertThreadCommunity({ communitySlug: community.slug }, community),
  ).toEqual(community);
  expect(
    assertThreadCommunity(
      { communityId: community.id, communitySlug: community.slug },
      community,
    ),
  ).toEqual(community);
  expect(
    forumThreadDraftMeta({
      title: "Welcome",
      content: "Hello",
      category: "general",
      communityId: community.id,
      communitySlug: community.slug,
      communityName: community.name,
    }),
  ).toMatchObject({
    communityId: community.id,
    communitySlug: community.slug,
    destinationPath: "/communities/chinese-together/forum",
  });
});

it("refuses a missing community and an id that does not match the slug", () => {
  expect(() => assertThreadCommunity({ communityId: "missing" }, null)).toThrow(
    TRPCError,
  );
  try {
    assertThreadCommunity(
      { communityId: community.id, communitySlug: "other" },
      community,
    );
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).message).toBe(
      "That community id does not match the slug.",
    );
  }
});
