import { expect, it, vi } from "vitest";

import {
  applyApprovedMagazineDelete,
  proposeMagazineDelete,
} from "./magazine-delete";

it("queues a delete draft and does not delete the document", async () => {
  const inserted: unknown[] = [];
  const payload = {
    delete: vi.fn(),
    update: vi.fn(),
  };
  const db = {
    query: {
      communityMemberships: {
        findFirst: async () => ({ role: "member", status: "active" }),
      },
      magazineStaff: {
        findFirst: async () => ({ role: "editor" }),
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [{ userId: "community-owner" }],
          }),
        }),
      }),
    }),
    insert: () => ({
      values: async (row: unknown) => {
        inserted.push(row);
      },
    }),
  };

  const result = await proposeMagazineDelete(
    { db, payload } as never,
    { agentId: "agent-1", ownerId: "editor-human" },
    {
      collection: "magazine-issues",
      id: 7,
      magazineId: 3,
      magazineSlug: "town",
      communityId: "c1",
      communitySlug: "town",
      title: "Issue 7",
    },
  );

  expect(result.review).toBe("pending");
  expect(payload.delete).not.toHaveBeenCalled();
  expect(payload.update).not.toHaveBeenCalled();
  const draft = inserted[0] as {
    type: string;
    ownerId: string;
    status: string;
    metadata: { kind: string };
  };
  expect(draft.type).toBe("delete");
  expect(draft.ownerId).toBe("community-owner");
  expect(draft.status).toBe("pending");
  expect(draft.metadata.kind).toBe("delete");
});

it("hard-deletes an article on approval because the schema has no deleted flag", async () => {
  const payload = {
    delete: vi.fn(async () => undefined),
    update: vi.fn(),
    count: vi.fn(async () => ({ totalDocs: 0 })),
  };
  const mode = await applyApprovedMagazineDelete(payload as never, {
    collection: "articles",
    id: 12,
    communityId: "c1",
  });
  expect(mode).toBe("hard");
  expect(payload.delete).toHaveBeenCalledWith({
    collection: "articles",
    id: 12,
  });
  expect(payload.update).not.toHaveBeenCalled();
});
